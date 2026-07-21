package model

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
)

// InviteAbuseResult 滥用检测结果。
type InviteAbuseResult struct {
	Flagged bool
	Reason  string
}

// normalizeEmailForAbuse 归一化邮箱用于「同一个人」判定:
//   - 统一小写
//   - 去掉 local part 的 `+别名` 后缀
//   - Gmail 系(gmail.com / googlemail.com)去掉 local part 中的所有点号
//
// 返回归一化后的邮箱与其域名(小写)。非法邮箱原样返回、域名为空。
func normalizeEmailForAbuse(email string) (normalized string, domain string) {
	email = strings.TrimSpace(strings.ToLower(email))
	at := strings.LastIndex(email, "@")
	if at <= 0 || at == len(email)-1 {
		return email, ""
	}
	local := email[:at]
	domain = email[at+1:]

	// 去 +别名
	if plus := strings.Index(local, "+"); plus >= 0 {
		local = local[:plus]
	}
	// Gmail 点号无意义
	if domain == "gmail.com" || domain == "googlemail.com" {
		local = strings.ReplaceAll(local, ".", "")
	}
	if local == "" {
		return email, domain
	}
	return local + "@" + domain, domain
}

// HashFingerprint 对前端上报的原始指纹字符串做 SHA-256 截断,避免超长/注入。
// 空串返回空串。
func HashFingerprint(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	// 已是 64 位 hex(前端已哈希)则直接用小写
	if len(raw) == 64 && isHex(raw) {
		return strings.ToLower(raw)
	}
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func isHex(s string) bool {
	for _, c := range s {
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')) {
			return false
		}
	}
	return true
}

// countRecentRegistrationsByIP 统计某 IP 在最近 windowHours 小时内的注册数(含软删除,防止删号绕过)。
func countRecentRegistrationsByIP(ip string, windowHours int) int64 {
	if ip == "" {
		return 0
	}
	since := common.GetTimestamp() - int64(windowHours)*3600
	var count int64
	DB.Unscoped().Model(&User{}).
		Where("register_ip = ? AND created_at >= ?", ip, since).
		Count(&count)
	return count
}

// extractIPSubnet24 从 IPv4 地址中提取 /24 子网前缀(如 "92.44.27.")。
// IPv6 或格式异常时返回空字符串。
func extractIPSubnet24(ip string) string {
	parts := strings.SplitN(ip, ".", 4)
	if len(parts) == 4 {
		return parts[0] + "." + parts[1] + "." + parts[2] + "."
	}
	return ""
}

// countRecentRegistrationsBySubnet24 统计同 /24 子网在时间窗内的注册数(含软删除)。
func countRecentRegistrationsBySubnet24(subnet string, windowHours int) int64 {
	if subnet == "" {
		return 0
	}
	since := common.GetTimestamp() - int64(windowHours)*3600
	var count int64
	DB.Unscoped().Model(&User{}).
		Where("register_ip LIKE ? AND created_at >= ?", subnet+"%", since).
		Count(&count)
	return count
}

// countRecentRegistrationsByFingerprint 统计某指纹在最近 windowHours 小时内的注册数(含软删除)。
func countRecentRegistrationsByFingerprint(fp string, windowHours int) int64 {
	if fp == "" {
		return 0
	}
	since := common.GetTimestamp() - int64(windowHours)*3600
	var count int64
	DB.Unscoped().Model(&User{}).
		Where("register_fingerprint = ? AND created_at >= ?", fp, since).
		Count(&count)
	return count
}

// countRecentInvitesByInviter 统计某邀请人在最近 windowHours 小时内的邀请注册数(含软删除)。
// 用于 Layer 1「每邀请人邀请速率」检测——这是针对「换 IP+换指纹 但用同一邀请码短时间连续
// 拉新」这类刷返利的核心信号。计数不含本次(本次尚未入库),调用方比较时用 >= (阈值-1)。
func countRecentInvitesByInviter(inviterId int, windowHours int) int64 {
	if inviterId == 0 {
		return 0
	}
	since := common.GetTimestamp() - int64(windowHours)*3600
	var count int64
	DB.Unscoped().Model(&User{}).
		Where("inviter_id = ? AND created_at >= ?", inviterId, since).
		Count(&count)
	return count
}

// ipInCIDRList 判断 IP 是否命中任一 CIDR 网段。非法 IP / 空列表返回 false。
func ipInCIDRList(ipStr string, cidrs []string) bool {
	if ipStr == "" || len(cidrs) == 0 {
		return false
	}
	ip := net.ParseIP(ipStr)
	if ip == nil {
		return false
	}
	for _, c := range cidrs {
		c = strings.TrimSpace(c)
		if c == "" {
			continue
		}
		_, ipNet, err := net.ParseCIDR(c)
		if err != nil {
			continue
		}
		if ipNet.Contains(ip) {
			return true
		}
	}
	return false
}

// ipReputationCacheTTL IP 信誉结果缓存时长(命中/未命中都缓存,减少外部调用)。
const ipReputationCacheTTL = 7 * 24 * time.Hour

// isDatacenterIPViaAPI 通过在线 IP 信誉 API(ip-api.com,免费无 key)判断该 IP 是否
// 属于代理/机房/托管网络。带 Redis 缓存(7天) + 1s 超时 + 失败放行(fail-open):
// 任何错误/超时都返回 false,绝不阻断或拖慢注册。
func isDatacenterIPViaAPI(ipStr string) bool {
	if ipStr == "" {
		return false
	}
	ip := net.ParseIP(ipStr)
	if ip == nil || ip.IsPrivate() || ip.IsLoopback() {
		return false
	}

	cacheKey := "ip_reputation:" + ipStr
	if common.RedisEnabled {
		if cached, err := common.RedisGet(cacheKey); err == nil {
			return cached == "1"
		}
	}

	// ip-api.com: proxy=VPN/代理/Tor, hosting=机房/托管. 只取这两个字段。
	url := fmt.Sprintf("http://ip-api.com/json/%s?fields=status,proxy,hosting", ipStr)
	client := &http.Client{Timeout: 1 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return false // fail-open
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return false
	}
	var r struct {
		Status  string `json:"status"`
		Proxy   bool   `json:"proxy"`
		Hosting bool   `json:"hosting"`
	}
	if json.Unmarshal(body, &r) != nil || r.Status != "success" {
		return false
	}
	isDC := r.Proxy || r.Hosting
	if common.RedisEnabled {
		val := "0"
		if isDC {
			val = "1"
		}
		_ = common.RedisSet(cacheKey, val, ipReputationCacheTTL)
	}
	return isDC
}

// inviterUsesIP 判断邀请人是否用过该 IP(注册 IP 或历史登录 IP)。
func inviterUsesIP(inviterId int, ip string) bool {
	if inviterId == 0 || ip == "" {
		return false
	}
	// 注册 IP
	var cnt int64
	DB.Unscoped().Model(&User{}).Where("id = ? AND register_ip = ?", inviterId, ip).Count(&cnt)
	if cnt > 0 {
		return true
	}
	// 历史登录 IP(logs 表 type=LogTypeLogin)
	var logCnt int64
	LOG_DB.Model(&Log{}).Where("user_id = ? AND type = ? AND ip = ?", inviterId, LogTypeLogin, ip).Count(&logCnt)
	return logCnt > 0
}

// inviterUsesFingerprint 判断邀请人注册指纹是否与本次相同。
func inviterUsesFingerprint(inviterId int, fp string) bool {
	if inviterId == 0 || fp == "" {
		return false
	}
	var cnt int64
	DB.Unscoped().Model(&User{}).Where("id = ? AND register_fingerprint = ?", inviterId, fp).Count(&cnt)
	return cnt > 0
}

// emailAliasCollision 归一化邮箱后是否撞已有(含软删除)用户。
// rawEmail 为本次注册邮箱。只在有 email 时有意义。
func emailAliasCollision(rawEmail string) bool {
	norm, _ := normalizeEmailForAbuse(rawEmail)
	if norm == "" || !strings.Contains(norm, "@") {
		return false
	}
	// 若归一化后与原邮箱相同,精确唯一性已由注册流程保证,无需再查(避免自撞)。
	if strings.EqualFold(norm, strings.TrimSpace(strings.ToLower(rawEmail))) {
		return false
	}
	// 拉取所有同域名候选做归一化比对(域名量级可控;Gmail 点号无法用 SQL 直接匹配)。
	_, domain := normalizeEmailForAbuse(rawEmail)
	var emails []string
	DB.Unscoped().Model(&User{}).
		Where("email LIKE ?", "%@"+domain).
		Pluck("email", &emails)
	for _, e := range emails {
		en, _ := normalizeEmailForAbuse(e)
		if en == norm {
			return true
		}
	}
	return false
}

// DetectInviteAbuse 对一次注册做疑似滥用判定,覆盖两类滥用:
//   - 邀请刷号(inviterId != 0):与邀请人同 IP/指纹、邮箱别名撞库等
//   - 无邀请码的批量注册(inviterId == 0):同 IP/指纹短时间内连续注册、一次性邮箱
//
// 仅当总开关开启时判定。inviterId==0 时跳过「邀请人专属」检测,只跑速率/邮箱检测。
// registrantIP / fingerprint 已由调用方处理(fingerprint 建议先 HashFingerprint)。
func DetectInviteAbuse(inviterId int, registrantIP, fingerprint, rawEmail string) InviteAbuseResult {
	s := operation_setting.GetInviteAbuseSetting()
	if !s.Enabled {
		return InviteAbuseResult{}
	}

	var reasons []string

	// 1. 邮箱别名归一化撞库 + 一次性邮箱域名黑名单
	if s.CheckEmailAlias && rawEmail != "" {
		_, domain := normalizeEmailForAbuse(rawEmail)
		if s.IsBlockedEmailDomain(domain) {
			reasons = append(reasons, fmt.Sprintf("一次性邮箱域名(%s)", domain))
		} else if emailAliasCollision(rawEmail) {
			reasons = append(reasons, "邮箱别名与已有账号归一化后相同")
		}
	}

	// 2. 邀请人与被邀请人同 IP / 同指纹(自己邀请自己)
	if s.CheckInviterSameIP && inviterUsesIP(inviterId, registrantIP) {
		reasons = append(reasons, "与邀请人同一注册/登录 IP")
	}
	if s.CheckFingerprint && inviterUsesFingerprint(inviterId, fingerprint) {
		reasons = append(reasons, "与邀请人浏览器指纹相同")
	}

	// 3. 同 IP / 同指纹 在时间窗内注册数超阈值
	if s.MaxPerIP > 0 {
		if registrantIP != "" && countRecentRegistrationsByIP(registrantIP, s.WindowHours) >= int64(s.MaxPerIP) {
			reasons = append(reasons, fmt.Sprintf("同 IP %d 小时内注册数达上限(%d)", s.WindowHours, s.MaxPerIP))
		}
		if s.CheckFingerprint && fingerprint != "" && countRecentRegistrationsByFingerprint(fingerprint, s.WindowHours) >= int64(s.MaxPerIP) {
			reasons = append(reasons, fmt.Sprintf("同指纹 %d 小时内注册数达上限(%d)", s.WindowHours, s.MaxPerIP))
		}
	}

	// 4. /24 子网速率检测——防止同一 VPN IP 池在不同 IP 下批量注册
	if s.CheckIPSubnet && s.MaxPerSubnet > 0 && registrantIP != "" {
		subnet := extractIPSubnet24(registrantIP)
		if subnet != "" && countRecentRegistrationsBySubnet24(subnet, s.WindowHours) >= int64(s.MaxPerSubnet) {
			reasons = append(reasons, fmt.Sprintf("同IP段(%s0/24) %d 小时内注册数达上限(%d)", subnet, s.WindowHours, s.MaxPerSubnet))
		}
	}

	// 5. Layer 1: 每邀请人邀请速率——同一邀请码短时间内被反复使用(换 IP+换指纹 也拦得住)。
	// 已入库数 >= 阈值-1 时,加上本次即达到阈值,判定为疑似滥用。
	if inviterId != 0 && s.MaxInvitesPerInviter > 0 {
		if countRecentInvitesByInviter(inviterId, s.WindowHours) >= int64(s.MaxInvitesPerInviter-1) {
			reasons = append(reasons, fmt.Sprintf("同一邀请人 %d 小时内邀请注册数达上限(%d)", s.WindowHours, s.MaxInvitesPerInviter))
		}
	}

	// 6. Layer 2: 机房/VPN IP 判定——先查本地 CIDR 名单,未命中再走可选在线信誉 API。
	if s.CheckDatacenterIP && registrantIP != "" {
		if ipInCIDRList(registrantIP, s.DatacenterCIDRList) {
			reasons = append(reasons, "注册 IP 命中机房/VPN 网段名单")
		} else if s.UseIPReputationAPI && isDatacenterIPViaAPI(registrantIP) {
			reasons = append(reasons, "注册 IP 经信誉库判定为机房/代理")
		}
	}

	if len(reasons) == 0 {
		return InviteAbuseResult{}
	}
	reason := strings.Join(reasons, "；")
	if len(reason) > 255 {
		reason = string([]rune(reason)[:120])
	}
	return InviteAbuseResult{Flagged: true, Reason: reason}
}
