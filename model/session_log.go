package model

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"
)

// SessionLog 是会话正文记录的索引表(存于 LOG_DB,与 Log 同库)。
// 正文本身(请求/响应原文)经 gzip 存放于对象存储,这里仅保留元数据与对象 key,
// 列表查询走本表(快),点开详情时再按 key 回源对象存储拉正文。
type SessionLog struct {
	Id               int    `json:"id" gorm:"primaryKey;autoIncrement"`
	CreatedAt        int64  `json:"created_at" gorm:"bigint;index:idx_sl_created_at;index:idx_sl_user_created,priority:2"`
	UserId           int    `json:"user_id" gorm:"index:idx_sl_user_created,priority:1"`
	Username         string `json:"username" gorm:"type:varchar(64);index;default:''"`
	TokenName        string `json:"token_name" gorm:"type:varchar(64);default:''"`
	ModelName        string `json:"model_name" gorm:"type:varchar(128);index;default:''"`
	Group            string `json:"group" gorm:"type:varchar(64);default:''"`
	ChannelId        int    `json:"channel_id" gorm:"default:0"`
	RequestId        string `json:"request_id" gorm:"type:varchar(64);index:idx_sl_request_id;default:''"`
	PromptTokens     int    `json:"prompt_tokens" gorm:"default:0"`
	CompletionTokens int    `json:"completion_tokens" gorm:"default:0"`
	Quota            int    `json:"quota" gorm:"default:0"`
	UseTime          int    `json:"use_time" gorm:"default:0"`
	IsStream         bool   `json:"is_stream" gorm:"default:false"`
	StatusCode       int    `json:"status_code" gorm:"default:0"`
	IsSuccess        bool   `json:"is_success" gorm:"default:true"`
	Ip               string `json:"ip" gorm:"type:varchar(64);default:''"`

	// 对象存储中正文的 key 与压缩后大小(字节)。
	ObjectKey  string `json:"object_key" gorm:"type:varchar(255);default:''"`
	ObjectSize int    `json:"object_size" gorm:"default:0"`

	// ContentText 存储本次调用新增的可搜索纯文本(最后一条用户消息+助手回复的前8KB),
	// 配合 ngram 全文索引用于关键词搜索,避免逐一下载 R2 对象。
	ContentText string `json:"content_text,omitempty" gorm:"type:mediumtext"`

	// 对话整理字段: conversation_key 为首条用户消息的哈希(用于识别同一对话),
	// message_count 为本次请求的消息条数(用于验证对话链连续性),
	// conversation_id 整理后指向 conversation_groups.id。
	ConversationKey string `json:"conversation_key,omitempty" gorm:"type:varchar(32);index;default:''"`
	MessageCount    int    `json:"message_count,omitempty" gorm:"default:0"`
	ConversationId  int64  `json:"conversation_id,omitempty" gorm:"default:0;index"`
	// HasMedia 标记本次请求是否含有图片/文件附件(上传后单独存 attachments/ 目录)。
	HasMedia        bool   `json:"has_media,omitempty" gorm:"default:false;index"`
	// Redacted 标记本条记录在存储前是否经过隐私脱敏(PII/密钥替换为占位符)。
	Redacted        bool   `json:"redacted,omitempty" gorm:"default:false"`
}

// ConversationGroup 是每日整理后的对话聚合记录。
type ConversationGroup struct {
	Id            int64  `json:"id" gorm:"primaryKey;autoIncrement"`
	Date          string `json:"date" gorm:"type:varchar(10);index"`
	GroupKey      string `json:"group_key" gorm:"type:varchar(32);index"`
	UserId        int    `json:"user_id" gorm:"index"`
	Username      string `json:"username" gorm:"type:varchar(64)"`
	ModelName     string `json:"model_name" gorm:"type:varchar(128)"`
	TurnCount     int    `json:"turn_count"`
	PromptTokens  int    `json:"prompt_tokens"`
	CompTokens    int    `json:"completion_tokens"`
	StartedAt     int64  `json:"started_at"`
	EndedAt       int64  `json:"ended_at"`
	CreatedAt     int64  `json:"created_at"`
	// 最后一轮的 R2 对象 key(含完整对话上下文),其余轮次整理后删除以节省空间
	ObjectKey     string `json:"object_key" gorm:"type:varchar(255);default:''"`
	LastSessionId int    `json:"last_session_id" gorm:"default:0"`
}

func (ConversationGroup) TableName() string { return "conversation_groups" }

func (SessionLog) TableName() string {
	return "session_logs"
}

// EnsureSessionLogFulltextIndex 在 session_logs.content_text 上建立 ngram 全文索引。
// 幂等:已存在则忽略错误。在主库迁移完成后调用一次(session_logs 建在主库)。
func EnsureSessionLogFulltextIndex() {
	// session_logs 表随主库迁移创建,故用 DB(LOG_DB 在未配独立日志库时等于 DB,
	// 但 InitDB 早于 InitLogDB,此处用 DB 保证非空)。
	DB.Exec(`ALTER TABLE session_logs ADD FULLTEXT INDEX idx_sl_content (content_text) WITH PARSER ngram`)
	// 忽略 "Duplicate key name" 之类错误。
}

// ExtractContentText 从请求原文和响应文本中提取可搜索的纯文本。
// 只取"本次新增"内容:messages 数组中最后一条 user 消息 + 助手回复的前 8000 字符。
// 目的是索引本次调用的新增内容,而非整段历史(历史在上一条记录里已索引)。
func ExtractContentText(requestRaw json.RawMessage, responseText string) string {
	var sb strings.Builder

	// 解析请求中的最后一条 user 消息
	if len(requestRaw) > 0 {
		var req map[string]interface{}
		if json.Unmarshal(requestRaw, &req) == nil {
			// 尝试 messages 字段(OpenAI chat / Claude)
			if msgs, ok := arrayField(req, "messages"); ok {
				if text := lastUserContent(msgs); text != "" {
					sb.WriteString(text)
				}
			} else if input, ok := arrayField(req, "input"); ok {
				// OpenAI Responses API
				if text := lastUserContent(input); text != "" {
					sb.WriteString(text)
				}
			}
		}
	}

	// 拼接助手回复
	if responseText != "" {
		if sb.Len() > 0 {
			sb.WriteString("\n\n")
		}
		// 响应可能是 SSE 纯文本或 JSON;截取前 8000 字符（按 rune，避免切碎多字节字符）
		resp := responseText
		if utf8.RuneCountInString(resp) > 8000 {
			resp = string([]rune(resp)[:8000])
		}
		sb.WriteString(resp)
	}

	result := sb.String()
	if utf8.RuneCountInString(result) > 16000 {
		result = string([]rune(result)[:16000])
	}
	return result
}

func arrayField(m map[string]interface{}, key string) ([]interface{}, bool) {
	v, ok := m[key]
	if !ok {
		return nil, false
	}
	arr, ok := v.([]interface{})
	return arr, ok
}

func lastUserContent(msgs []interface{}) string {
	for i := len(msgs) - 1; i >= 0; i-- {
		msg, ok := msgs[i].(map[string]interface{})
		if !ok {
			continue
		}
		role, _ := msg["role"].(string)
		if role != "user" {
			continue
		}
		return extractMsgText(msg["content"])
	}
	return ""
}

func extractMsgText(content interface{}) string {
	switch v := content.(type) {
	case string:
		return v
	case []interface{}:
		var parts []string
		for _, item := range v {
			if m, ok := item.(map[string]interface{}); ok {
				if m["type"] == "text" {
					if t, ok := m["text"].(string); ok {
						parts = append(parts, t)
					}
				}
			}
		}
		return strings.Join(parts, " ")
	}
	return ""
}

// InsertSessionLog 写入一条会话索引记录(由捕获补丁异步调用)。
func InsertSessionLog(s *SessionLog) error {
	return LOG_DB.Create(s).Error
}

type GetSessionLogsParams struct {
	UserId     int
	Username   string
	ModelName  string
	RequestId  string
	Keyword    string
	OnlyFailed bool
	OnlyMedia  bool
	StartTs    int64
	EndTs      int64
	Page       int
	PageSize   int
}

// GetSessionLogs 管理端分页查询(走索引表,不触碰对象存储)。
func GetSessionLogs(p GetSessionLogsParams) (logs []*SessionLog, total int64, err error) {
	tx := LOG_DB.Model(&SessionLog{})
	if p.UserId > 0 {
		tx = tx.Where("user_id = ?", p.UserId)
	}
	if p.Username != "" {
		tx = tx.Where("username = ?", p.Username)
	}
	if p.ModelName != "" {
		tx = tx.Where("model_name = ?", p.ModelName)
	}
	if p.RequestId != "" {
		tx = tx.Where("request_id = ?", p.RequestId)
	}
	if p.Keyword != "" {
		// MySQL ngram 全文检索,支持中英文关键词
		tx = tx.Where("MATCH(content_text) AGAINST(? IN BOOLEAN MODE)", p.Keyword)
	}
	if p.OnlyFailed {
		tx = tx.Where("is_success = ?", false)
	}
	if p.OnlyMedia {
		tx = tx.Where("has_media = ?", true)
	}
	if p.StartTs > 0 {
		tx = tx.Where("created_at >= ?", p.StartTs)
	}
	if p.EndTs > 0 {
		tx = tx.Where("created_at <= ?", p.EndTs)
	}

	if err = tx.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if p.PageSize <= 0 || p.PageSize > 100 {
		p.PageSize = 20
	}
	// Page 为 1 起(与全站分页一致);兼容传入 0/负数时回退到第一页。
	if p.Page < 1 {
		p.Page = 1
	}
	err = tx.Order("id DESC").Limit(p.PageSize).Offset((p.Page - 1) * p.PageSize).Find(&logs).Error
	return logs, total, err
}

// GetSessionLogById 取单条索引记录(用于详情回源)。
func GetSessionLogById(id int) (*SessionLog, error) {
	var s SessionLog
	err := LOG_DB.Where("id = ?", id).First(&s).Error
	if err != nil {
		return nil, err
	}
	return &s, nil
}

// ListSessionLogsMissingFields 取出 content_text 或 conversation_key 为空的记录，用于回填。
func ListSessionLogsMissingFields(limit int) ([]*SessionLog, error) {
	if limit <= 0 || limit > 2000 {
		limit = 500
	}
	var logs []*SessionLog
	err := LOG_DB.Select("id", "object_key", "user_id", "model_name", "content_text", "conversation_key").
		Where("(content_text IS NULL OR content_text = '') OR (conversation_key IS NULL OR conversation_key = '')").
		Order("id DESC").Limit(limit).Find(&logs).Error
	return logs, err
}

// UpdateSessionLogFields 批量回填字段(map key 为列名)。
func UpdateSessionLogFields(id int, updates map[string]interface{}) error {
	return LOG_DB.Model(&SessionLog{}).Where("id = ?", id).Updates(updates).Error
}


// CleanupSessionLogs 删除早于 retentionDays 的索引记录(兜底清理,不删对象本身)。
func CleanupSessionLogs(retentionDays int) (int64, error) {
	if retentionDays <= 0 {
		return 0, nil
	}
	cutoff := time.Now().AddDate(0, 0, -retentionDays).Unix()
	res := LOG_DB.Where("created_at < ?", cutoff).Delete(&SessionLog{})
	return res.RowsAffected, res.Error
}

type GetConversationGroupsParams struct {
	Username  string
	ModelName string
	DateFrom  string // YYYY-MM-DD
	DateTo    string
	Page      int
	PageSize  int
}

// GetConversationGroups 管理端分页查询聚合会话列表。
func GetConversationGroups(p GetConversationGroupsParams) ([]*ConversationGroup, int64, error) {
	tx := LOG_DB.Model(&ConversationGroup{})
	if p.Username != "" {
		tx = tx.Where("username = ?", p.Username)
	}
	if p.ModelName != "" {
		tx = tx.Where("model_name = ?", p.ModelName)
	}
	if p.DateFrom != "" {
		tx = tx.Where("date >= ?", p.DateFrom)
	}
	if p.DateTo != "" {
		tx = tx.Where("date <= ?", p.DateTo)
	}
	var total int64
	if err := tx.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if p.PageSize <= 0 || p.PageSize > 100 {
		p.PageSize = 20
	}
	if p.Page < 1 {
		p.Page = 1
	}
	var groups []*ConversationGroup
	err := tx.Order("id DESC").Limit(p.PageSize).Offset((p.Page - 1) * p.PageSize).Find(&groups).Error
	return groups, total, err
}

// ExtractConversationKey 从请求体中提取对话 key: sha256(userId|model|首条用户消息)[:16]。
// 同一多轮对话的所有请求会包含相同的首条用户消息,因此 key 保持一致。
func ExtractConversationKey(userId int, modelName string, reqRaw json.RawMessage) string {
	if len(reqRaw) == 0 {
		return ""
	}
	var req map[string]interface{}
	if json.Unmarshal(reqRaw, &req) != nil {
		return ""
	}
	msgs, ok := arrayField(req, "messages")
	if !ok {
		msgs, ok = arrayField(req, "input")
	}
	if !ok {
		return ""
	}
	for _, m := range msgs {
		msg, _ := m.(map[string]interface{})
		if msg["role"] != "user" {
			continue
		}
		content := extractMsgText(msg["content"])
		if content == "" {
			return ""
		}
		h := sha256.Sum256([]byte(fmt.Sprintf("%d\x00%s\x00%s", userId, modelName, content)))
		return hex.EncodeToString(h[:16])
	}
	return ""
}

// ExtractMessageCount 返回请求体中 messages 数组的长度,用于对话链连续性校验。
func ExtractMessageCount(reqRaw json.RawMessage) int {
	if len(reqRaw) == 0 {
		return 0
	}
	var req map[string]interface{}
	if json.Unmarshal(reqRaw, &req) != nil {
		return 0
	}
	msgs, ok := arrayField(req, "messages")
	if !ok {
		msgs, ok = arrayField(req, "input")
	}
	if !ok {
		return 0
	}
	return len(msgs)
}

// OrganizeSessionConversations 将 [startTs, endTs) 范围内未整理的 session_logs 按对话链聚合,
// 写入 conversation_groups 并回写 conversation_id。由每日 0 点任务调用。
// deleteFn 用于删除冗余 R2 对象(由调用方传入,避免 model 依赖 service/storage)。
func OrganizeSessionConversations(date string, startTs, endTs int64, deleteFn func(context.Context, string) error) error {
	var logs []*SessionLog
	err := LOG_DB.Select("id", "user_id", "username", "model_name",
		"conversation_key", "message_count", "prompt_tokens", "completion_tokens", "created_at", "object_key").
		Where("created_at >= ? AND created_at < ? AND conversation_id = 0 AND conversation_key != ''",
			startTs, endTs).
		Order("created_at ASC").Find(&logs).Error
	if err != nil {
		return err
	}

	// 按 (user_id, model_name, conversation_key) 分组
	type gk struct{ uid int; model, key string }
	groups := make(map[gk][]*SessionLog)
	for _, l := range logs {
		groups[gk{l.UserId, l.ModelName, l.ConversationKey}] = append(
			groups[gk{l.UserId, l.ModelName, l.ConversationKey}], l)
	}

	now := time.Now().Unix()
	for k, gLogs := range groups {
		for _, chain := range splitConversationChains(gLogs) {
			last := chain[len(chain)-1]
			cg := &ConversationGroup{
				Date: date, GroupKey: k.key,
				UserId: k.uid, Username: chain[0].Username, ModelName: k.model,
				TurnCount: len(chain), CreatedAt: now,
				ObjectKey: last.ObjectKey, LastSessionId: last.Id,
			}
			for _, l := range chain {
				cg.PromptTokens += l.PromptTokens
				cg.CompTokens += l.CompletionTokens
				if cg.StartedAt == 0 || l.CreatedAt < cg.StartedAt {
					cg.StartedAt = l.CreatedAt
				}
				if l.CreatedAt > cg.EndedAt {
					cg.EndedAt = l.CreatedAt
				}
			}
			if err := LOG_DB.Create(cg).Error; err != nil {
				continue
			}
			ids := make([]int, len(chain))
			for i, l := range chain {
				ids[i] = l.Id
			}
			LOG_DB.Exec("UPDATE session_logs SET conversation_id = ? WHERE id IN ?", cg.Id, ids)

			// 删除非末轮的 R2 对象(末轮已含完整上下文),释放存储空间
			if deleteFn != nil {
				for _, l := range chain[:len(chain)-1] {
					if l.ObjectKey == "" {
						continue
					}
					ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
					_ = deleteFn(ctx, l.ObjectKey)
					cancel()
				}
				// 清除已删除对象的 key,防止重复操作
				if len(ids) > 1 {
					LOG_DB.Exec("UPDATE session_logs SET object_key = '' WHERE id IN ?", ids[:len(ids)-1])
				}
			}
		}
	}
	return nil
}

// splitConversationChains 将同 key 的日志(已按 created_at 排序)按 message_count 单调递增切分成链。
// message_count 不增(重置或新对话)则开始新链。
func splitConversationChains(logs []*SessionLog) [][]*SessionLog {
	var chains [][]*SessionLog
	cur := []*SessionLog{logs[0]}
	for _, l := range logs[1:] {
		if l.MessageCount > cur[len(cur)-1].MessageCount {
			cur = append(cur, l)
		} else {
			chains = append(chains, cur)
			cur = []*SessionLog{l}
		}
	}
	return append(chains, cur)
}

// BuildObjectKey 生成对象 key:<prefix>/<userId>/<yyyymm>/<requestId>.json.gz
func BuildObjectKey(prefix string, userId int, requestId string, ts int64) string {
	if prefix == "" {
		prefix = "conv"
	}
	ym := time.Unix(ts, 0).UTC().Format("200601")
	rid := requestId
	if rid == "" {
		rid = fmt.Sprintf("noid-%d", ts)
	}
	rid = strings.ReplaceAll(rid, "/", "_")
	return fmt.Sprintf("%s/%d/%s/%s.json.gz", strings.Trim(prefix, "/"), userId, ym, rid)
}
