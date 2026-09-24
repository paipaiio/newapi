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

	// CheckIPSubnet 开启后,除精确 IP 外还对 /24 子网做速率检测。
	// 可防止同一 VPN IP 池(换 IP 但同子网)批量注册。默认开启。
	CheckIPSubnet bool `json:"check_ip_subnet"`

	// MaxPerSubnet /24 子网在 WindowHours 内允许的最大注册数。
	// 建议略高于 MaxPerIP,兼顾同一小区/企业多人注册的正常场景。默认 5。
	MaxPerSubnet int `json:"max_per_subnet"`

	// CheckIPv6Subnet 开启后,IPv6 注册地址按 /64 子网做与 MaxPerSubnet 相同的
	// 速率检测(IPv4 /24 的 IPv6 版)。IPv6 家用前缀通常按 /64 分配,同 /64 即同一家庭网络。
	// 默认开启。
	CheckIPv6Subnet bool `json:"check_ipv6_subnet"`

	// CheckInviteeNetwork 开启后,被邀请人与「同一邀请人的其他被邀请人」同注册 IP
	// 或同浏览器指纹,判定为疑似滥用。针对刷号者换 IP/指纹/邮箱批量注册小号填同一
	// 邀请码的场景——小号与邀请人单独比对可能干净,但小号池之间往往共享信号。默认开启。
	CheckInviteeNetwork bool `json:"check_invitee_network"`

	// CheckAPIRequestIP 开启后,记录每个用户发起 API 请求的来源 IP（滚动 7 天），
	// 并在请求时对被邀请人做请求侧 IP 关联检测：请求 IP 与邀请人（其请求/注册/登录 IP）
	// 或与同一邀请人的其他被邀请人的请求 IP 重合，判定为疑似滥用。
	// 注册时可挂代理造假，API 调用一般出自真实出口，这是注册时检测的盲区补强。默认开启。
	CheckAPIRequestIP bool `json:"check_api_request_ip"`

	// MaxInvitesPerInviter 同一邀请人在 WindowHours 内允许的最大邀请注册数(含本次)。
	// 达到该值即判定为疑似滥用。这是针对「换 IP + 换指纹 但用同一个邀请码短时间连续
	// 拉新」这类刷返利的核心信号——现有其它检测都只看被邀请人自身的 IP/指纹/邮箱,
	// 唯独不看「一个邀请码短时间被用了多少次」。默认 2(即第 2 个新号起打标记)。
	// 设为 0 关闭本项检测。
	MaxInvitesPerInviter int `json:"max_invites_per_inviter"`

	// CheckDatacenterIP 开启后,对注册 IP 做机房/VPN 判定:先查本地 CIDR 名单,
	// 未命中再走可选的在线 IP 信誉 API。命中则软处理(不发返利+打标记)。默认开启。
	CheckDatacenterIP bool `json:"check_datacenter_ip"`

	// DatacenterCIDRList 机房/VPN 高风险网段(CIDR,如 "45.128.223.0/24")。
	// 注册 IP 命中任一网段即判定。存为 JSON 数组(单个 option 行)。
	DatacenterCIDRList []string `json:"datacenter_cidr_list"`

	// UseIPReputationAPI 开启后,本地 CIDR 未命中时调用在线 IP 信誉 API(ip-api.com)
	// 判断 proxy/hosting。带 1s 超时 + Redis 缓存 7 天 + 失败放行(fail-open),
	// 不会拖慢或阻断注册。默认开启。
	UseIPReputationAPI bool `json:"use_ip_reputation_api"`

	// TopupUnlockThreshold 滥用标记用户解锁赠金所需的最低累计充值金额（人民币元）。
	// 达到该金额后自动发放暂扣的注册赠额和邀请返利，并可在钱包页查看进度。
	// 默认 50.0（¥50元）。设为 0 关闭此机制（不自动解锁）。
	TopupUnlockThreshold float64 `json:"topup_unlock_threshold"`
}

var inviteAbuseSetting = InviteAbuseSetting{
	Enabled:              false,
	MaxPerIP:             3,
	WindowHours:          24,
	CheckInviterSameIP:   true,
	CheckEmailAlias:      true,
	CheckFingerprint:     true,
	BlockedEmailDomains:  []string{},
	CheckIPSubnet:        true,
	MaxPerSubnet:         5,
	CheckIPv6Subnet:      true,
	CheckInviteeNetwork:  true,
	MaxInvitesPerInviter: 2,
	CheckDatacenterIP:    true,
	DatacenterCIDRList:   []string{},
	UseIPReputationAPI:   true,
	CheckAPIRequestIP:    true,
	TopupUnlockThreshold: 50.0,
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
