package controller

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/storage"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/gin-gonic/gin"
)

func GetSessionLogs(c *gin.Context) {
	// 使用全站统一的分页解析:读取 query 参数 `p`(1 起)与 `page_size`。
	// 之前误读 `c.Query("page")`,而前端发送的是 `p`,导致翻页永远停在第一页。
	pageInfo := common.GetPageQuery(c)
	userId, _ := strconv.Atoi(c.Query("user_id"))
	startTs, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTs, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	onlyFailed := c.Query("only_failed") == "true"
	onlyMedia := c.Query("only_media") == "true"

	logs, total, err := model.GetSessionLogs(model.GetSessionLogsParams{
		UserId:     userId,
		Username:   c.Query("username"),
		ModelName:  c.Query("model_name"),
		RequestId:  c.Query("request_id"),
		Keyword:    c.Query("keyword"),
		OnlyFailed: onlyFailed,
		OnlyMedia:  onlyMedia,
		StartTs:    startTs,
		EndTs:      endTs,
		Page:       pageInfo.GetPage(),
		PageSize:   pageInfo.GetPageSize(),
	})
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"items": logs,
			"total": total,
			"page":  pageInfo.GetPage(),
		},
	})
}

func GetSessionLogDetail(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "invalid id"})
		return
	}
	idx, err := model.GetSessionLogById(id)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "记录不存在"})
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	body, err := storage.GetGunzip(ctx, idx.ObjectKey)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "正文读取失败: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"meta":    idx,
			"content": string(body),
		},
	})
}

func TestStorageConnection(c *gin.Context) {
	if !operation_setting.IsSessionLoggingEnabled() {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "存储未配置完整(需填齐 endpoint/bucket/access_key/secret_key 并启用)"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
	defer cancel()
	if err := storage.TestConnection(ctx); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "连接成功"})
}

// backfillPayload 仅解析回填可搜索文本所需的字段(与 service 写入的结构对应)。
type backfillPayload struct {
	RequestRaw  json.RawMessage `json:"request,omitempty"`
	ResponseRaw string          `json:"response,omitempty"`
	ErrorMsg    string          `json:"error,omitempty"`
}

// BackfillSessionLogContentText 回填历史记录的 content_text + conversation_key + message_count。
func BackfillSessionLogContentText(c *gin.Context) {
	if !operation_setting.IsSessionLoggingEnabled() {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "存储未配置完整,无法回源历史正文"})
		return
	}
	limit, _ := strconv.Atoi(c.Query("limit"))
	rows, err := model.ListSessionLogsMissingFields(limit)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}

	var updated, skipped, failed int
	for _, r := range rows {
		func() {
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			body, err := storage.GetGunzip(ctx, r.ObjectKey)
			if err != nil {
				failed++
				return
			}
			var p backfillPayload
			if err := json.Unmarshal(body, &p); err != nil {
				failed++
				return
			}
			updates := map[string]interface{}{}
			if r.ContentText == "" {
				text := model.ExtractContentText(p.RequestRaw, p.ResponseRaw)
				if text == "" {
					text = p.ErrorMsg
				}
				if text != "" {
					updates["content_text"] = text
				}
			}
			if r.ConversationKey == "" {
				if k := model.ExtractConversationKey(r.UserId, r.ModelName, p.RequestRaw); k != "" {
					updates["conversation_key"] = k
					updates["message_count"] = model.ExtractMessageCount(p.RequestRaw)
				}
			}
			if len(updates) == 0 {
				skipped++
				return
			}
			if err := model.UpdateSessionLogFields(r.Id, updates); err != nil {
				failed++
				return
			}
			updated++
		}()
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "回填完成",
		"data":    gin.H{"scanned": len(rows), "updated": updated, "skipped": skipped, "failed": failed},
	})
}


// GetConversationGroups 管理端分页查询已聚合会话列表。
func GetConversationGroups(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	groups, total, err := model.GetConversationGroups(model.GetConversationGroupsParams{
		Username:  c.Query("username"),
		ModelName: c.Query("model_name"),
		DateFrom:  c.Query("date_from"),
		DateTo:    c.Query("date_to"),
		Page:      pageInfo.GetPage(),
		PageSize:  pageInfo.GetPageSize(),
	})
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    gin.H{"items": groups, "total": total, "page": pageInfo.GetPage()},
	})
}

// TriggerSessionOrganize 手动触发指定日期的会话整理(默认昨天)。
// 可在每日任务前提前触发或补跑历史日期。
func TriggerSessionOrganize(c *gin.Context) {
	date := c.Query("date")
	if date == "" {
		date = time.Now().AddDate(0, 0, -1).Format("2006-01-02")
	}
	t, err := time.ParseInLocation("2006-01-02", date, time.Local)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "日期格式错误,应为 YYYY-MM-DD"})
		return
	}
	dayStart := time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.Local)
	if err := model.OrganizeSessionConversations(date, dayStart.Unix(), dayStart.Unix()+86400, func(ctx context.Context, key string) error {
		return storage.DeleteObject(ctx, key)
	}); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": fmt.Sprintf("整理完成: %s", date)})
}

// GetSessionAttachment 从 R2 的 attachments/ 目录读取媒体文件,
// 返回 base64 供前端构造 data URL 展示。key 必须以 "attachments/" 开头。
func GetSessionAttachment(c *gin.Context) {
	key := c.Query("key")
	if !strings.HasPrefix(key, "attachments/") {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "invalid key"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()
	data, err := storage.GetRaw(ctx, key)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	// 从 key 推断 mime type(文件名后缀)
	ext := key[strings.LastIndex(key, ".")+1:]
	mime := extToMime(ext)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"base64":     base64.StdEncoding.EncodeToString(data),
			"media_type": mime,
			"r2_key":     key,
		},
	})
}

func extToMime(ext string) string {
	switch strings.ToLower(ext) {
	case "jpg", "jpeg":
		return "image/jpeg"
	case "png":
		return "image/png"
	case "gif":
		return "image/gif"
	case "webp":
		return "image/webp"
	case "pdf":
		return "application/pdf"
	case "txt":
		return "text/plain"
	default:
		return "application/octet-stream"
	}
}
