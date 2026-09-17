package controller

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type forumDeskMock struct {
	mu             sync.Mutex
	requests       []*http.Request
	bodies         [][]byte
	createHits     atomic.Int32
	sendHits       atomic.Int32
	listHits       atomic.Int32
	apiKey         string
	visitorToken   string
	conversationID string
	mode           string
}

func newForumDeskTestEnv(t *testing.T, mock *forumDeskMock) (*gin.Engine, *model.User, *model.User, *httptest.Server) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	previousDB := model.DB
	db, err := gorm.Open(sqlite.Open("file:forumdesk-"+strings.ReplaceAll(t.Name(), "/", "_")+"?mode=memory&cache=shared"), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.ForumDeskSession{}))
	model.DB = db
	t.Cleanup(func() { model.DB = previousDB })

	owner := &model.User{Username: "support-owner", Password: "unused-password", DisplayName: "Alice", Email: "alice@example.com", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Group: "default", AffCode: "affown"}
	intruder := &model.User{Username: "support-intruder", Password: "unused-password", DisplayName: "Bob", Email: "bob@example.com", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Group: "default", AffCode: "affint"}
	require.NoError(t, db.Create(owner).Error)
	require.NoError(t, db.Create(intruder).Error)

	if mock.apiKey == "" {
		mock.apiKey = "test-forumdesk-api-key-value"
	}
	if mock.visitorToken == "" {
		mock.visitorToken = "wv_test_visitor_token_value_123456"
	}
	if mock.conversationID == "" {
		mock.conversationID = "wc_owned_conversation"
	}

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		mock.mu.Lock()
		cloned := r.Clone(r.Context())
		mock.requests = append(mock.requests, cloned)
		mock.bodies = append(mock.bodies, body)
		mock.mu.Unlock()

		switch mock.mode {
		case "down":
			w.WriteHeader(http.StatusBadGateway)
			_, _ = w.Write([]byte(`{"error":{"message":"bad gateway"}}`))
			return
		case "rate":
			w.Header().Set("Retry-After", "9")
			w.WriteHeader(http.StatusTooManyRequests)
			_, _ = w.Write([]byte(`{"error":{"message":"slow down"}}`))
			return
		case "unauthorized":
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"error":{"code":"unauthorized","message":"Invalid conversation credentials"}}`))
			return
		}

		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/api/v1/conversations":
			mock.createHits.Add(1)
			require.Equal(t, "Bearer "+mock.apiKey, r.Header.Get("Authorization"))
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusCreated)
			_, _ = io.WriteString(w, `{"data":{"id":"`+mock.conversationID+`","status":"open","visitor_token":"`+mock.visitorToken+`"}}`)
		case r.Method == http.MethodPost && strings.Contains(r.URL.Path, "/messages"):
			mock.sendHits.Add(1)
			require.Equal(t, "Bearer "+mock.visitorToken, r.Header.Get("Authorization"))
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusCreated)
			if bytes.Contains(body, []byte("reply_to_message_id")) {
				_, _ = io.WriteString(w, `{"data":{"id":"wm_reply","direction":"customer","text":"quoted","reply_to_message_id":"wm_parent"}}`)
				return
			}
			_, _ = io.WriteString(w, `{"data":{"id":"wm_plain","direction":"customer","text":"hello"}}`)
		case r.Method == http.MethodGet && strings.Contains(r.URL.Path, "/messages"):
			mock.listHits.Add(1)
			require.Equal(t, "Bearer "+mock.visitorToken, r.Header.Get("Authorization"))
			w.Header().Set("Content-Type", "application/json")
			if r.URL.Query().Get("after") == "" {
				_, _ = io.WriteString(w, `{"data":[{"id":"wm_plain","direction":"customer","text":"hello","visible":true}],"meta":{"next_cursor":1}}`)
				return
			}
			_, _ = io.WriteString(w, `{"data":[{"event":"message_hidden","target_message_id":"wm_plain"},{"id":"wm_staff","direction":"staff","staff_name":"Desk","text":"hi","reply_to_message_id":"wm_plain"}],"meta":{"next_cursor":2}}`)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(upstream.Close)

	previousClient := service.GetForumDeskClient()
	service.SetForumDeskClient(service.NewForumDeskClient(upstream.URL, mock.apiKey, upstream.Client()))
	t.Cleanup(func() { service.SetForumDeskClient(previousClient) })

	router := gin.New()
	router.POST("/api/support/conversations", func(c *gin.Context) {
		c.Set("id", owner.Id)
		CreateSupportConversation(c)
	})
	router.POST("/api/support/conversations/:conversation_id/messages", func(c *gin.Context) {
		c.Set("id", c.GetInt("test_user_id"))
		if c.GetInt("test_user_id") == 0 {
			c.Set("id", owner.Id)
		}
		SendSupportMessage(c)
	})
	router.GET("/api/support/conversations/:conversation_id/messages", func(c *gin.Context) {
		c.Set("id", c.GetInt("test_user_id"))
		if c.GetInt("test_user_id") == 0 {
			c.Set("id", owner.Id)
		}
		GetSupportMessages(c)
	})
	return router, owner, intruder, upstream
}

func TestCreateSupportConversationPersistsTokenAndHidesSecrets(t *testing.T) {
	mock := &forumDeskMock{}
	router, owner, _, _ := newForumDeskTestEnv(t, mock)

	req := httptest.NewRequest(http.MethodPost, "/api/support/conversations", strings.NewReader(`{"page_url":"https://example.com/app"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	assert.NotContains(t, rec.Body.String(), mock.visitorToken)
	assert.NotContains(t, rec.Body.String(), mock.apiKey)
	var payload struct {
		Success bool `json:"success"`
		Data    struct {
			ConversationID string `json:"conversation_id"`
			VisitorToken   string `json:"visitor_token"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &payload))
	assert.True(t, payload.Success)
	assert.Equal(t, mock.conversationID, payload.Data.ConversationID)
	assert.Empty(t, payload.Data.VisitorToken)

	session, err := model.GetForumDeskSessionByUserId(owner.Id)
	require.NoError(t, err)
	require.NotNil(t, session)
	assert.Equal(t, mock.visitorToken, session.VisitorToken)
	assert.Equal(t, int32(1), mock.createHits.Load())
	assert.NotContains(t, session.String(), mock.visitorToken)

	// Reuse persisted conversation instead of creating another upstream session.
	rec2 := httptest.NewRecorder()
	router.ServeHTTP(rec2, httptest.NewRequest(http.MethodPost, "/api/support/conversations", strings.NewReader(`{"page_url":"https://example.com/app"}`)))
	assert.Equal(t, int32(1), mock.createHits.Load())
}

func TestSendSupportMessagePlainAndQuote(t *testing.T) {
	mock := &forumDeskMock{}
	router, owner, _, _ := newForumDeskTestEnv(t, mock)
	require.NoError(t, seedSupportSession(owner.Id, mock))

	plain := httptest.NewRequest(http.MethodPost, "/api/support/conversations/"+mock.conversationID+"/messages", strings.NewReader(`{"text":"hello"}`))
	plain.Header.Set("Content-Type", "application/json")
	plainRec := httptest.NewRecorder()
	router.ServeHTTP(plainRec, plain)
	require.Equal(t, http.StatusOK, plainRec.Code)
	assert.Contains(t, plainRec.Body.String(), `"wm_plain"`)
	assert.NotContains(t, plainRec.Body.String(), mock.visitorToken)

	quote := httptest.NewRequest(http.MethodPost, "/api/support/conversations/"+mock.conversationID+"/messages", strings.NewReader(`{"text":"quoted","reply_to_message_id":"wm_parent"}`))
	quote.Header.Set("Content-Type", "application/json")
	quoteRec := httptest.NewRecorder()
	router.ServeHTTP(quoteRec, quote)
	require.Equal(t, http.StatusOK, quoteRec.Code)
	assert.Contains(t, quoteRec.Body.String(), `"wm_parent"`)
	assert.Equal(t, int32(2), mock.sendHits.Load())
	require.GreaterOrEqual(t, len(mock.bodies), 2)
	assert.Contains(t, string(mock.bodies[len(mock.bodies)-1]), `"reply_to_message_id":"wm_parent"`)
}

func TestGetSupportMessagesCursorAndHiddenEvent(t *testing.T) {
	mock := &forumDeskMock{}
	router, owner, _, _ := newForumDeskTestEnv(t, mock)
	require.NoError(t, seedSupportSession(owner.Id, mock))

	first := httptest.NewRecorder()
	router.ServeHTTP(first, httptest.NewRequest(http.MethodGet, "/api/support/conversations/"+mock.conversationID+"/messages?limit=50", nil))
	require.Equal(t, http.StatusOK, first.Code)
	var firstPayload struct {
		Data struct {
			Items      []map[string]any `json:"items"`
			NextCursor string           `json:"next_cursor"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(first.Body.Bytes(), &firstPayload))
	assert.Equal(t, "1", firstPayload.Data.NextCursor)
	require.NotEmpty(t, firstPayload.Data.Items)

	second := httptest.NewRecorder()
	router.ServeHTTP(second, httptest.NewRequest(http.MethodGet, "/api/support/conversations/"+mock.conversationID+"/messages?after=1&limit=50", nil))
	require.Equal(t, http.StatusOK, second.Code)
	assert.Contains(t, second.Body.String(), `"event":"message_hidden"`)
	assert.Contains(t, second.Body.String(), `"target_message_id":"wm_plain"`)
	assert.NotContains(t, second.Body.String(), `"staff_name"`)
	assert.NotContains(t, second.Body.String(), "Desk")
	assert.NotContains(t, second.Body.String(), mock.visitorToken)
	assert.Equal(t, int32(2), mock.listHits.Load())
}

func TestSupportConversationRejectsCrossUserAccess(t *testing.T) {
	mock := &forumDeskMock{}
	_, owner, intruder, _ := newForumDeskTestEnv(t, mock)
	require.NoError(t, seedSupportSession(owner.Id, mock))

	router := gin.New()
	router.GET("/api/support/conversations/:conversation_id/messages", func(c *gin.Context) {
		c.Set("id", intruder.Id)
		GetSupportMessages(c)
	})
	router.POST("/api/support/conversations/:conversation_id/messages", func(c *gin.Context) {
		c.Set("id", intruder.Id)
		SendSupportMessage(c)
	})

	getRec := httptest.NewRecorder()
	router.ServeHTTP(getRec, httptest.NewRequest(http.MethodGet, "/api/support/conversations/"+mock.conversationID+"/messages", nil))
	assert.Equal(t, http.StatusForbidden, getRec.Code)
	assert.Contains(t, getRec.Body.String(), service.ForumDeskCodeForbidden)
	assert.Equal(t, int32(0), mock.listHits.Load())

	postRec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/support/conversations/"+mock.conversationID+"/messages", strings.NewReader(`{"text":"nope"}`))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(postRec, req)
	assert.Equal(t, http.StatusForbidden, postRec.Code)
	assert.Equal(t, int32(0), mock.sendHits.Load())
}

func TestSupportConversationUpstreamUnavailableAndRateLimit(t *testing.T) {
	t.Run("unavailable", func(t *testing.T) {
		mock := &forumDeskMock{mode: "down"}
		router, _, _, _ := newForumDeskTestEnv(t, mock)
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/api/support/conversations", strings.NewReader(`{"page_url":"https://example.com/"}`))
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusBadGateway, rec.Code)
		assert.Contains(t, rec.Body.String(), service.ForumDeskCodeUnavailable)
		assert.NotContains(t, rec.Body.String(), mock.apiKey)
	})

	t.Run("rate limited", func(t *testing.T) {
		mock := &forumDeskMock{mode: "rate"}
		router, _, _, _ := newForumDeskTestEnv(t, mock)
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/api/support/conversations", strings.NewReader(`{"page_url":"https://example.com/"}`))
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusTooManyRequests, rec.Code)
		assert.Equal(t, "9", rec.Header().Get("Retry-After"))
		assert.Contains(t, rec.Body.String(), service.ForumDeskCodeRateLimited)
		assert.Contains(t, rec.Body.String(), `"retry_after":9`)
		assert.Equal(t, int32(1), mock.createHits.Load()+int32(len(mock.requests)))
		assert.Len(t, mock.requests, 1, "must not retry 429")
	})
}

func TestSupportConversationDialFailure(t *testing.T) {
	previousDB := model.DB
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.ForumDeskSession{}))
	model.DB = db
	t.Cleanup(func() { model.DB = previousDB })

	user := &model.User{Username: "support-offline", Password: "unused-password", DisplayName: "Offline", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Group: "default", AffCode: "aff-offline"}
	require.NoError(t, db.Create(user).Error)

	previousClient := service.GetForumDeskClient()
	service.SetForumDeskClient(service.NewForumDeskClient("http://127.0.0.1:1", "test-key", &http.Client{}))
	t.Cleanup(func() { service.SetForumDeskClient(previousClient) })

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/api/support/conversations", func(c *gin.Context) {
		c.Set("id", user.Id)
		CreateSupportConversation(c)
	})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/support/conversations", strings.NewReader(`{"page_url":"https://example.com/"}`))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusBadGateway, rec.Code)
	assert.Contains(t, rec.Body.String(), service.ForumDeskCodeUnavailable)
}

func seedSupportSession(userId int, mock *forumDeskMock) error {
	_, err := model.UpsertForumDeskSession(userId, mock.conversationID, mock.visitorToken)
	return err
}
