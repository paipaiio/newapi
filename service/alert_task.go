package service

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/bytedance/gopkg/util/gopool"
)

var alertTaskOnce sync.Once

// StartAlertTask 启动邮件告警后台任务（仅主节点）。
func StartAlertTask() {
	alertTaskOnce.Do(func() {
		if !common.IsMasterNode {
			return
		}
		gopool.Go(runAbnormalUsageLoop)
		gopool.Go(runDailyReportLoop)
	})
}

// runAbnormalUsageLoop 每5分钟检测各用户近5分钟消耗，超阈值告警。
func runAbnormalUsageLoop() {
	for {
		time.Sleep(5 * time.Minute)
		s := operation_setting.GetAlertSetting()
		if !s.Enabled || !s.AbnormalUsageEnabled || s.AbnormalUsageThreshold <= 0 {
			continue
		}
		checkAbnormalUsage(s.AbnormalUsageThreshold)
	}
}

func checkAbnormalUsage(threshold int) {
	defer func() {
		if r := recover(); r != nil {
			logger.LogWarn(context.Background(), fmt.Sprintf("checkAbnormalUsage panic: %v", r))
		}
	}()
	end := time.Now().Unix()
	start := end - 300 // 近5分钟

	type usageRow struct {
		UserId   int
		Username string
		Quota    int64
	}
	var rows []usageRow
	err := model.LOG_DB.Table("logs").
		Select("user_id, username, sum(quota) quota").
		Where("type = ? AND created_at >= ? AND created_at <= ?", model.LogTypeConsume, start, end).
		Group("user_id, username").
		Having("sum(quota) >= ?", threshold).
		Scan(&rows).Error
	if err != nil {
		logger.LogWarn(context.Background(), "checkAbnormalUsage query failed: "+err.Error())
		return
	}
	for _, r := range rows {
		usd := float64(r.Quota) / common.QuotaPerUnit
		subject := fmt.Sprintf("[异常用量告警] 用户 %s 5分钟消耗 $%.2f", r.Username, usd)
		content := fmt.Sprintf(
			"用户 <b>%s</b>（ID: %d）在最近5分钟内消耗了 <b>$%.2f</b>（内部额度 %d），超过告警阈值。请检查是否存在盗刷或异常调用。",
			r.Username, r.UserId, usd, r.Quota,
		)
		NotifyRootUser(dto.NotifyTypeChannelUpdate, subject, content)
	}
}

// runDailyReportLoop 每日 00:05 汇总昨日数据并发邮件。
func runDailyReportLoop() {
	for {
		now := time.Now().Local()
		next := time.Date(now.Year(), now.Month(), now.Day()+1, 0, 5, 0, 0, now.Location())
		time.Sleep(time.Until(next))

		s := operation_setting.GetAlertSetting()
		if !s.Enabled || !s.DailyReportEnabled {
			continue
		}
		sendDailyReport()
	}
}

func sendDailyReport() {
	defer func() {
		if r := recover(); r != nil {
			logger.LogWarn(context.Background(), fmt.Sprintf("sendDailyReport panic: %v", r))
		}
	}()
	yesterday := time.Now().AddDate(0, 0, -1)
	loc := time.Local
	dayStart := time.Date(yesterday.Year(), yesterday.Month(), yesterday.Day(), 0, 0, 0, 0, loc).Unix()
	dayEnd := dayStart + 86400
	dateStr := yesterday.Format("2006-01-02")

	// 昨日消费总额（收入侧）
	var totalQuota int64
	model.LOG_DB.Table("logs").
		Where("type = ? AND created_at >= ? AND created_at < ?", model.LogTypeConsume, dayStart, dayEnd).
		Select("COALESCE(sum(quota),0)").Scan(&totalQuota)

	// 昨日充值总额
	var topupQuota int64
	model.LOG_DB.Table("logs").
		Where("type = ? AND created_at >= ? AND created_at < ?", model.LogTypeTopup, dayStart, dayEnd).
		Select("COALESCE(sum(quota),0)").Scan(&topupQuota)

	// 昨日调用次数
	var reqCount int64
	model.LOG_DB.Table("logs").
		Where("type = ? AND created_at >= ? AND created_at < ?", model.LogTypeConsume, dayStart, dayEnd).
		Count(&reqCount)

	// 昨日新增用户
	var newUsers int64
	model.DB.Model(&model.User{}).
		Where("created_at >= ? AND created_at < ?", dayStart, dayEnd).
		Count(&newUsers)

	revenue := float64(totalQuota) / common.QuotaPerUnit
	topup := float64(topupQuota) / common.QuotaPerUnit

	subject := fmt.Sprintf("[每日报表] %s 运营数据", dateStr)
	content := fmt.Sprintf(
		"<h3>%s 运营日报</h3>"+
			"<ul>"+
			"<li>消费总额：<b>$%.2f</b></li>"+
			"<li>充值总额：<b>$%.2f</b></li>"+
			"<li>调用次数：<b>%d</b></li>"+
			"<li>新增用户：<b>%d</b></li>"+
			"</ul>",
		dateStr, revenue, topup, reqCount, newUsers,
	)
	NotifyRootUser(dto.NotifyTypeChannelUpdate, subject, content)
}
