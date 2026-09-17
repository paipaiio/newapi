package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
)

const (
	ForumDeskCodeUnauthorized  = "FORUMDESK_UNAUTHORIZED"
	ForumDeskCodeValidation    = "FORUMDESK_VALIDATION"
	ForumDeskCodeRateLimited   = "FORUMDESK_RATE_LIMITED"
	ForumDeskCodeUnavailable   = "FORUMDESK_UNAVAILABLE"
	ForumDeskCodeForbidden     = "FORUMDESK_FORBIDDEN"
	ForumDeskCodeNotFound      = "FORUMDESK_NOT_FOUND"
	ForumDeskCodeNotConfigured = "FORUMDESK_NOT_CONFIGURED"

	forumDeskConnectTimeout = 3 * time.Second
	forumDeskRequestTimeout = 10 * time.Second
	forumDeskMaxBodyBytes   = 1 << 20
	forumDeskDefaultLimit   = 50
)

var (
	forumDeskClientMu sync.RWMutex
	forumDeskClient   *ForumDeskClient
)

// ForumDeskError is the unified upstream error returned to dashboard APIs.
type ForumDeskError struct {
	HTTPStatus int
	Code       string
	MessageKey string
	Message    string
	RetryAfter int
}

func (e *ForumDeskError) Error() string {
	if e == nil {
		return ""
	}
	if e.Message != "" {
		return e.Message
	}
	return e.Code
}

func (e *ForumDeskError) Is(target error) bool {
	var other *ForumDeskError
	if !errors.As(target, &other) {
		return false
	}
	return e.Code == other.Code
}

type ForumDeskClient struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client
}

type ForumDeskCreateConversationRequest struct {
	VisitorName string `json:"visitor_name"`
	Email       string `json:"email"`
	ExternalID  string `json:"external_id"`
	PageURL     string `json:"page_url"`
}

type ForumDeskConversation struct {
	ID           string `json:"id"`
	Status       string `json:"status"`
	VisitorToken string `json:"visitor_token"`
	CreatedAt    string `json:"created_at"`
}

type ForumDeskSendMessageRequest struct {
	Text             string `json:"text"`
	ReplyToMessageID string `json:"reply_to_message_id,omitempty"`
}

type ForumDeskItem struct {
	ID               string `json:"id,omitempty"`
	ConversationID   string `json:"conversation_id,omitempty"`
	Sequence         int64  `json:"sequence,omitempty"`
	Direction        string `json:"direction,omitempty"`
	Text             string `json:"text,omitempty"`
	Visible          *bool  `json:"visible,omitempty"`
	CreatedAt        string `json:"created_at,omitempty"`
	StaffName        string `json:"staff_name,omitempty"`
	ReplyToMessageID string `json:"reply_to_message_id,omitempty"`
	Event            string `json:"event,omitempty"`
	TargetMessageID  string `json:"target_message_id,omitempty"`
}

type ForumDeskListResult struct {
	Items      []ForumDeskItem
	NextCursor string
}

func NewForumDeskClient(baseURL, apiKey string, httpClient *http.Client) *ForumDeskClient {
	if httpClient == nil {
		httpClient = newForumDeskHTTPClient()
	}
	return &ForumDeskClient{
		baseURL:    strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		apiKey:     strings.TrimSpace(apiKey),
		httpClient: httpClient,
	}
}

func newForumDeskHTTPClient() *http.Client {
	dialer := &net.Dialer{Timeout: forumDeskConnectTimeout}
	transport := &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		DialContext:           dialer.DialContext,
		TLSHandshakeTimeout:   forumDeskConnectTimeout,
		ResponseHeaderTimeout: forumDeskRequestTimeout,
		IdleConnTimeout:       30 * time.Second,
		MaxIdleConns:          16,
		MaxIdleConnsPerHost:   4,
		ForceAttemptHTTP2:     true,
	}
	return &http.Client{
		Timeout:   forumDeskRequestTimeout,
		Transport: transport,
	}
}

func InitForumDesk() {
	client := NewForumDeskClient(common.ForumDeskAPIBase, common.ForumDeskAPIKey, nil)
	SetForumDeskClient(client)
	if !client.Configured() {
		common.SysLog("ForumDesk support proxy disabled: FORUMDESK_API_BASE or FORUMDESK_API_KEY is empty")
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), forumDeskRequestTimeout)
	defer cancel()
	if err := client.Healthz(ctx); err != nil {
		common.SysError("ForumDesk healthz failed: " + sanitizeForumDeskError(err))
		return
	}
	common.SysLog("ForumDesk healthz ok, base=" + client.baseURL)
}

func SetForumDeskClient(client *ForumDeskClient) {
	forumDeskClientMu.Lock()
	defer forumDeskClientMu.Unlock()
	forumDeskClient = client
}

func GetForumDeskClient() *ForumDeskClient {
	forumDeskClientMu.RLock()
	defer forumDeskClientMu.RUnlock()
	return forumDeskClient
}

func (c *ForumDeskClient) Configured() bool {
	return c != nil && c.baseURL != "" && c.apiKey != ""
}

func (c *ForumDeskClient) Healthz(ctx context.Context) error {
	if !c.Configured() {
		return newForumDeskNotConfigured()
	}
	_, _, err := c.do(ctx, http.MethodGet, "/healthz", "", nil)
	return err
}

func (c *ForumDeskClient) CreateConversation(ctx context.Context, req ForumDeskCreateConversationRequest) (*ForumDeskConversation, error) {
	if !c.Configured() {
		return nil, newForumDeskNotConfigured()
	}
	body, err := common.Marshal(req)
	if err != nil {
		return nil, newForumDeskUnavailable(err)
	}
	payload, _, err := c.do(ctx, http.MethodPost, "/api/v1/conversations", c.apiKey, body)
	if err != nil {
		return nil, err
	}
	var envelope struct {
		Data ForumDeskConversation `json:"data"`
	}
	if err := common.Unmarshal(payload, &envelope); err != nil {
		return nil, newForumDeskUnavailable(err)
	}
	if strings.TrimSpace(envelope.Data.ID) == "" || strings.TrimSpace(envelope.Data.VisitorToken) == "" {
		return nil, newForumDeskUnavailable(errors.New("missing conversation id or visitor token"))
	}
	return &envelope.Data, nil
}

func (c *ForumDeskClient) SendMessage(ctx context.Context, conversationID, visitorToken string, req ForumDeskSendMessageRequest) (*ForumDeskItem, error) {
	if !c.Configured() {
		return nil, newForumDeskNotConfigured()
	}
	body, err := common.Marshal(req)
	if err != nil {
		return nil, newForumDeskUnavailable(err)
	}
	path := "/api/v1/conversations/" + url.PathEscape(conversationID) + "/messages"
	payload, _, err := c.do(ctx, http.MethodPost, path, visitorToken, body)
	if err != nil {
		return nil, err
	}
	var envelope struct {
		Data ForumDeskItem `json:"data"`
	}
	if err := common.Unmarshal(payload, &envelope); err != nil {
		return nil, newForumDeskUnavailable(err)
	}
	return &envelope.Data, nil
}

func (c *ForumDeskClient) ListMessages(ctx context.Context, conversationID, visitorToken, after string, limit int) (*ForumDeskListResult, error) {
	if !c.Configured() {
		return nil, newForumDeskNotConfigured()
	}
	if limit <= 0 || limit > forumDeskDefaultLimit {
		limit = forumDeskDefaultLimit
	}
	query := url.Values{}
	query.Set("limit", strconv.Itoa(limit))
	if strings.TrimSpace(after) != "" {
		query.Set("after", after)
	}
	path := "/api/v1/conversations/" + url.PathEscape(conversationID) + "/messages?" + query.Encode()
	payload, _, err := c.do(ctx, http.MethodGet, path, visitorToken, nil)
	if err != nil {
		return nil, err
	}
	var envelope struct {
		Data []ForumDeskItem `json:"data"`
		Meta struct {
			NextCursor json.RawMessage `json:"next_cursor"`
		} `json:"meta"`
	}
	if err := common.Unmarshal(payload, &envelope); err != nil {
		return nil, newForumDeskUnavailable(err)
	}
	return &ForumDeskListResult{
		Items:      envelope.Data,
		NextCursor: parseForumDeskCursor(envelope.Meta.NextCursor),
	}, nil
}

func (c *ForumDeskClient) do(ctx context.Context, method, path, bearer string, body []byte) ([]byte, http.Header, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	endpoint := c.baseURL + path
	var reader io.Reader
	if len(body) > 0 {
		reader = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, endpoint, reader)
	if err != nil {
		return nil, nil, newForumDeskUnavailable(err)
	}
	req.Header.Set("Accept", "application/json")
	if len(body) > 0 {
		req.Header.Set("Content-Type", "application/json")
	}
	if strings.TrimSpace(bearer) != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		common.SysError("ForumDesk request failed method=" + method + " path=" + sanitizeForumDeskPath(path) + " err=" + sanitizeForumDeskError(err))
		return nil, nil, newForumDeskUnavailable(err)
	}
	defer resp.Body.Close()

	payload, err := io.ReadAll(io.LimitReader(resp.Body, forumDeskMaxBodyBytes+1))
	if err != nil {
		return nil, nil, newForumDeskUnavailable(err)
	}
	if len(payload) > forumDeskMaxBodyBytes {
		return nil, nil, newForumDeskUnavailable(errors.New("upstream response too large"))
	}

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return payload, resp.Header, nil
	}

	mapped := mapForumDeskStatus(resp.StatusCode, payload, resp.Header.Get("Retry-After"))
	common.SysError("ForumDesk upstream error method=" + method + " path=" + sanitizeForumDeskPath(path) + " status=" + strconv.Itoa(resp.StatusCode) + " code=" + mapped.Code)
	return nil, resp.Header, mapped
}

func mapForumDeskStatus(status int, payload []byte, retryAfterHeader string) *ForumDeskError {
	upstreamMessage := parseForumDeskUpstreamMessage(payload)
	retryAfter := parseRetryAfterSeconds(retryAfterHeader)
	switch status {
	case http.StatusUnauthorized:
		return &ForumDeskError{
			HTTPStatus: http.StatusOK,
			Code:       ForumDeskCodeUnauthorized,
			MessageKey: i18n.MsgForumDeskUnauthorized,
			Message:    firstNonEmpty(upstreamMessage, "support session unauthorized"),
		}
	case http.StatusUnprocessableEntity:
		return &ForumDeskError{
			HTTPStatus: http.StatusUnprocessableEntity,
			Code:       ForumDeskCodeValidation,
			MessageKey: i18n.MsgForumDeskValidation,
			Message:    firstNonEmpty(upstreamMessage, "support request is invalid"),
		}
	case http.StatusTooManyRequests:
		return &ForumDeskError{
			HTTPStatus: http.StatusTooManyRequests,
			Code:       ForumDeskCodeRateLimited,
			MessageKey: i18n.MsgForumDeskRateLimited,
			Message:    firstNonEmpty(upstreamMessage, "support is rate-limited"),
			RetryAfter: retryAfter,
		}
	case http.StatusBadGateway, http.StatusServiceUnavailable, http.StatusGatewayTimeout, http.StatusInternalServerError:
		return &ForumDeskError{
			HTTPStatus: http.StatusBadGateway,
			Code:       ForumDeskCodeUnavailable,
			MessageKey: i18n.MsgForumDeskUnavailable,
			Message:    firstNonEmpty(upstreamMessage, "support upstream unavailable"),
		}
	default:
		if status >= 500 {
			return &ForumDeskError{
				HTTPStatus: http.StatusBadGateway,
				Code:       ForumDeskCodeUnavailable,
				MessageKey: i18n.MsgForumDeskUnavailable,
				Message:    firstNonEmpty(upstreamMessage, "support upstream unavailable"),
			}
		}
		return &ForumDeskError{
			HTTPStatus: http.StatusOK,
			Code:       ForumDeskCodeUnavailable,
			MessageKey: i18n.MsgForumDeskUnavailable,
			Message:    firstNonEmpty(upstreamMessage, "support request failed"),
		}
	}
}

func parseForumDeskUpstreamMessage(payload []byte) string {
	if len(bytes.TrimSpace(payload)) == 0 {
		return ""
	}
	var envelope struct {
		Error struct {
			Message string `json:"message"`
			Code    string `json:"code"`
		} `json:"error"`
		Message string `json:"message"`
	}
	if err := common.Unmarshal(payload, &envelope); err != nil {
		return ""
	}
	msg := strings.TrimSpace(envelope.Error.Message)
	if msg == "" {
		msg = strings.TrimSpace(envelope.Message)
	}
	return sanitizeForumDeskError(errors.New(msg))
}

func parseRetryAfterSeconds(raw string) int {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 0
	}
	if seconds, err := strconv.Atoi(raw); err == nil && seconds > 0 {
		return seconds
	}
	if when, err := http.ParseTime(raw); err == nil {
		delay := int(time.Until(when).Seconds())
		if delay > 0 {
			return delay
		}
	}
	return 0
}

func parseForumDeskCursor(raw json.RawMessage) string {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || string(trimmed) == "null" {
		return ""
	}
	var asString string
	if err := json.Unmarshal(trimmed, &asString); err == nil {
		return asString
	}
	var asNumber json.Number
	if err := json.Unmarshal(trimmed, &asNumber); err == nil {
		return asNumber.String()
	}
	return strings.Trim(string(trimmed), `"`)
}

func newForumDeskNotConfigured() *ForumDeskError {
	return &ForumDeskError{
		HTTPStatus: http.StatusOK,
		Code:       ForumDeskCodeNotConfigured,
		MessageKey: i18n.MsgForumDeskNotConfigured,
		Message:    "customer support is not configured",
	}
}

func newForumDeskUnavailable(err error) *ForumDeskError {
	return &ForumDeskError{
		HTTPStatus: http.StatusBadGateway,
		Code:       ForumDeskCodeUnavailable,
		MessageKey: i18n.MsgForumDeskUnavailable,
		Message:    firstNonEmpty(sanitizeForumDeskError(err), "customer support is temporarily unavailable"),
	}
}

func NewForumDeskForbidden() *ForumDeskError {
	return &ForumDeskError{
		HTTPStatus: http.StatusForbidden,
		Code:       ForumDeskCodeForbidden,
		MessageKey: i18n.MsgForumDeskForbidden,
		Message:    "you do not have access to this support conversation",
	}
}

func NewForumDeskNotFound() *ForumDeskError {
	return &ForumDeskError{
		HTTPStatus: http.StatusOK,
		Code:       ForumDeskCodeNotFound,
		MessageKey: i18n.MsgForumDeskNotFound,
		Message:    "support conversation not found",
	}
}

func MaskForumDeskSecret(secret string) string {
	return common.MaskForumDeskSecret(secret)
}

func sanitizeForumDeskPath(path string) string {
	if path == "" {
		return "/"
	}
	if idx := strings.Index(path, "?"); idx >= 0 {
		return path[:idx]
	}
	return path
}

func sanitizeForumDeskError(err error) string {
	if err == nil {
		return ""
	}
	text := err.Error()
	text = strings.ReplaceAll(text, common.ForumDeskAPIKey, MaskForumDeskSecret(common.ForumDeskAPIKey))
	client := GetForumDeskClient()
	if client != nil && client.apiKey != "" {
		text = strings.ReplaceAll(text, client.apiKey, MaskForumDeskSecret(client.apiKey))
	}
	return text
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func ForumDeskErrorFrom(err error) *ForumDeskError {
	if err == nil {
		return newForumDeskUnavailable(errors.New("unknown support error"))
	}
	var mapped *ForumDeskError
	if errors.As(err, &mapped) {
		return mapped
	}
	return newForumDeskUnavailable(err)
}

func (c *ForumDeskClient) String() string {
	if c == nil {
		return "ForumDeskClient<nil>"
	}
	return fmt.Sprintf("ForumDeskClient{baseURL:%s apiKey:%s}", c.baseURL, MaskForumDeskSecret(c.apiKey))
}
