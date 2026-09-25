package model

import (
	"strconv"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
)

// setupRequestAbuseDB 建一个内存 SQLite 并建 users 表，返回清理函数。
func setupRequestAbuseDB(t *testing.T) func() {
	t.Helper()
	origDB := DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&User{}))
	DB = db
	return func() { DB = origDB }
}

func TestRecordAndHasRecentRequestIP(t *testing.T) {
	require.False(t, common.RedisEnabled)

	RecordAPIRequestIP(101, "203.0.113.7")
	assert.True(t, userHasRecentRequestIP(101, "203.0.113.7"))
	assert.False(t, userHasRecentRequestIP(101, "203.0.113.8"))
	assert.False(t, userHasRecentRequestIP(102, "203.0.113.7"))

	// 无效输入静默忽略
	RecordAPIRequestIP(0, "203.0.113.7")
	RecordAPIRequestIP(101, "")
	assert.False(t, userHasRecentRequestIP(0, "203.0.113.7"))
}

func TestRequestIPRecordPrunesExpired(t *testing.T) {
	require.False(t, common.RedisEnabled)

	now := common.GetTimestamp()
	requestIPMem.Lock()
	requestIPMem.users[201] = map[string]int64{
		"198.51.100.1": now - 10,   // 已过期
		"198.51.100.2": now + 3600, // 有效
	}
	requestIPMem.Unlock()

	assert.False(t, userHasRecentRequestIP(201, "198.51.100.1"))
	assert.True(t, userHasRecentRequestIP(201, "198.51.100.2"))

	// 再记录一个新 IP，写回时过期条目应被清理
	RecordAPIRequestIP(201, "198.51.100.9")
	ips := requestIPMemLoad(201)
	_, hasExpired := ips["198.51.100.1"]
	assert.False(t, hasExpired)
	assert.Len(t, ips, 2)
}

func TestRequestIPRecordCapsCapacity(t *testing.T) {
	require.False(t, common.RedisEnabled)

	for i := 0; i < maxRecordedRequestIPsPerUser+8; i++ {
		RecordAPIRequestIP(301, "192.0.2."+strconv.Itoa(i+1))
	}
	ips := requestIPMemLoad(301)
	assert.Len(t, ips, maxRecordedRequestIPsPerUser)
}

func TestDetectAPIRequestAbuse(t *testing.T) {
	cleanup := setupRequestAbuseDB(t)
	defer cleanup()
	require.False(t, common.RedisEnabled)

	// 造数据：邀请人 1，被邀请人 2 / 3
	inviter := User{Username: "inviter", Role: 1, Group: "default", AffCode: "aff_inviter"}
	require.NoError(t, DB.Create(&inviter).Error)
	inviteeA := User{Username: "invitee_a", Role: 1, Group: "default", AffCode: "aff_a", InviterId: inviter.Id}
	require.NoError(t, DB.Create(&inviteeA).Error)
	inviteeB := User{Username: "invitee_b", Role: 1, Group: "default", AffCode: "aff_b", InviterId: inviter.Id}
	require.NoError(t, DB.Create(&inviteeB).Error)

	s := operation_setting.GetInviteAbuseSetting()
	origEnabled, origCheck := s.Enabled, s.CheckAPIRequestIP
	s.Enabled, s.CheckAPIRequestIP = true, true
	t.Cleanup(func() { s.Enabled, s.CheckAPIRequestIP = origEnabled, origCheck })

	const sharedIP = "203.0.113.99"

	// 无重合：不标记
	res := DetectAPIRequestAbuse(inviteeA.Id, inviter.Id, "198.51.100.50")
	assert.False(t, res.Flagged)
	// 但记录仍然发生（供后续他人判定）
	assert.True(t, userHasRecentRequestIP(inviteeA.Id, "198.51.100.50"))

	// 与邀请人请求 IP 重合
	RecordAPIRequestIP(inviter.Id, sharedIP)
	res = DetectAPIRequestAbuse(inviteeB.Id, inviter.Id, sharedIP)
	require.True(t, res.Flagged)
	assert.Contains(t, res.Reason, "邀请人")

	// 与兄弟被邀请人请求 IP 重合（邀请人本身没用过该 IP）
	const siblingIP = "203.0.113.100"
	RecordAPIRequestIP(inviteeA.Id, siblingIP)
	res = DetectAPIRequestAbuse(inviteeB.Id, inviter.Id, siblingIP)
	require.True(t, res.Flagged)
	assert.Contains(t, res.Reason, "其他被邀请人")

	// 无邀请人：记录但不判定
	res = DetectAPIRequestAbuse(inviter.Id, 0, "198.51.100.77")
	assert.False(t, res.Flagged)
	assert.True(t, userHasRecentRequestIP(inviter.Id, "198.51.100.77"))

	// 子开关关闭：不判定但仍记录
	s.CheckAPIRequestIP = false
	res = DetectAPIRequestAbuse(inviteeB.Id, inviter.Id, siblingIP)
	assert.False(t, res.Flagged)
	s.CheckAPIRequestIP = true

	// 总开关关闭：不判定
	s.Enabled = false
	res = DetectAPIRequestAbuse(inviteeB.Id, inviter.Id, siblingIP)
	assert.False(t, res.Flagged)
}

func TestFlagUserForInviteAbuse(t *testing.T) {
	cleanup := setupRequestAbuseDB(t)
	defer cleanup()

	u := User{Username: "flagme", Role: 1, Group: "default", AffCode: "aff_flag"}
	require.NoError(t, DB.Create(&u).Error)

	require.NoError(t, FlagUserForInviteAbuse(u.Id, "API 请求 IP 与邀请人相同"))

	var got User
	require.NoError(t, DB.First(&got, u.Id).Error)
	assert.True(t, got.InviteAbuseFlagged)
	assert.Equal(t, "API 请求 IP 与邀请人相同", got.InviteAbuseReason)

	// 已标记用户重复打标为 no-op（原因不被覆盖）
	require.NoError(t, FlagUserForInviteAbuse(u.Id, "另一个原因"))
	require.NoError(t, DB.First(&got, u.Id).Error)
	assert.Equal(t, "API 请求 IP 与邀请人相同", got.InviteAbuseReason)

	// 手工/SQL 插入的行可能是 NULL（而非 false），同样要能被标记
	raw := User{Username: "nullflag", Role: 1, Group: "default", AffCode: "aff_null"}
	require.NoError(t, DB.Create(&raw).Error)
	require.NoError(t, DB.Exec("UPDATE users SET invite_abuse_flagged = NULL WHERE id = ?", raw.Id).Error)
	require.NoError(t, FlagUserForInviteAbuse(raw.Id, "NULL 标记也要能打"))
	got = User{}
	require.NoError(t, DB.First(&got, raw.Id).Error)
	assert.True(t, got.InviteAbuseFlagged)
	assert.Equal(t, "NULL 标记也要能打", got.InviteAbuseReason)
}

func TestGetRecentRequestIPs(t *testing.T) {
	require.False(t, common.RedisEnabled)

	now := common.GetTimestamp()
	ttlSec := int64(apiRequestIPTTL / time.Second)
	saveRequestIPs(301, map[string]int64{
		"198.51.100.1": now + ttlSec,       // 刚记录
		"198.51.100.2": now + ttlSec - 600, // 10 分钟前记录
		"198.51.100.3": now - 10,           // 已过期
	})
	t.Cleanup(func() { saveRequestIPs(301, map[string]int64{}) })

	records := GetRecentRequestIPs(301)
	require.Len(t, records, 2)
	assert.Equal(t, "198.51.100.1", records[0].IP)
	assert.Equal(t, "198.51.100.2", records[1].IP)
	assert.Greater(t, records[0].LastSeen, records[1].LastSeen)
	assert.InDelta(t, now, records[0].LastSeen, 5)

	assert.Nil(t, GetRecentRequestIPs(0))
	assert.Empty(t, GetRecentRequestIPs(302))
}
