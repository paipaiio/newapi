package service

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMaskForumDeskSecret(t *testing.T) {
	t.Parallel()
	assert.Equal(t, "", MaskForumDeskSecret(""))
	assert.Equal(t, "********", MaskForumDeskSecret("short"))
	masked := MaskForumDeskSecret("404c02946444a86a3216c31442d22dd2")
	assert.True(t, strings.HasPrefix(masked, "404c"))
	assert.True(t, strings.HasSuffix(masked, "2dd2"))
	assert.NotContains(t, masked, "02946444a86a3216c314")
}

func TestForumDeskClientCreateSendListAndHidden(t *testing.T) {
	t.Parallel()
	apiKey := "test-forumdesk-api-key-value"
	visitorToken := "wv_test_visitor_token_value_123456"
	var createHits, sendHits, listHits atomic.Int32

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/api/v1/conversations":
			createHits.Add(1)
			require.Equal(t, "Bearer "+apiKey, auth)
			require.NotContains(t, auth, visitorToken)
			var body map[string]string
			require.NoError(t, json.NewDecoder(r.Body).Decode(&body))
			assert.Equal(t, "Alice", body["visitor_name"])
			assert.Equal(t, "alice@example.com", body["email"])
			assert.Equal(t, "42", body["external_id"])
			assert.Equal(t, "https://example.com/console", body["page_url"])
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusCreated)
			_, _ = w.Write([]byte(`{"data":{"id":"wc_test_1","status":"open","visitor_token":"` + visitorToken + `"}}`))
		case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/messages"):
			sendHits.Add(1)
			require.Equal(t, "Bearer "+visitorToken, auth)
			require.NotContains(t, auth, apiKey)
			var body map[string]string
			require.NoError(t, json.NewDecoder(r.Body).Decode(&body))
			if body["reply_to_message_id"] != "" {
				assert.Equal(t, "wm_parent", body["reply_to_message_id"])
				assert.Equal(t, "quoted reply", body["text"])
				w.WriteHeader(http.StatusCreated)
				_, _ = w.Write([]byte(`{"data":{"id":"wm_reply","direction":"customer","text":"quoted reply","reply_to_message_id":"wm_parent"}}`))
				return
			}
			assert.Equal(t, "hello", body["text"])
			w.WriteHeader(http.StatusCreated)
			_, _ = w.Write([]byte(`{"data":{"id":"wm_1","direction":"customer","text":"hello"}}`))
		case r.Method == http.MethodGet && strings.HasSuffix(r.URL.Path, "/messages"):
			listHits.Add(1)
			require.Equal(t, "Bearer "+visitorToken, auth)
			after := r.URL.Query().Get("after")
			w.Header().Set("Content-Type", "application/json")
			if after == "" {
				_, _ = w.Write([]byte(`{"data":[{"id":"wm_1","direction":"customer","text":"hello","visible":true}],"meta":{"next_cursor":1}}`))
				return
			}
			assert.Equal(t, "1", after)
			_, _ = w.Write([]byte(`{"data":[{"event":"message_hidden","target_message_id":"wm_1"},{"id":"wm_2","direction":"staff","text":"hi","staff_name":"Support"}],"meta":{"next_cursor":2}}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	client := NewForumDeskClient(server.URL, apiKey, server.Client())
	ctx := context.Background()

	created, err := client.CreateConversation(ctx, ForumDeskCreateConversationRequest{
		VisitorName: "Alice",
		Email:       "alice@example.com",
		ExternalID:  "42",
		PageURL:     "https://example.com/console",
	})
	require.NoError(t, err)
	require.Equal(t, "wc_test_1", created.ID)
	require.Equal(t, visitorToken, created.VisitorToken)

	sent, err := client.SendMessage(ctx, created.ID, visitorToken, ForumDeskSendMessageRequest{Text: "hello"})
	require.NoError(t, err)
	assert.Equal(t, "wm_1", sent.ID)

	quoted, err := client.SendMessage(ctx, created.ID, visitorToken, ForumDeskSendMessageRequest{Text: "quoted reply", ReplyToMessageID: "wm_parent"})
	require.NoError(t, err)
	assert.Equal(t, "wm_parent", quoted.ReplyToMessageID)

	first, err := client.ListMessages(ctx, created.ID, visitorToken, "", 50)
	require.NoError(t, err)
	assert.Equal(t, "1", first.NextCursor)
	require.Len(t, first.Items, 1)

	second, err := client.ListMessages(ctx, created.ID, visitorToken, first.NextCursor, 50)
	require.NoError(t, err)
	assert.Equal(t, "2", second.NextCursor)
	require.Len(t, second.Items, 2)
	assert.Equal(t, "message_hidden", second.Items[0].Event)
	assert.Equal(t, "wm_1", second.Items[0].TargetMessageID)
	assert.Equal(t, "staff", second.Items[1].Direction)
	assert.Equal(t, "Support", second.Items[1].StaffName)

	assert.Equal(t, int32(1), createHits.Load())
	assert.Equal(t, int32(2), sendHits.Load())
	assert.Equal(t, int32(2), listHits.Load())
}

func TestForumDeskClientMapsUpstreamErrorsWithoutRetry(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name       string
		status     int
		body       string
		retryAfter string
		wantCode   string
		wantHTTP   int
		wantRetry  int
	}{
		{"401", http.StatusUnauthorized, `{"error":{"code":"unauthorized","message":"Invalid integration API key"}}`, "", ForumDeskCodeUnauthorized, http.StatusOK, 0},
		{"422", http.StatusUnprocessableEntity, `{"error":{"code":"validation_error","message":"text must contain 1 to 4000 characters"}}`, "", ForumDeskCodeValidation, http.StatusUnprocessableEntity, 0},
		{"429", http.StatusTooManyRequests, `{"error":{"message":"slow down"}}`, "7", ForumDeskCodeRateLimited, http.StatusTooManyRequests, 7},
		{"502", http.StatusBadGateway, `{"error":{"message":"bad gateway"}}`, "", ForumDeskCodeUnavailable, http.StatusBadGateway, 0},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			var hits atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				hits.Add(1)
				if tc.retryAfter != "" {
					w.Header().Set("Retry-After", tc.retryAfter)
				}
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte(tc.body))
			}))
			defer server.Close()

			client := NewForumDeskClient(server.URL, "test-key", server.Client())
			_, err := client.CreateConversation(context.Background(), ForumDeskCreateConversationRequest{VisitorName: "Bob"})
			require.Error(t, err)
			mapped := ForumDeskErrorFrom(err)
			assert.Equal(t, tc.wantCode, mapped.Code)
			assert.Equal(t, tc.wantHTTP, mapped.HTTPStatus)
			assert.Equal(t, tc.wantRetry, mapped.RetryAfter)
			assert.Equal(t, int32(1), hits.Load(), "must not retry upstream errors")
			assert.NotContains(t, mapped.Error(), "test-key")
		})
	}
}

func TestForumDeskClientUnavailableOnDialFailure(t *testing.T) {
	t.Parallel()
	client := NewForumDeskClient("http://127.0.0.1:1", "test-key", &http.Client{Timeout: 200 * time.Millisecond})
	err := client.Healthz(context.Background())
	require.Error(t, err)
	mapped := ForumDeskErrorFrom(err)
	assert.Equal(t, ForumDeskCodeUnavailable, mapped.Code)
	assert.Equal(t, http.StatusBadGateway, mapped.HTTPStatus)
}

func TestSanitizeForumDeskErrorMasksAPIKey(t *testing.T) {
	t.Parallel()
	common.ForumDeskAPIKey = "super-secret-forumdesk-key"
	t.Cleanup(func() { common.ForumDeskAPIKey = "" })
	got := sanitizeForumDeskError(io.EOF)
	assert.NotContains(t, got, "super-secret-forumdesk-key")
}

func TestParseForumDeskCursor(t *testing.T) {
	t.Parallel()
	assert.Equal(t, "1", parseForumDeskCursor([]byte(`1`)))
	assert.Equal(t, "abc", parseForumDeskCursor([]byte(`"abc"`)))
	assert.Equal(t, "", parseForumDeskCursor([]byte(`null`)))
}
