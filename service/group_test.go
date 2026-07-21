package service

import (
	"fmt"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var groupTestUserSeq = 800000

// seedGroupTestUser 插入一个测试用户（指定分组与 setting JSON），测试结束自动删除。
func seedGroupTestUser(t *testing.T, group string, settingJSON string) *model.User {
	t.Helper()
	groupTestUserSeq++
	user := &model.User{
		Id:       groupTestUserSeq,
		Username: fmt.Sprintf("group-test-%d", groupTestUserSeq),
		Password: "x",
		Group:    group,
		Status:   common.UserStatusEnabled,
		Setting:  settingJSON,
		AffCode:  fmt.Sprintf("GT%030d", groupTestUserSeq),
	}
	require.NoError(t, model.DB.Create(user).Error)
	t.Cleanup(func() {
		model.DB.Delete(user)
	})
	return user
}

// setupGroupRatioState 设定分组倍率相关配置，并在测试结束后恢复默认值，
// 避免污染同包其他测试。
func setupGroupRatioState(t *testing.T) {
	t.Helper()
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"default":1,"vip":2}`))
	require.NoError(t, ratio_setting.UpdateGroupGroupRatioByJSONString(`{"vip":{"default":0.8}}`))
	t.Cleanup(func() {
		_ = ratio_setting.UpdateGroupRatioByJSONString(`{"default":1,"vip":1,"svip":1}`)
		_ = ratio_setting.UpdateGroupGroupRatioByJSONString(`{}`)
	})
}

// 倍率优先级链：个人覆写 > GroupGroupRatio（用户组特殊倍率）> 全局 GroupRatio。
func TestGetUserGroupRatioByUserPriority(t *testing.T) {
	setupGroupRatioState(t)

	userVip := seedGroupTestUser(t, "vip", "")
	userDefault := seedGroupTestUser(t, "default", "")
	userOverride := seedGroupTestUser(t, "vip", `{"group_ratios":{"default":0.5}}`)

	tests := []struct {
		name      string
		userId    int
		userGroup string
		group     string
		want      float64
	}{
		{"用户组特殊倍率命中", userVip.Id, "vip", "default", 0.8},
		{"无特殊倍率时回退全局", userDefault.Id, "default", "vip", 2},
		{"个人覆写优先于用户组特殊倍率", userOverride.Id, "vip", "default", 0.5},
		{"个人覆写不涉及的组走全局", userOverride.Id, "vip", "vip", 2},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := GetUserGroupRatioByUser(tt.userId, tt.userGroup, tt.group)
			assert.InDelta(t, tt.want, got, 1e-9)
		})
	}
}

// 可见白名单过滤：白名单裁剪 + 独享授权始终保留 + 无交集时回退用户自身分组。
func TestFilterByVisibleGroups(t *testing.T) {
	groups := map[string]string{"a": "A", "b": "B", "sec": "S"}

	userNoWhitelist := seedGroupTestUser(t, "default", "")
	userWhitelist := seedGroupTestUser(t, "default", `{"visible_groups":["a"]}`)
	userExclusive := seedGroupTestUser(t, "default", `{"visible_groups":["a"]}`)
	userNoIntersection := seedGroupTestUser(t, "b", `{"visible_groups":["zzz"]}`)

	// 独享授权：userExclusive 被授权 sec 分组
	require.NoError(t, model.SetGroupExclusiveUsers("sec", []int{userExclusive.Id}))
	t.Cleanup(func() {
		_ = model.SetGroupExclusiveUsers("sec", []int{})
	})

	tests := []struct {
		name      string
		userId    int
		userGroup string
		want      []string
	}{
		{"空白名单不裁剪", userNoWhitelist.Id, "default", []string{"a", "b", "sec"}},
		{"白名单裁剪", userWhitelist.Id, "default", []string{"a"}},
		{"独享授权优先于白名单", userExclusive.Id, "default", []string{"a", "sec"}},
		{"无交集回退自身分组", userNoIntersection.Id, "b", []string{"b"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := filterByVisibleGroups(tt.userId, tt.userGroup, groups)
			gotNames := make([]string, 0, len(got))
			for name := range got {
				gotNames = append(gotNames, name)
			}
			assert.ElementsMatch(t, tt.want, gotNames)
		})
	}
}
