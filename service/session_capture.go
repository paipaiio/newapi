package service

import (
	"context"
	"encoding/json"
	"time"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service/privacyfilter"
	"github.com/QuantumNous/new-api/service/storage"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/bytedance/gopkg/util/gopool"
	"github.com/gin-gonic/gin"
)

// safeTruncateBytes 按字节上限截断，但回退到最近的 UTF-8 字符边界，
// 避免切碎多字节字符（如中文）产生非法字节，导致 JSON marshal 或 DB 写入失败。
func safeTruncateBytes(b []byte, maxBytes int) []byte {
	if maxBytes <= 0 || len(b) <= maxBytes {
		return b
	}
	cut := maxBytes
	// 向前回退直到落在一个完整 rune 的起始边界
	for cut > 0 && !utf8.RuneStart(b[cut]) {
		cut--
	}
	// 再校验末尾 rune 是否完整，不完整继续回退
	for cut > 0 {
		if r, _ := utf8.DecodeLastRune(b[:cut]); r != utf8.RuneError {
			break
		}
		cut--
	}
	return b[:cut]
}

// sessionCapturePayload 是写入对象存储的会话正文结构(JSON)。
type sessionCapturePayload struct {
	RequestId   string          `json:"request_id"`
	CreatedAt   int64           `json:"created_at"`
	UserId      int             `json:"user_id"`
	Username    string          `json:"username"`
	ModelName   string          `json:"model_name"`
	Group       string          `json:"group"`
	IsStream    bool            `json:"is_stream"`
	StatusCode  int             `json:"status_code"`
	IsSuccess   bool            `json:"is_success"`
	RequestRaw  json.RawMessage `json:"request,omitempty"`
	ResponseRaw string          `json:"response,omitempty"`
	ErrorMsg    string          `json:"error,omitempty"`
}

// SessionCaptureMeta 携带在记日志点已算好的元数据,避免捕获逻辑重复计算。
type SessionCaptureMeta struct {
	Username         string
	TokenName        string
	ModelName        string
	Group            string
	ChannelId        int
	PromptTokens     int
	CompletionTokens int
	Quota            int
	UseTimeSeconds   int
	StatusCode       int
	IsSuccess        bool
	ErrorMsg         string
}

// CaptureSession 异步捕获一次会话的请求/响应正文:
//   - 请求正文取自 gin context 缓存的原始 body(可重复读)
//   - 响应正文取自 relayInfo.CapturedResponseText(流式聚合 / 非流式整体)
//   - 正文 gzip 后写入对象存储,元数据写入 session_logs 索引表
//
// 全程在 gopool 协程内执行,任何失败仅记日志,绝不影响主请求链路。
func CaptureSession(ctx *gin.Context, relayInfo *relaycommon.RelayInfo, meta SessionCaptureMeta) {
	if !operation_setting.IsSessionLoggingEnabled() {
		return
	}
	s := operation_setting.GetStorageSetting()
	// 失败请求是否记录,由配置决定。
	if !meta.IsSuccess && !s.CaptureFailed {
		return
	}

	// 在主协程内取出需要的数据(gin.Context 不可跨协程并发使用)。
	// 读取完整请求体(不截断),媒体提取后再对文本部分做限制。
	requestRaw := capturedRequestBody(ctx, 0)
	responseText := relayInfo.CapturedResponseText
	if s.MaxBodyBytes > 0 && len(responseText) > s.MaxBodyBytes {
		responseText = string(safeTruncateBytes([]byte(responseText), s.MaxBodyBytes))
	}
	requestId := relayInfo.RequestId
	if requestId == "" {
		requestId = ctx.GetString(common.RequestIdKey)
	}
	userId := relayInfo.UserId
	ip := ctx.ClientIP()
	createdAt := time.Now().Unix()
	isStream := relayInfo.IsStream

	gopool.Go(func() {
		defer func() {
			if r := recover(); r != nil {
				common.SysError("CaptureSession panic recovered")
			}
		}()

		// 提取 base64 媒体内容单独上传到 attachments/,返回瘦身后正文和附件摘要。
		cleanedRaw, mediaSummary := ExtractAndUploadMedia(context.Background(), sanitizeJSON(requestRaw), userId, requestId, createdAt)
		if s.MaxBodyBytes > 0 && len(cleanedRaw) > s.MaxBodyBytes {
			// 安全截断后必须保证仍是合法 JSON，否则 json.RawMessage marshal 会失败。
			// 截断破坏 JSON 结构时，退回为 JSON 字符串形式保存。
			truncated := safeTruncateBytes(cleanedRaw, s.MaxBodyBytes)
			if json.Valid(truncated) {
				cleanedRaw = truncated
			} else {
				if encoded, err := json.Marshal(string(truncated)); err == nil {
					cleanedRaw = encoded
				} else {
					cleanedRaw = truncated
				}
			}
		}

		// 最终保险：RequestRaw 必须是合法 JSON，否则 json.Marshal 会因
		// json.RawMessage 校验失败而整条丢弃。非法时退回为 JSON 字符串。
		if len(cleanedRaw) > 0 && !json.Valid(cleanedRaw) {
			if encoded, err := json.Marshal(string(cleanedRaw)); err == nil {
				cleanedRaw = encoded
			} else {
				cleanedRaw = nil
			}
		}

		// 会话记录脱敏(默认关闭):开启后,请求正文/响应在写入存储前脱敏 PII/密钥。
		// 仅影响存储内容,不影响发往上游的请求(那是另一条独立路径)。
		responseTextForStore := responseText
		errorMsgForStore := meta.ErrorMsg
		if s.RedactStored {
			cleanedRaw = privacyfilter.RedactJSONBytes(cleanedRaw)
			responseTextForStore = privacyfilter.RedactString(responseTextForStore)
			errorMsgForStore = privacyfilter.RedactString(errorMsgForStore)
		}

		payload := sessionCapturePayload{
			RequestId:   requestId,
			CreatedAt:   createdAt,
			UserId:      userId,
			Username:    meta.Username,
			ModelName:   meta.ModelName,
			Group:       meta.Group,
			IsStream:    isStream,
			StatusCode:  meta.StatusCode,
			IsSuccess:   meta.IsSuccess,
			RequestRaw:  cleanedRaw,
			ResponseRaw: responseTextForStore,
			ErrorMsg:    errorMsgForStore,
		}
		body, err := json.Marshal(payload)
		if err != nil {
			common.SysError("CaptureSession marshal failed: " + err.Error())
			return
		}

		key := model.BuildObjectKey(s.KeyPrefix, userId, requestId, createdAt)
		cctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if err := storage.PutGzip(cctx, key, body, "application/json"); err != nil {
			common.SysError("CaptureSession upload failed: " + err.Error())
			return
		}

		idx := &model.SessionLog{
			CreatedAt:        createdAt,
			UserId:           userId,
			Username:         meta.Username,
			TokenName:        meta.TokenName,
			ModelName:        meta.ModelName,
			Group:            meta.Group,
			ChannelId:        meta.ChannelId,
			RequestId:        requestId,
			PromptTokens:     meta.PromptTokens,
			CompletionTokens: meta.CompletionTokens,
			Quota:            meta.Quota,
			UseTime:          meta.UseTimeSeconds,
			IsStream:         isStream,
			StatusCode:       meta.StatusCode,
			IsSuccess:        meta.IsSuccess,
			Ip:               ip,
			ObjectKey:        key,
			ObjectSize:       len(body),
			ContentText:      appendMediaSummary(model.ExtractContentText(payload.RequestRaw, payload.ResponseRaw), mediaSummary),
			ConversationKey:  model.ExtractConversationKey(userId, meta.ModelName, payload.RequestRaw),
			MessageCount:     model.ExtractMessageCount(payload.RequestRaw),
			HasMedia:         mediaSummary != "",
			Redacted:         s.RedactStored,
		}
		if err := model.InsertSessionLog(idx); err != nil {
			common.SysError("CaptureSession index insert failed: " + err.Error())
		}
	})
}

// capturedRequestBody 取出 gin context 中缓存的原始请求体(可重复读),并按上限截断。
func capturedRequestBody(ctx *gin.Context, maxBytes int) []byte {
	bs, err := common.GetBodyStorage(ctx)
	if err != nil || bs == nil {
		return nil
	}
	data, err := bs.Bytes()
	if err != nil {
		return nil
	}
	if maxBytes > 0 && len(data) > maxBytes {
		return data[:maxBytes]
	}
	return data
}

// FailedSessionMeta 携带失败请求捕获所需的元数据(失败路径无 relayInfo)。
type FailedSessionMeta struct {
	UserId         int
	Username       string
	TokenName      string
	ModelName      string
	Group          string
	ChannelId      int
	RequestId      string
	UseTimeSeconds int
	IsStream       bool
	StatusCode     int
	ErrorMsg       string
}

// CaptureFailedSession 捕获一次失败请求的会话(请求正文 + 错误信息)。
// 仅在开启会话记录且开启「记录失败请求」时执行;异步、失败不影响主链路。
func CaptureFailedSession(ctx *gin.Context, meta FailedSessionMeta) {
	if !operation_setting.IsSessionLoggingEnabled() {
		return
	}
	s := operation_setting.GetStorageSetting()
	if !s.CaptureFailed {
		return
	}

	requestRaw := capturedRequestBody(ctx, s.MaxBodyBytes)
	requestId := meta.RequestId
	if requestId == "" {
		requestId = ctx.GetString(common.RequestIdKey)
	}
	ip := ctx.ClientIP()
	createdAt := time.Now().Unix()

	gopool.Go(func() {
		defer func() {
			if r := recover(); r != nil {
				common.SysError("CaptureFailedSession panic recovered")
			}
		}()

		// 会话记录脱敏(默认关闭):请求正文/错误信息在写入存储前脱敏 PII/密钥。
		reqJSON := sanitizeJSON(requestRaw)
		errorMsgForStore := meta.ErrorMsg
		if s.RedactStored {
			reqJSON = privacyfilter.RedactJSONBytes(reqJSON)
			errorMsgForStore = privacyfilter.RedactString(errorMsgForStore)
		}

		payload := sessionCapturePayload{
			RequestId:  requestId,
			CreatedAt:  createdAt,
			UserId:     meta.UserId,
			Username:   meta.Username,
			ModelName:  meta.ModelName,
			Group:      meta.Group,
			IsStream:   meta.IsStream,
			StatusCode: meta.StatusCode,
			IsSuccess:  false,
			RequestRaw: reqJSON,
			ErrorMsg:   errorMsgForStore,
		}
		body, err := json.Marshal(payload)
		if err != nil {
			common.SysError("CaptureFailedSession marshal failed: " + err.Error())
			return
		}

		key := model.BuildObjectKey(s.KeyPrefix, meta.UserId, requestId, createdAt)
		cctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if err := storage.PutGzip(cctx, key, body, "application/json"); err != nil {
			common.SysError("CaptureFailedSession upload failed: " + err.Error())
			return
		}

		idx := &model.SessionLog{
			CreatedAt:      createdAt,
			UserId:         meta.UserId,
			Username:       meta.Username,
			TokenName:      meta.TokenName,
			ModelName:      meta.ModelName,
			Group:          meta.Group,
			ChannelId:      meta.ChannelId,
			RequestId:      requestId,
			UseTime:        meta.UseTimeSeconds,
			IsStream:       meta.IsStream,
			StatusCode:     meta.StatusCode,
			IsSuccess:      false,
			Ip:             ip,
			ObjectKey:      key,
			ObjectSize:     len(body),
			ContentText:     model.ExtractContentText(reqJSON, errorMsgForStore),
			ConversationKey: model.ExtractConversationKey(meta.UserId, meta.ModelName, reqJSON),
			MessageCount:    model.ExtractMessageCount(reqJSON),
			Redacted:        s.RedactStored,
		}
		if err := model.InsertSessionLog(idx); err != nil {
			common.SysError("CaptureFailedSession index insert failed: " + err.Error())
		}
	})
}

// sanitizeJSON 在能解析为 JSON 时原样返回,否则将原始字节包装为 JSON 字符串,
// 保证写入对象的 request 字段始终是合法 JSON。
func sanitizeJSON(raw []byte) json.RawMessage {
	if len(raw) == 0 {
		return nil
	}
	if json.Valid(raw) {
		return json.RawMessage(raw)
	}
	b, _ := json.Marshal(string(raw))
	return json.RawMessage(b)
}

func appendMediaSummary(base, summary string) string {
	if summary == "" {
		return base
	}
	if base == "" {
		return summary
	}
	return base + "\n\n" + summary
}
