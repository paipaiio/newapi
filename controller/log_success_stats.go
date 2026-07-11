package controller

import (
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// SuccessStatsSummary 汇总卡片数据。
type SuccessStatsSummary struct {
	Total       int64   `json:"total"`
	Success     int64   `json:"success"`
	Failed      int64   `json:"failed"`
	SuccessRate float64 `json:"success_rate"` // 0-100，保留两位小数
	AvgUseTime  float64 `json:"avg_use_time"` // 秒，成功请求均值
}

// SuccessStatsDayPoint 每天的趋势数据点。
type SuccessStatsDayPoint struct {
	Date    string `json:"date"`    // YYYY-MM-DD
	Total   int64  `json:"total"`
	Success int64  `json:"success"`
	Failed  int64  `json:"failed"`
}

// SuccessStatsErrorReason 失败原因明细。
type SuccessStatsErrorReason struct {
	Reason string  `json:"reason"` // 截断后的 content 或 stream_status end_reason
	Count  int64   `json:"count"`
	Pct    float64 `json:"pct"` // 占总失败的百分比
}

// SuccessStatsUserRow 按用户统计行（仅管理员接口返回）。
type SuccessStatsUserRow struct {
	UserId      int     `json:"user_id"`
	Username    string  `json:"username"`
	Total       int64   `json:"total"`
	Success     int64   `json:"success"`
	Failed      int64   `json:"failed"`
	SuccessRate float64 `json:"success_rate"`
}

// SuccessStatsResponse 完整响应体。
type SuccessStatsResponse struct {
	Summary  SuccessStatsSummary       `json:"summary"`
	Trend    []SuccessStatsDayPoint    `json:"trend"`
	Errors   []SuccessStatsErrorReason `json:"errors"`
	ByUser   []SuccessStatsUserRow     `json:"by_user,omitempty"` // 仅管理员
}

// parseSuccessStatsRange 从 query string 解析时间范围（start/end 为 Unix 秒）。
// 默认返回近7天。
func parseSuccessStatsRange(c *gin.Context) (int64, int64) {
	now := time.Now()
	defEnd := now.Unix()
	defStart := now.Add(-7 * 24 * time.Hour).Unix()

	startStr := c.Query("start")
	endStr := c.Query("end")

	start := defStart
	end := defEnd

	if v, err := strconv.ParseInt(startStr, 10, 64); err == nil && v > 0 {
		start = v
	}
	if v, err := strconv.ParseInt(endStr, 10, 64); err == nil && v > 0 {
		end = v
	}
	return start, end
}

// buildSuccessStatsQuery 构建基础查询（type=2 且在时间范围内，可选 username/user_id/model 过滤）。
func buildSuccessStatsQuery(start, end int64, username, modelName string, userId int) *gorm.DB {
	q := model.LOG_DB.Table("logs").
		Where("type = ? AND created_at >= ? AND created_at <= ?", model.LogTypeConsume, start, end)
	if strings.TrimSpace(username) != "" {
		q = q.Where("username = ?", strings.TrimSpace(username))
	}
	if userId > 0 {
		q = q.Where("user_id = ?", userId)
	}
	if strings.TrimSpace(modelName) != "" {
		q = q.Where("model_name = ?", strings.TrimSpace(modelName))
	}
	return q
}

// isFailedExpr 判断是否失败的 SQL 表达式（stream_status.status = "error"）。
// 流式失败用 other 里的 stream_status，非流式请求 frt=-1000 全算成功。
const isFailedExpr = `(JSON_UNQUOTE(JSON_EXTRACT(other, '$.stream_status.status')) = 'error')`

// GetSuccessStats 管理员接口：全局 + 按用户成功率统计。
// GET /api/log/success_stats?start=&end=&username=&user_id=&model_name=
func GetSuccessStats(c *gin.Context) {
	start, end := parseSuccessStatsRange(c)
	username := c.Query("username")
	modelName := c.Query("model_name")
	uid, _ := strconv.Atoi(c.Query("user_id"))

	resp := buildSuccessStats(start, end, username, modelName, uid, true)
	common.ApiSuccess(c, resp)
}

// GetSelfSuccessStats 用户接口：仅返回自己的成功率（无用户明细）。
// GET /api/log/self/success_stats?start=&end=&model_name=
func GetSelfSuccessStats(c *gin.Context) {
	start, end := parseSuccessStatsRange(c)
	modelName := c.Query("model_name")
	selfId := c.GetInt("id")

	resp := buildSuccessStats(start, end, "", modelName, selfId, false)
	common.ApiSuccess(c, resp)
}

func buildSuccessStats(start, end int64, username, modelName string, userId int, includeByUser bool) SuccessStatsResponse {
	base := buildSuccessStatsQuery(start, end, username, modelName, userId)

	// --- 汇总 ---
	type summaryRow struct {
		Total      int64
		Failed     int64
		AvgUseTime float64
	}
	var sr summaryRow
	base.Select(
		"COUNT(*) AS total, SUM("+isFailedExpr+") AS failed, AVG(CASE WHEN "+isFailedExpr+" = 0 THEN use_time ELSE NULL END) AS avg_use_time",
	).Scan(&sr)

	success := sr.Total - sr.Failed
	rate := 0.0
	if sr.Total > 0 {
		rate = float64(success) / float64(sr.Total) * 100
	}
	// 保留两位小数
	rate = float64(int(rate*100+0.5)) / 100

	summary := SuccessStatsSummary{
		Total:       sr.Total,
		Success:     success,
		Failed:      sr.Failed,
		SuccessRate: rate,
		AvgUseTime:  sr.AvgUseTime,
	}

	// --- 按天趋势 ---
	type dayRow struct {
		Date   string
		Total  int64
		Failed int64
	}
	var dayRows []dayRow
	base.Select(
		"DATE(FROM_UNIXTIME(created_at)) AS date, COUNT(*) AS total, SUM("+isFailedExpr+") AS failed",
	).Group("date").Order("date asc").Scan(&dayRows)

	trend := make([]SuccessStatsDayPoint, 0, len(dayRows))
	for _, d := range dayRows {
		trend = append(trend, SuccessStatsDayPoint{
			Date:    d.Date,
			Total:   d.Total,
			Success: d.Total - d.Failed,
			Failed:  d.Failed,
		})
	}

	// --- 失败原因明细 ---
	type errRow struct {
		Reason string
		Count  int64
	}
	var errRows []errRow
	// end_reason 优先；若为空则取 content 前80字符
	base.Where(isFailedExpr).
		Select(`COALESCE(
			NULLIF(JSON_UNQUOTE(JSON_EXTRACT(other, '$.stream_status.end_reason')), ''),
			NULLIF(LEFT(content, 80), '')
		) AS reason, COUNT(*) AS count`).
		Group("reason").Order("count desc").Limit(20).Scan(&errRows)

	errors := make([]SuccessStatsErrorReason, 0, len(errRows))
	for _, e := range errRows {
		pct := 0.0
		if sr.Failed > 0 {
			pct = float64(e.Count) / float64(sr.Failed) * 100
			pct = float64(int(pct*100+0.5)) / 100
		}
		errors = append(errors, SuccessStatsErrorReason{
			Reason: e.Reason,
			Count:  e.Count,
			Pct:    pct,
		})
	}

	// --- 按用户明细（仅管理员且未指定单一用户时） ---
	var byUser []SuccessStatsUserRow
	if includeByUser && userId == 0 {
		type userRow struct {
			UserId   int
			Username string
			Total    int64
			Failed   int64
		}
		var userRows []userRow
		base.Select(
			"user_id, username, COUNT(*) AS total, SUM("+isFailedExpr+") AS failed",
		).Group("user_id, username").Order("total desc").Limit(100).Scan(&userRows)

		for _, u := range userRows {
			uSuccess := u.Total - u.Failed
			uRate := 0.0
			if u.Total > 0 {
				uRate = float64(uSuccess) / float64(u.Total) * 100
				uRate = float64(int(uRate*100+0.5)) / 100
			}
			byUser = append(byUser, SuccessStatsUserRow{
				UserId:      u.UserId,
				Username:    u.Username,
				Total:       u.Total,
				Success:     uSuccess,
				Failed:      u.Failed,
				SuccessRate: uRate,
			})
		}
	}

	return SuccessStatsResponse{
		Summary: summary,
		Trend:   trend,
		Errors:  errors,
		ByUser:  byUser,
	}
}
