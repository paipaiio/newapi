package operation_setting

import (
	"github.com/QuantumNous/new-api/setting/config"
)

// AlertSetting 邮件告警配置。
type AlertSetting struct {
	Enabled                bool `json:"enabled"`                  // 告警总开关
	AbnormalUsageEnabled   bool `json:"abnormal_usage_enabled"`   // 用户异常用量告警
	AbnormalUsageThreshold int  `json:"abnormal_usage_threshold"` // 单用户5分钟内消耗 quota 阈值（内部单位）
	QuotaSurgeEnabled      bool `json:"quota_surge_enabled"`      // 余额暴增告警
	QuotaSurgeThreshold    int  `json:"quota_surge_threshold"`    // 单笔充值 quota 阈值（内部单位）
	DailyReportEnabled     bool `json:"daily_report_enabled"`     // 每日报表邮件
}

// 默认配置：默认关闭，阈值给一个合理初值（5,000,000 内部单位 = 10 USD）
var alertSetting = AlertSetting{
	Enabled:                false,
	AbnormalUsageEnabled:   false,
	AbnormalUsageThreshold: 5000000,
	QuotaSurgeEnabled:      false,
	QuotaSurgeThreshold:    50000000,
	DailyReportEnabled:     false,
}

func init() {
	config.GlobalConfig.Register("alert_setting", &alertSetting)
}

func GetAlertSetting() *AlertSetting {
	return &alertSetting
}
