package operation_setting

import (
	"strings"

	"github.com/QuantumNous/new-api/setting/config"
)

// InviteAbuseSetting 邀请注册滥用检测配置。
//
// 目的:阻止同一个人通过邮箱小号反复注册来薅邀请返利。
// 处理方式是「软」的——始终允许注册,但检测到疑似小号时【不发放邀请返利】
// (邀请人 AffQuota 与被邀请人注册赠额都不发)并在后台给用户打标记,由管理员
// 人工复核。不阻断注册,不误伤真实用户。
//
// 仅对【带邀请码】的注册做判定;无邀请码的注册只记录 IP/指纹备查,不打标记。
//
// ⚠️ IP 信号说明:c.ClientIP() 依赖反代传入的 X-Forwarded-For,若未配置
// 可信代理则理论上可被伪造。因本功能只做软处理(不阻断),伪造 IP 的最坏后果
// 也只是拿不到返利,风险可控。
type InviteAbuseSetting struct {
	// Enabled 总开关,默认关闭。关闭时只记录 register_ip/fingerprint,不做任何判定。
	Enabled bool `json:"enabled"`

	// MaxPerIP 同一注册 IP 在 WindowHours 时间窗内允许的最大注册数。
	// 超过该数则新注册判定为疑似滥用。默认 3。
	MaxPerIP int `json:"max_per_ip"`

	// WindowHours IP 计数的时间窗(小时)。默认 24。
	WindowHours int `json:"window_hours"`

	// CheckInviterSameIP 开启后,被邀请人注册 IP 若命中邀请人的注册 IP 或历史登录 IP,
	// 判定为疑似滥用(自己邀请自己)。默认开启。
	CheckInviterSameIP bool `json:"check_inviter_same_ip"`

	// CheckEmailAlias 开启后,对邮箱做归一化(Gmail 点号 + `+别名`),归一化后若撞已有
	// 用户,或命中一次性邮箱域名黑名单,判定为疑似滥用。默认开启。
	CheckEmailAlias bool `json:"check_email_alias"`

	// CheckFingerprint 开启后,浏览器指纹若命中邀请人指纹,或同一指纹在时间窗内注册数
	// 超过 MaxPerIP,判定为疑似滥用。默认开启。
	CheckFingerprint bool `json:"check_fingerprint"`

	// BlockedEmailDomains 一次性/临时邮箱域名黑名单(小写,不含 @)。命中即判定。
	// 存为 JSON 数组(单个 option 行)。
	BlockedEmailDomains []string `json:"blocked_email_domains"`
}

var inviteAbuseSetting = InviteAbuseSetting{
	Enabled:             false,
	MaxPerIP:            3,
	WindowHours:         24,
	CheckInviterSameIP:  true,
	CheckEmailAlias:     true,
	CheckFingerprint:    true,
	BlockedEmailDomains: []string{},
}

func init() {
	config.GlobalConfig.Register("invite_abuse_setting", &inviteAbuseSetting)
}

func GetInviteAbuseSetting() *InviteAbuseSetting {
	return &inviteAbuseSetting
}

// IsInviteAbuseDetectionEnabled 返回滥用检测总开关是否开启。
func IsInviteAbuseDetectionEnabled() bool {
	return inviteAbuseSetting.Enabled
}

// IsBlockedEmailDomain 判断给定域名(小写,不含 @)是否在一次性邮箱黑名单中。
func (s *InviteAbuseSetting) IsBlockedEmailDomain(domain string) bool {
	domain = strings.ToLower(strings.TrimSpace(domain))
	if domain == "" {
		return false
	}
	for _, d := range s.BlockedEmailDomains {
		if strings.ToLower(strings.TrimSpace(d)) == domain {
			return true
		}
	}
	return false
}
