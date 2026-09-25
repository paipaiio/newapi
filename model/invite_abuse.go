package model

import (
	"cmp"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"slices"
	"strings"
	"sync"
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

// countRecentInviteesByIP 统计某邀请人的被邀请人中,最近 windowHours 小时内
// 是否有使用同一注册 IP 的(含软删除,防止删号绕过)。
// 用于「小号横向关联」检测——刷号者换 IP/指纹/邮箱注册多个小号填同一邀请码时,
// 每个小号与邀请人比对可能都是干净的,但小号之间往往共享 IP。
func countRecentInviteesByIP(inviterId int, ip string, windowHours int) int64 {
	if inviterId == 0 || ip == "" {
		return 0
	}
	since := common.GetTimestamp() - int64(windowHours)*3600
	var count int64
	DB.Unscoped().Model(&User{}).
		Where("inviter_id = ? AND register_ip = ? AND created_at >= ?", inviterId, ip, since).
		Count(&count)
	return count
}

// countRecentInviteesByFingerprint 同 countRecentInviteesByIP，信号换成浏览器指纹。
func countRecentInviteesByFingerprint(inviterId int, fp string, windowHours int) int64 {
	if inviterId == 0 || fp == "" {
		return 0
	}
	since := common.GetTimestamp() - int64(windowHours)*3600
	var count int64
	DB.Unscoped().Model(&User{}).
		Where("inviter_id = ? AND register_fingerprint = ? AND created_at >= ?", inviterId, fp, since).
		Count(&count)
	return count
}

// sameIPv6Subnet64 判断两个 IPv6 地址文本是否属于同一 /64 子网。
// 任一方不是 IPv6 返回 false。
func sameIPv6Subnet64(a, b string) bool {
	pa, pb := net.ParseIP(a), net.ParseIP(b)
	if pa == nil || pb == nil || pa.To4() != nil || pb.To4() != nil {
		return false
	}
	mask := net.CIDRMask(64, 128)
	return pa.Mask(mask).Equal(pb.Mask(mask))
}

// countRecentRegistrationsByIPv6Subnet64 统计与给定 IPv6 地址同 /64 子网
// 在最近 windowHours 小时内的注册数(含软删除)。
//
// 实现说明:数据库存的是 c.ClientIP() 的压缩文本形式,无法直接用 LIKE 做
// /64 前缀匹配("::" 压缩点位置不定)。改用两段式:先按首 hextet 文本前缀
// LIKE 走 register_ip 索引缩小候选(IPv6 文本首段无前导零,稳定可匹配;
// 首段为 0 时 "::" 开头的形式单独 OR),再在 Go 侧用 /64 掩码精确比对。
func countRecentRegistrationsByIPv6Subnet64(ip string, windowHours int) int64 {
	parsed := net.ParseIP(ip)
	if parsed == nil || parsed.To4() != nil {
		return 0
	}
	since := common.GetTimestamp() - int64(windowHours)*3600
	first := strings.SplitN(parsed.String(), ":", 2)[0]
	query := DB.Unscoped().Model(&User{}).Where("created_at >= ?", since)
	if first == "0" {
		query = query.Where("register_ip LIKE ? OR register_ip LIKE ?", "0:%", "::%")
	} else {
		query = query.Where("register_ip LIKE ?", first+":%")
	}
	var candidates []string
	if err := query.Pluck("register_ip", &candidates).Error; err != nil {
		return 0
	}
	var count int64
	for _, s := range candidates {
		if sameIPv6Subnet64(ip, s) {
			count++
		}
	}
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

	// 7. 小号横向关联:被邀请人与同一邀请人的其他被邀请人同 IP/同指纹。
	// 刷号者换 IP+换指纹+换邮箱注册多个小号填同一邀请码时,每个小号对邀请人
	// 单独看都可能干净(Layer 1 速率之外),但小号池往往共享部分信号。
	if s.CheckInviteeNetwork && inviterId != 0 {
		if registrantIP != "" && countRecentInviteesByIP(inviterId, registrantIP, s.WindowHours) > 0 {
			reasons = append(reasons, "与同一邀请人的其他被邀请人使用相同注册 IP")
		}
		if s.CheckFingerprint && fingerprint != "" && countRecentInviteesByFingerprint(inviterId, fingerprint, s.WindowHours) > 0 {
			reasons = append(reasons, "与同一邀请人的其他被邀请人浏览器指纹相同")
		}
	}

	// 8. IPv6 /64 子网速率——与 IPv4 /24 同理,防同一 IPv6 段批量注册。
	if s.CheckIPSubnet && s.CheckIPv6Subnet && s.MaxPerSubnet > 0 && registrantIP != "" {
		if n := countRecentRegistrationsByIPv6Subnet64(registrantIP, s.WindowHours); n >= int64(s.MaxPerSubnet) {
			reasons = append(reasons, fmt.Sprintf("同IPv6段(/64) %d 小时内注册数达上限(%d)", s.WindowHours, s.MaxPerSubnet))
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

// ============================================================================
// API 请求侧 IP 信号（请求时检测，补注册时检测的盲区）
//
// 注册时的 IP 检测可以挂代理造假，但 API 调用流量一般出自真实出口 IP。
// 因此额外记录「每个用户最近发起 API 请求的来源 IP」（滚动 7 天），并在
// 每次请求时对被邀请人做两类关联判定：
//  1. 请求 IP 与邀请人重合（邀请人自己的请求 IP / 注册 IP / 登录 IP）
//  2. 请求 IP 与同一邀请人的其他被邀请人的请求 IP 重合（小号池共享出口）
// 存储优先 Redis（JSON 字符串读改写），未启用 Redis 时退化为进程内 map
// （单实例全量；多实例只能看到本机流量，属可接受的 best-effort 降级）。
// ============================================================================

// apiRequestIPTTL 请求 IP 记录的滚动保留时长。
const apiRequestIPTTL = 7 * 24 * time.Hour

// maxRecordedRequestIPsPerUser 单用户最多保留的请求 IP 数，超出时淘汰最早过期的。
const maxRecordedRequestIPsPerUser = 32

// inviteeListCacheTTL 邀请人 → 被邀请人 ID 列表的缓存时长（避免每个请求都查库）。
const inviteeListCacheTTL = 5 * time.Minute

// pruneExpiredIPs 就地清理已过期的 IP 记录，返回剩余数量。
func pruneExpiredIPs(ips map[string]int64, now int64) int {
	for ip, exp := range ips {
		if exp <= now {
			delete(ips, ip)
		}
	}
	return len(ips)
}

// loadRequestIPs 读取某用户最近的请求 IP 记录（expiry: unix 秒）。无记录返回空 map。
func loadRequestIPs(userId int) map[string]int64 {
	if common.RedisEnabled {
		key := fmt.Sprintf("urip:u:%d", userId)
		raw, err := common.RedisGet(key)
		if err == nil && raw != "" {
			var ips map[string]int64
			if common.Unmarshal([]byte(raw), &ips) == nil {
				return ips
			}
		}
		return map[string]int64{}
	}
	return requestIPMemLoad(userId)
}

// saveRequestIPs 写回某用户的请求 IP 记录并续期 TTL。
func saveRequestIPs(userId int, ips map[string]int64) {
	if common.RedisEnabled {
		key := fmt.Sprintf("urip:u:%d", userId)
		data, err := common.Marshal(ips)
		if err == nil {
			_ = common.RedisSet(key, string(data), apiRequestIPTTL)
		}
		return
	}
	requestIPMemStore(userId, ips)
}

// requestIPMemStoreData 进程内兜底存储：userId -> ip -> expiry。
var requestIPMem = struct {
	sync.Mutex
	users map[int]map[string]int64
}{users: make(map[int]map[string]int64)}

func requestIPMemLoad(userId int) map[string]int64 {
	requestIPMem.Lock()
	defer requestIPMem.Unlock()
	src, ok := requestIPMem.users[userId]
	if !ok {
		return map[string]int64{}
	}
	ips := make(map[string]int64, len(src))
	for ip, exp := range src {
		ips[ip] = exp
	}
	return ips
}

func requestIPMemStore(userId int, ips map[string]int64) {
	requestIPMem.Lock()
	defer requestIPMem.Unlock()
	if len(ips) == 0 {
		delete(requestIPMem.users, userId)
		return
	}
	requestIPMem.users[userId] = ips
}

// RecordAPIRequestIP 记录某用户的一次 API 请求来源 IP（滚动窗口，容量有上限）。
// 热路径调用：读改写单个小 JSON key，未启用 Redis 时纯内存操作，失败静默。
func RecordAPIRequestIP(userId int, ip string) {
	if userId <= 0 || ip == "" {
		return
	}
	now := common.GetTimestamp()
	expiry := now + int64(apiRequestIPTTL/time.Second)
	ips := loadRequestIPs(userId)
	pruneExpiredIPs(ips, now)
	ips[ip] = expiry
	// 容量控制：淘汰最早过期的条目
	for len(ips) > maxRecordedRequestIPsPerUser {
		oldestIP, oldestExp := "", int64(-1)
		for k, v := range ips {
			if oldestExp == -1 || v < oldestExp {
				oldestIP, oldestExp = k, v
			}
		}
		delete(ips, oldestIP)
	}
	saveRequestIPs(userId, ips)
}

// userHasRecentRequestIP 判断某用户最近是否从指定 IP 发起过 API 请求。
func userHasRecentRequestIP(userId int, ip string) bool {
	if userId <= 0 || ip == "" {
		return false
	}
	ips := loadRequestIPs(userId)
	exp, ok := ips[ip]
	return ok && exp > common.GetTimestamp()
}

// APIRequestIPRecord 某用户的一条 API 请求来源 IP 记录（管理端复核展示用）。
type APIRequestIPRecord struct {
	IP       string `json:"ip"`
	LastSeen int64  `json:"last_seen"` // unix 秒：由滚动过期时间反推的最近出现时刻
}

// GetRecentRequestIPs 返回某用户最近的 API 请求来源 IP（未过期，按最近出现时间倒序）。
// 管理端邀请滥用复核用；记录自本功能上线起累计，滚动 7 天。
func GetRecentRequestIPs(userId int) []APIRequestIPRecord {
	if userId <= 0 {
		return nil
	}
	now := common.GetTimestamp()
	ips := loadRequestIPs(userId)
	records := make([]APIRequestIPRecord, 0, len(ips))
	for ip, exp := range ips {
		if exp <= now {
			continue
		}
		records = append(records, APIRequestIPRecord{
			IP:       ip,
			LastSeen: exp - int64(apiRequestIPTTL/time.Second),
		})
	}
	slices.SortFunc(records, func(a, b APIRequestIPRecord) int {
		if a.LastSeen != b.LastSeen {
			return cmp.Compare(b.LastSeen, a.LastSeen)
		}
		return strings.Compare(a.IP, b.IP)
	})
	return records
}

// recentInviteeIDsOf 某邀请人在时间窗内的被邀请人 ID 列表（排除指定用户）。
// 结果按邀请人缓存 inviteeListCacheTTL，避免每个请求都查库。
func recentInviteeIDsOf(inviterId, excludeUserId, windowHours int) []int {
	if inviterId <= 0 {
		return nil
	}
	cacheKey := fmt.Sprintf("urip:inv:%d:%d", inviterId, excludeUserId)
	if common.RedisEnabled {
		if raw, err := common.RedisGet(cacheKey); err == nil && raw != "" {
			var ids []int
			if common.Unmarshal([]byte(raw), &ids) == nil {
				return ids
			}
		}
	}
	since := common.GetTimestamp() - int64(windowHours)*3600
	ids := make([]int, 0, 8)
	DB.Unscoped().Model(&User{}).
		Where("inviter_id = ? AND created_at >= ? AND id != ?", inviterId, since, excludeUserId).
		Pluck("id", &ids)
	if common.RedisEnabled {
		if data, err := common.Marshal(ids); err == nil {
			_ = common.RedisSet(cacheKey, string(data), inviteeListCacheTTL)
		}
	}
	return ids
}

// DetectAPIRequestAbuse 请求时滥用检测（软处理，调用方负责打标）。
// 先无条件记录本次请求 IP（供后续其他用户的关联判定使用），再对有邀请人的
// 用户做两类请求侧 IP 关联检测。失败一律放行（fail-open），绝不影响请求。
func DetectAPIRequestAbuse(userId, inviterId int, requestIP string) InviteAbuseResult {
	RecordAPIRequestIP(userId, requestIP)

	s := operation_setting.GetInviteAbuseSetting()
	if !s.Enabled || !s.CheckAPIRequestIP {
		return InviteAbuseResult{}
	}
	if inviterId == 0 || requestIP == "" {
		return InviteAbuseResult{}
	}

	var reasons []string
	// 1. 请求 IP 与邀请人重合：邀请人自己的请求 IP，或其注册/历史登录 IP。
	// 注册时挂代理、调 API 回真实出口的场景在这里现形。
	if userHasRecentRequestIP(inviterId, requestIP) || inviterUsesIP(inviterId, requestIP) {
		reasons = append(reasons, "API 请求 IP 与邀请人相同")
	}
	// 2. 请求 IP 与同一邀请人的其他被邀请人的请求 IP 重合（小号池共享出口）。
	for _, id := range recentInviteeIDsOf(inviterId, userId, s.WindowHours) {
		if userHasRecentRequestIP(id, requestIP) {
			reasons = append(reasons, "与同一邀请人的其他被邀请人使用相同 API 请求 IP")
			break
		}
	}

	if len(reasons) == 0 {
		return InviteAbuseResult{}
	}
	return InviteAbuseResult{Flagged: true, Reason: strings.Join(reasons, "；")}
}

// FlagUserForInviteAbuse 给已存在的用户打疑似滥用标记（请求时检测命中用）。
// 已标记用户跳过；成功后失效用户缓存并记日志。软处理：不阻断、不动已发放额度。
func FlagUserForInviteAbuse(userId int, reason string) error {
	if userId <= 0 {
		return nil
	}
	if len(reason) > 255 {
		reason = string([]rune(reason)[:120])
	}
	// 兼容历史/手工插入的 NULL 值：NULL 视为未标记
	res := DB.Model(&User{}).
		Where("id = ? AND (invite_abuse_flagged = ? OR invite_abuse_flagged IS NULL)", userId, false).
		Updates(map[string]any{"invite_abuse_flagged": true, "invite_abuse_reason": reason})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected > 0 {
		_ = InvalidateUserCache(userId)
		common.SysLog(fmt.Sprintf("疑似滥用(API请求侧): user_id=%d reason=%s", userId, reason))
	}
	return nil
}

// ============================================================================
// 滥用复核列表（管理端单独页面）
// ============================================================================

// FlaggedInviteAbuseUser 复核列表单行：被标记用户摘要 + 请求侧证据。
type FlaggedInviteAbuseUser struct {
	Id                  int                  `json:"id"`
	Username            string               `json:"username"`
	Email               string               `json:"email"`
	Group               string               `json:"group"`
	Status              int                  `json:"status"`
	Quota               int                  `json:"quota"`
	CreatedAt           int64                `json:"created_at"`
	RegisterIP          string               `json:"register_ip"`
	RegisterFingerprint string               `json:"register_fingerprint"`
	Reason              string               `json:"reason"`
	InviterId           int                  `json:"inviter_id"`
	RequestIPs          []APIRequestIPRecord `json:"request_ips"`
	Inviter             *FlaggedInviterInfo  `json:"inviter"`
}

// FlaggedInviterInfo 复核列表中的邀请人摘要（用于对照证据）。
type FlaggedInviterInfo struct {
	Id         int                  `json:"id"`
	Username   string               `json:"username"`
	RegisterIP string               `json:"register_ip"`
	RequestIPs []APIRequestIPRecord `json:"request_ips"`
}

// ListFlaggedInviteAbuseUsers 所有被标记疑似邀请滥用的用户（含邀请人与请求 IP 对照），按 ID 倒序。
func ListFlaggedInviteAbuseUsers() ([]FlaggedInviteAbuseUser, error) {
	var users []User
	if err := DB.Where("invite_abuse_flagged = ?", true).Order("id DESC").Find(&users).Error; err != nil {
		return nil, err
	}
	rows := make([]FlaggedInviteAbuseUser, 0, len(users))
	for _, u := range users {
		row := FlaggedInviteAbuseUser{
			Id:                  u.Id,
			Username:            u.Username,
			Email:               u.Email,
			Group:               u.Group,
			Status:              u.Status,
			Quota:               u.Quota,
			CreatedAt:           u.CreatedAt,
			RegisterIP:          u.RegisterIP,
			RegisterFingerprint: u.RegisterFingerprint,
			Reason:              u.InviteAbuseReason,
			InviterId:           u.InviterId,
			RequestIPs:          GetRecentRequestIPs(u.Id),
		}
		if u.InviterId != 0 {
			if inviter, err := GetUserById(u.InviterId, false); err == nil {
				row.Inviter = &FlaggedInviterInfo{
					Id:         inviter.Id,
					Username:   inviter.Username,
					RegisterIP: inviter.RegisterIP,
					RequestIPs: GetRecentRequestIPs(inviter.Id),
				}
			}
		}
		rows = append(rows, row)
	}
	return rows, nil
}

// RelatedAccount 关联账号：与某被标记用户同处一个邀请关系链的账号（邀请人 / 同邀请人名下的被邀请人）。
type RelatedAccount struct {
	Id                  int                  `json:"id"`
	Username            string               `json:"username"`
	Role                int                  `json:"role"`
	Status              int                  `json:"status"`
	Group               string               `json:"group"`
	CreatedAt           int64                `json:"created_at"`
	RegisterIP          string               `json:"register_ip"`
	RegisterFingerprint string               `json:"register_fingerprint"`
	InviteAbuseFlagged  bool                 `json:"invite_abuse_flagged"`
	InviteAbuseReason   string               `json:"invite_abuse_reason"`
	RequestIPs          []APIRequestIPRecord `json:"request_ips"`
}

func toRelatedAccount(u *User) RelatedAccount {
	return RelatedAccount{
		Id:                  u.Id,
		Username:            u.Username,
		Role:                u.Role,
		Status:              u.Status,
		Group:               u.Group,
		CreatedAt:           u.CreatedAt,
		RegisterIP:          u.RegisterIP,
		RegisterFingerprint: u.RegisterFingerprint,
		InviteAbuseFlagged:  u.InviteAbuseFlagged,
		InviteAbuseReason:   u.InviteAbuseReason,
		RequestIPs:          GetRecentRequestIPs(u.Id),
	}
}

// RelatedInviteAbuseAccounts 以某用户为起点，「一键列出涉及账号」：
// 其邀请人 + 同一邀请人名下的全部被邀请人（含本人），每人附带注册 IP/指纹与最近请求 IP 证据。
// 该用户无邀请人时只返回本人。按 邀请人 → 被邀请人(ID 升序) 排列。
func RelatedInviteAbuseAccounts(userId int) ([]RelatedAccount, error) {
	var target User
	if err := DB.First(&target, userId).Error; err != nil {
		return nil, err
	}
	if target.InviterId == 0 {
		return []RelatedAccount{toRelatedAccount(&target)}, nil
	}
	accounts := make([]RelatedAccount, 0, 8)
	if inviter, err := GetUserById(target.InviterId, false); err == nil {
		accounts = append(accounts, toRelatedAccount(inviter))
	}
	var invitees []User
	if err := DB.Where("inviter_id = ?", target.InviterId).Order("id ASC").Find(&invitees).Error; err != nil {
		return nil, err
	}
	for i := range invitees {
		accounts = append(accounts, toRelatedAccount(&invitees[i]))
	}
	return accounts, nil
}
