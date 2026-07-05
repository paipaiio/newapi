package controller

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/url"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

// exportMaxRows 单次导出的最大行数，防止一次性拉取过多数据拖垮内存/DB
const exportMaxRows = 100000

// logTypeText 把日志类型数字转成可读文案
func logTypeText(t int) string {
	switch t {
	case model.LogTypeTopup:
		return "充值"
	case model.LogTypeConsume:
		return "消费"
	case model.LogTypeManage:
		return "管理"
	case model.LogTypeSystem:
		return "系统"
	case model.LogTypeError:
		return "错误"
	case model.LogTypeRefund:
		return "退款"
	case model.LogTypeLogin:
		return "登录"
	default:
		return "未知"
	}
}

// otherNum 从 other JSON map 里安全取数值，返回可写入 CSV 的字符串（缺失返回空串）
func otherNum(m map[string]interface{}, key string) string {
	if m == nil {
		return ""
	}
	v, ok := m[key]
	if !ok || v == nil {
		return ""
	}
	switch n := v.(type) {
	case float64:
		// 去掉多余的小数尾零
		return strconv.FormatFloat(n, 'f', -1, 64)
	case int:
		return strconv.Itoa(n)
	case int64:
		return strconv.FormatInt(n, 10)
	case string:
		return n
	default:
		return fmt.Sprintf("%v", n)
	}
}

// writeLogsCSV 把日志列表写成 CSV 输出到 gin 响应
func writeLogsCSV(c *gin.Context, logs []*model.Log, fileName string) {
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", "attachment; filename=\""+fileName+"\"; filename*=UTF-8''"+url.QueryEscape(fileName))

	// 写入 UTF-8 BOM，保证 Excel 正确识别中文
	c.Writer.Write([]byte{0xEF, 0xBB, 0xBF})

	w := csv.NewWriter(c.Writer)
	defer w.Flush()

	header := []string{
		"时间", "类型", "用户", "模型",
		"输入Tokens", "输出Tokens", "缓存读Tokens", "缓存创建Tokens",
		"用时(秒)", "IP", "RequestID", "上游RequestID", "详情",
	}
	_ = w.Write(header)

	for _, log := range logs {
		var other map[string]interface{}
		if log.Other != "" {
			_ = json.Unmarshal([]byte(log.Other), &other)
		}

		row := []string{
			time.Unix(log.CreatedAt, 0).Format("2006-01-02 15:04:05"),
			logTypeText(log.Type),
			log.Username,
			log.ModelName,
			strconv.Itoa(log.PromptTokens),
			strconv.Itoa(log.CompletionTokens),
			otherNum(other, "cache_tokens"),
			otherNum(other, "cache_creation_tokens"),
			strconv.Itoa(log.UseTime),
			log.Ip,
			log.RequestId,
			log.UpstreamRequestId,
			log.Content,
		}
		_ = w.Write(row)
	}
}

// ExportAllLogs 管理员导出全部用户的使用记录（按筛选条件），返回 CSV
func ExportAllLogs(c *gin.Context) {
	logType, _ := strconv.Atoi(c.Query("type"))
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	username := c.Query("username")
	tokenName := c.Query("token_name")
	modelName := c.Query("model_name")
	channel, _ := strconv.Atoi(c.Query("channel"))
	group := c.Query("group")
	requestId := c.Query("request_id")
	upstreamRequestId := c.Query("upstream_request_id")

	logs, _, err := model.GetAllLogs(logType, startTimestamp, endTimestamp, modelName, username, tokenName, 0, exportMaxRows, channel, group, requestId, upstreamRequestId)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	fileName := fmt.Sprintf("usage_logs_%s.csv", time.Now().Format("20060102_150405"))
	writeLogsCSV(c, logs, fileName)
}

// ExportUserLogs 普通用户导出自己的使用记录（按筛选条件），返回 CSV
func ExportUserLogs(c *gin.Context) {
	userId := c.GetInt("id")
	logType, _ := strconv.Atoi(c.Query("type"))
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	tokenName := c.Query("token_name")
	modelName := c.Query("model_name")
	group := c.Query("group")
	requestId := c.Query("request_id")
	upstreamRequestId := c.Query("upstream_request_id")

	logs, _, err := model.GetUserLogs(userId, logType, startTimestamp, endTimestamp, modelName, tokenName, 0, exportMaxRows, group, requestId, upstreamRequestId)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	// 隐藏 IP 等敏感信息给普通用户？保持与页面展示一致，普通用户日志本就属于自己，这里照常导出
	fileName := fmt.Sprintf("usage_logs_%s.csv", time.Now().Format("20060102_150405"))
	writeLogsCSV(c, logs, fileName)
}
