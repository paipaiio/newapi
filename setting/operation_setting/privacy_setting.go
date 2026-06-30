package operation_setting

import "github.com/QuantumNous/new-api/setting/config"

// PrivacySetting 隐私过滤配置。
// 在请求发往上游 LLM 之前,可选地脱敏掉用户消息正文里的 PII(邮箱/电话/身份证/
// 银行卡/IP)与密钥(API key、token、私钥等)。规则集来自 packyme/privacy-filter,
// 通过 go:embed 内嵌进二进制(222 条 gitleaks 规则)。
//
// 重要:本设置只影响【发往上游的请求副本】,不影响会话记录(session_logs)——
// 会话记录始终保存用户提交的原始正文,以保证审计与检索的完整性。
type PrivacySetting struct {
	// RedactLive: 开启后,Chat Completions 请求在发往上游前会脱敏 user 消息正文。
	// 默认关闭。注意:可能误伤正常的编码任务正文(如 base64、git SHA、文件路径里
	// 碰巧像密钥的随机串),仅在确有合规需求时开启。
	RedactLive bool `json:"redact_live"`
}

var privacySetting = PrivacySetting{
	RedactLive: false,
}

func init() {
	config.GlobalConfig.Register("privacy_setting", &privacySetting)
}

func GetPrivacySetting() *PrivacySetting {
	return &privacySetting
}

// IsLiveRedactionEnabled 返回是否对发往上游的请求做实时脱敏。
func IsLiveRedactionEnabled() bool {
	return privacySetting.RedactLive
}
