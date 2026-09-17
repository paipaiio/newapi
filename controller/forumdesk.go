package controller

import (
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

const (
	supportMessageMaxLen = 4000
	supportPageURLMaxLen = 2000
	supportDefaultLimit  = 50
)

type createSupportConversationRequest struct {
	PageURL string `json:"page_url"`
}

type sendSupportMessageRequest struct {
	Text             string `json:"text"`
	ReplyToMessageID string `json:"reply_to_message_id"`
}

type supportConversationResponse struct {
	ConversationID string `json:"conversation_id"`
}

type supportMessageListResponse struct {
	Items      []service.ForumDeskItem `json:"items"`
	NextCursor string                  `json:"next_cursor"`
}

func CreateSupportConversation(c *gin.Context) {
	userId := c.GetInt("id")
	if userId <= 0 {
		common.ApiErrorI18n(c, i18n.MsgUnauthorized)
		return
	}
	client := service.GetForumDeskClient()
	if client == nil || !client.Configured() {
		writeSupportError(c, &service.ForumDeskError{
			HTTPStatus: http.StatusOK,
			Code:       service.ForumDeskCodeNotConfigured,
			MessageKey: i18n.MsgForumDeskNotConfigured,
		})
		return
	}

	existing, err := model.GetForumDeskSessionByUserId(userId)
	if err != nil {
		common.ApiErrorI18n(c, i18n.MsgDatabaseError)
		return
	}
	if existing != nil && existing.ConversationID != "" {
		common.ApiSuccess(c, supportConversationResponse{ConversationID: existing.ConversationID})
		return
	}

	var req createSupportConversationRequest
	if c.Request.Body != nil && c.Request.ContentLength != 0 {
		if err := common.DecodeJson(c.Request.Body, &req); err != nil {
			common.ApiErrorI18n(c, i18n.MsgInvalidParams)
			return
		}
	}

	user, err := model.GetUserById(userId, false)
	if err != nil {
		common.ApiErrorI18n(c, i18n.MsgDatabaseError)
		return
	}

	visitorName := strings.TrimSpace(user.DisplayName)
	if visitorName == "" {
		visitorName = strings.TrimSpace(user.Username)
	}
	created, err := client.CreateConversation(c.Request.Context(), service.ForumDeskCreateConversationRequest{
		VisitorName: visitorName,
		Email:       strings.TrimSpace(user.Email),
		ExternalID:  strconv.Itoa(user.Id),
		PageURL:     sanitizeSupportPageURL(req.PageURL),
	})
	if err != nil {
		writeSupportError(c, service.ForumDeskErrorFrom(err))
		return
	}

	session, err := model.UpsertForumDeskSession(userId, created.ID, created.VisitorToken)
	if err != nil {
		common.ApiErrorI18n(c, i18n.MsgDatabaseError)
		return
	}
	common.ApiSuccess(c, supportConversationResponse{ConversationID: session.ConversationID})
}

func SendSupportMessage(c *gin.Context) {
	session, ok := loadOwnedSupportSession(c)
	if !ok {
		return
	}
	client := service.GetForumDeskClient()
	if client == nil || !client.Configured() {
		writeSupportError(c, &service.ForumDeskError{
			HTTPStatus: http.StatusOK,
			Code:       service.ForumDeskCodeNotConfigured,
			MessageKey: i18n.MsgForumDeskNotConfigured,
		})
		return
	}

	var req sendSupportMessageRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	text := strings.TrimSpace(req.Text)
	if text == "" || len([]rune(text)) > supportMessageMaxLen {
		writeSupportError(c, &service.ForumDeskError{
			HTTPStatus: http.StatusUnprocessableEntity,
			Code:       service.ForumDeskCodeValidation,
			MessageKey: i18n.MsgForumDeskValidation,
			Message:    "text must contain 1 to 4000 characters",
		})
		return
	}

	item, err := client.SendMessage(c.Request.Context(), session.ConversationID, session.VisitorToken, service.ForumDeskSendMessageRequest{
		Text:             text,
		ReplyToMessageID: strings.TrimSpace(req.ReplyToMessageID),
	})
	if err != nil {
		handleStaleSupportSession(c, session, err)
		return
	}
	common.ApiSuccess(c, redactSupportStaffName(item))
}

func GetSupportMessages(c *gin.Context) {
	session, ok := loadOwnedSupportSession(c)
	if !ok {
		return
	}
	client := service.GetForumDeskClient()
	if client == nil || !client.Configured() {
		writeSupportError(c, &service.ForumDeskError{
			HTTPStatus: http.StatusOK,
			Code:       service.ForumDeskCodeNotConfigured,
			MessageKey: i18n.MsgForumDeskNotConfigured,
		})
		return
	}

	after := strings.TrimSpace(c.Query("after"))
	limit, _ := strconv.Atoi(strings.TrimSpace(c.Query("limit")))
	if limit <= 0 || limit > supportDefaultLimit {
		limit = supportDefaultLimit
	}

	result, err := client.ListMessages(c.Request.Context(), session.ConversationID, session.VisitorToken, after, limit)
	if err != nil {
		handleStaleSupportSession(c, session, err)
		return
	}
	items := result.Items
	if items == nil {
		items = []service.ForumDeskItem{}
	}
	for i := range items {
		items[i].StaffName = ""
	}
	common.ApiSuccess(c, supportMessageListResponse{
		Items:      items,
		NextCursor: result.NextCursor,
	})
}

func redactSupportStaffName(item *service.ForumDeskItem) *service.ForumDeskItem {
	if item == nil {
		return nil
	}
	copied := *item
	copied.StaffName = ""
	return &copied
}

func loadOwnedSupportSession(c *gin.Context) (*model.ForumDeskSession, bool) {
	userId := c.GetInt("id")
	if userId <= 0 {
		common.ApiErrorI18n(c, i18n.MsgUnauthorized)
		return nil, false
	}
	conversationID := strings.TrimSpace(c.Param("conversation_id"))
	if conversationID == "" {
		writeSupportError(c, service.NewForumDeskNotFound())
		return nil, false
	}
	session, err := model.GetForumDeskSessionByUserAndConversation(userId, conversationID)
	if err != nil {
		common.ApiErrorI18n(c, i18n.MsgDatabaseError)
		return nil, false
	}
	if session == nil {
		writeSupportError(c, service.NewForumDeskForbidden())
		return nil, false
	}
	return session, true
}

func handleStaleSupportSession(c *gin.Context, session *model.ForumDeskSession, err error) {
	mapped := service.ForumDeskErrorFrom(err)
	if mapped.Code == service.ForumDeskCodeUnauthorized {
		_ = model.DeleteForumDeskSession(session.UserId, session.ConversationID)
	}
	writeSupportError(c, mapped)
}

func writeSupportError(c *gin.Context, err *service.ForumDeskError) {
	if err == nil {
		err = service.ForumDeskErrorFrom(nil)
	}
	message := ""
	if err.MessageKey != "" {
		message = common.TranslateMessage(c, err.MessageKey)
	}
	if err.Code == service.ForumDeskCodeValidation && strings.TrimSpace(err.Message) != "" {
		message = err.Message
	} else if strings.TrimSpace(message) == "" {
		message = err.Message
	}
	body := gin.H{
		"success": false,
		"code":    err.Code,
		"message": message,
	}
	if err.RetryAfter > 0 {
		body["retry_after"] = err.RetryAfter
		c.Header("Retry-After", strconv.Itoa(err.RetryAfter))
	}
	status := err.HTTPStatus
	if status == 0 {
		status = http.StatusOK
	}
	c.JSON(status, body)
}

func sanitizeSupportPageURL(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" || len(raw) > supportPageURLMaxLen {
		return ""
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return ""
	}
	if parsed.Host == "" {
		return ""
	}
	return raw
}
