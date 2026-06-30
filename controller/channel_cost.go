package controller

import (
	"sort"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
)

// ChannelCostRow 渠道成本/利润统计行（返回给前端）。
type ChannelCostRow struct {
	ChannelId    int     `json:"channel_id"`
	ChannelName  string  `json:"channel_name"`
	CostRatio    float64 `json:"cost_ratio"`
	Revenue      float64 `json:"revenue"`       // 收入 USD = sum(quota) / QuotaPerUnit
	Cost         float64 `json:"cost"`          // 成本 USD = sum(quota/group_ratio) / QuotaPerUnit * cost_ratio
	Profit       float64 `json:"profit"`        // 利润
	ProfitMargin float64 `json:"profit_margin"` // 利润率 %
	Tokens       int64   `json:"tokens"`
	Requests     int64   `json:"requests"`
}

// GetChannelCostStats 按渠道汇总收入/成本/利润（管理员）。
func GetChannelCostStats(c *gin.Context) {
	var start, end int64
	if v := c.Query("start"); v != "" {
		start, _ = strconv.ParseInt(v, 10, 64)
	}
	if v := c.Query("end"); v != "" {
		end, _ = strconv.ParseInt(v, 10, 64)
	}

	stats, err := model.GetChannelGroupStats(start, end)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	groupRatioMap := ratio_setting.GetGroupRatioCopy()

	channels, err := model.GetAllChannels(0, 0, true, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	type chanMeta struct {
		name      string
		costRatio float64
	}
	metaMap := make(map[int]chanMeta, len(channels))
	for _, ch := range channels {
		setting := ch.GetSetting()
		metaMap[ch.Id] = chanMeta{name: ch.Name, costRatio: setting.CostRatio}
	}

	type aggRow struct {
		standardQuotaSum float64
		revenueQuota     int64
		tokens           int64
		requests         int64
	}
	agg := make(map[int]*aggRow)
	for _, s := range stats {
		gr := groupRatioMap[s.Group]
		if gr <= 0 {
			gr = ratio_setting.GetGroupRatio(s.Group)
		}
		if gr <= 0 {
			gr = 1
		}
		row, ok := agg[s.ChannelId]
		if !ok {
			row = &aggRow{}
			agg[s.ChannelId] = row
		}
		row.standardQuotaSum += float64(s.Quota) / gr
		row.revenueQuota += s.Quota
		row.tokens += s.Tokens
		row.requests += s.Count
	}

	qpu := common.QuotaPerUnit
	result := make([]ChannelCostRow, 0, len(agg))
	for chId, a := range agg {
		meta := metaMap[chId]
		revenue := float64(a.revenueQuota) / qpu
		cost := a.standardQuotaSum / qpu * meta.costRatio
		profit := revenue - cost
		margin := 0.0
		if revenue > 0 {
			margin = profit / revenue * 100
		}
		result = append(result, ChannelCostRow{
			ChannelId:    chId,
			ChannelName:  meta.name,
			CostRatio:    meta.costRatio,
			Revenue:      revenue,
			Cost:         cost,
			Profit:       profit,
			ProfitMargin: margin,
			Tokens:       a.tokens,
			Requests:     a.requests,
		})
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Revenue > result[j].Revenue })
	common.ApiSuccess(c, result)
}

// DailyProfitRow 每日利润趋势行。
type DailyProfitRow struct {
	Date    string  `json:"date"`    // YYYY-MM-DD
	Revenue float64 `json:"revenue"` // 当日收入 USD
	Cost    float64 `json:"cost"`    // 当日成本 USD
	Profit  float64 `json:"profit"`  // 当日利润 USD
}

// GetProfitReport 按天汇总收入/成本/利润趋势（管理员）。
// GET /api/log/profit_report?start=&end=
func GetProfitReport(c *gin.Context) {
	var start, end int64
	if v := c.Query("start"); v != "" {
		start, _ = strconv.ParseInt(v, 10, 64)
	}
	if v := c.Query("end"); v != "" {
		end, _ = strconv.ParseInt(v, 10, 64)
	}

	stats, err := model.GetDailyChannelGroupStats(start, end)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	groupRatioMap := ratio_setting.GetGroupRatioCopy()

	channels, err := model.GetAllChannels(0, 0, true, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	costRatioMap := make(map[int]float64, len(channels))
	for _, ch := range channels {
		costRatioMap[ch.Id] = ch.GetSetting().CostRatio
	}

	qpu := common.QuotaPerUnit
	// 按 day 聚合
	type dayAgg struct {
		revenueQuota     float64
		standardQuotaSum float64 // sum(quota/group_ratio)，乘 cost_ratio 得成本
	}
	dayMap := make(map[int64]*dayAgg)
	for _, s := range stats {
		gr := groupRatioMap[s.Group]
		if gr <= 0 {
			gr = ratio_setting.GetGroupRatio(s.Group)
		}
		if gr <= 0 {
			gr = 1
		}
		d, ok := dayMap[s.Day]
		if !ok {
			d = &dayAgg{}
			dayMap[s.Day] = d
		}
		d.revenueQuota += float64(s.Quota)
		// 成本 = 标准原价 × 该渠道成本系数
		d.standardQuotaSum += float64(s.Quota) / gr * costRatioMap[s.ChannelId]
	}

	// 转成有序切片
	days := make([]int64, 0, len(dayMap))
	for day := range dayMap {
		days = append(days, day)
	}
	sort.Slice(days, func(i, j int) bool { return days[i] < days[j] })

	result := make([]DailyProfitRow, 0, len(days))
	for _, day := range days {
		a := dayMap[day]
		revenue := a.revenueQuota / qpu
		cost := a.standardQuotaSum / qpu
		ts := time.Unix(day*86400, 0).UTC()
		result = append(result, DailyProfitRow{
			Date:    ts.Format("2006-01-02"),
			Revenue: revenue,
			Cost:    cost,
			Profit:  revenue - cost,
		})
	}
	common.ApiSuccess(c, result)
}
