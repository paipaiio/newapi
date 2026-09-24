package dto

type UserSetting struct {
	NotifyType                       string             `json:"notify_type,omitempty"`                          // QuotaWarningType 额度预警类型
	QuotaWarningThreshold            float64            `json:"quota_warning_threshold,omitempty"`              // QuotaWarningThreshold 额度预警阈值
	WebhookUrl                       string             `json:"webhook_url,omitempty"`                          // WebhookUrl webhook地址
	WebhookSecret                    string             `json:"webhook_secret,omitempty"`                       // WebhookSecret webhook密钥
	NotificationEmail                string             `json:"notification_email,omitempty"`                   // NotificationEmail 通知邮箱地址
	BarkUrl                          string             `json:"bark_url,omitempty"`                             // BarkUrl Bark推送URL
	GotifyUrl                        string             `json:"gotify_url,omitempty"`                           // GotifyUrl Gotify服务器地址
	GotifyToken                      string             `json:"gotify_token,omitempty"`                         // GotifyToken Gotify应用令牌
	GotifyPriority                   int                `json:"gotify_priority"`                                // GotifyPriority Gotify消息优先级
	UpstreamModelUpdateNotifyEnabled bool               `json:"upstream_model_update_notify_enabled,omitempty"` // 是否接收上游模型更新定时检测通知（仅管理员）
	AcceptUnsetRatioModel            bool               `json:"accept_unset_model_ratio_model,omitempty"`       // AcceptUnsetRatioModel 是否接受未设置价格的模型
	RecordIpLog                      bool               `json:"record_ip_log,omitempty"`                        // 是否记录请求和错误日志IP
	SidebarModules                   string             `json:"sidebar_modules,omitempty"`                      // SidebarModules 左侧边栏模块配置
	BillingPreference                string             `json:"billing_preference,omitempty"`                   // BillingPreference 扣费策略（订阅/钱包）
	Language                         string             `json:"language,omitempty"`                             // Language 用户语言偏好 (zh, en)
	RedactRequestEnabled             bool               `json:"redact_request_enabled,omitempty"`               // RedactRequestEnabled 请求发往上游前脱敏 PII/密钥(不影响会话记录)
	VisibleGroups                    []string           `json:"visible_groups,omitempty"`                       // VisibleGroups 可见分组白名单：非空时该用户在分组下拉/模型广场/价格页只看到这些分组（仅影响展示，不强拦 API）
	GroupRatios                      map[string]float64 `json:"group_ratios,omitempty"`                         // GroupRatios 个人分组倍率覆写：分组名→倍率。优先级高于 GroupGroupRatio 与全局 GroupRatio，计费与展示统一生效
	ForcePaid                        bool               `json:"force_paid,omitempty"`                           // ForcePaid 管理员直接标记为付费用户：无需充值记录即可使用付费分组
}

var (
	NotifyTypeEmail   = "email"   // Email 邮件
	NotifyTypeWebhook = "webhook" // Webhook
	NotifyTypeBark    = "bark"    // Bark 推送
	NotifyTypeGotify  = "gotify"  // Gotify 推送
)
