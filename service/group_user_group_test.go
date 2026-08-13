package service

import (
	"testing"

	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// setupPureUserGroupState 配置一批公开可选分组 + 一个纯用户分组，测试结束后还原，
// 避免污染同包其他测试。
func setupPureUserGroupState(t *testing.T) {
	t.Helper()

	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(
		`{"default":"默认","cc-max":"CC-Max","veo":"Veo"}`))
	require.NoError(t, ratio_setting.UpdateUserGroupDefaultGroupByJSONString(
		`{"reseller":"cc-max"}`))

	special := ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup
	special.Set("reseller", map[string]string{
		"claude": "Claude",
		"-:veo":  "remove",
	})
	special.Set("legacy-group", map[string]string{"claude": "Claude"})

	t.Cleanup(func() {
		_ = setting.UpdateUserUsableGroupsByJSONString(`{"default":"默认"}`)
		_ = ratio_setting.UpdateUserGroupDefaultGroupByJSONString(`{}`)
		// RWMap 没有单键删除，默认值本身就是空表，直接清空即可。
		special.Clear()
	})
}

func keysOf(m map[string]string) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}

// 纯用户分组走白名单模式：不继承公开可选分组，只有显式配置的 + 默认模型分组。
func TestGetUserUsableGroupsPureUserGroupIsWhitelist(t *testing.T) {
	setupPureUserGroupState(t)

	got := GetUserUsableGroups("reseller")

	// claude 来自显式配置，cc-max 是默认模型分组（恒可用）。
	assert.ElementsMatch(t, []string{"claude", "cc-max"}, keysOf(got))
	// 公开分组不被继承。
	assert.NotContains(t, got, "default")
	assert.NotContains(t, got, "veo")
	// 用户分组名本身不会被注入成假的模型分组。
	assert.NotContains(t, got, "reseller")
}

// 未配置默认模型分组的普通分组保持原有行为：公开分组 + 特殊规则 + 自身分组注入。
func TestGetUserUsableGroupsLegacyGroupUnchanged(t *testing.T) {
	setupPureUserGroupState(t)

	got := GetUserUsableGroups("legacy-group")

	assert.ElementsMatch(t,
		[]string{"default", "cc-max", "veo", "claude", "legacy-group"},
		keysOf(got))
}

// 管理员在用户设置里配的「可见分组」是权威的：即使这些分组没开放给所有人自选
// （不在 UserUsableGroups 里），也要对该用户放出来，否则配了不生效。
func TestVisibleGroupsGrantsNonPublicGroups(t *testing.T) {
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(
		`{"default":1,"cc-max":1,"claude":1,"GPT":1}`))
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(
		`{"default":"默认","cc-max":"CC-Max"}`))
	t.Cleanup(func() {
		_ = ratio_setting.UpdateGroupRatioByJSONString(`{"default":1,"vip":1,"svip":1}`)
		_ = setting.UpdateUserUsableGroupsByJSONString(`{"default":"默认"}`)
	})

	// claude / GPT 系统里有定义但不公开自选，nope 是脏数据（已删除的分组名）。
	user := seedGroupTestUser(t, "default",
		`{"visible_groups":["claude","GPT","nope"]}`)

	got := GetUserDisplayGroupsByUser(user.Id, "default")

	assert.ElementsMatch(t, []string{"claude", "GPT"}, keysOf(got))
	// 未在倍率表里定义的名字要被丢掉，避免选了之后 relay 报「分组已被弃用」。
	assert.NotContains(t, got, "nope")
	// 白名单是权威的：没列进白名单的公开分组不再可见。
	assert.NotContains(t, got, "cc-max")
	assert.NotContains(t, got, "default")
}

// 纯用户分组即使一条可选分组都没配，也至少留下默认模型分组，不能让用户无组可用。
func TestGetUserUsableGroupsPureUserGroupWithoutRules(t *testing.T) {
	setupPureUserGroupState(t)
	// 清掉该组的可选分组配置，模拟管理员只填了默认模型分组的情况。
	ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup.
		Set("reseller", map[string]string{})

	got := GetUserUsableGroups("reseller")

	assert.ElementsMatch(t, []string{"cc-max"}, keysOf(got))
}
