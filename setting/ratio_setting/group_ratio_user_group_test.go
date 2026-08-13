package ratio_setting

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// setupUserGroupDefaults 设定「纯用户分组」表，测试结束后清空，避免污染同包其他测试。
func setupUserGroupDefaults(t *testing.T, jsonStr string) {
	t.Helper()
	require.NoError(t, UpdateUserGroupDefaultGroupByJSONString(jsonStr))
	t.Cleanup(func() {
		_ = UpdateUserGroupDefaultGroupByJSONString(`{}`)
	})
}

func TestIsPureUserGroup(t *testing.T) {
	setupUserGroupDefaults(t, `{"reseller":"claude","agent":"GPT","broken":""}`)

	tests := []struct {
		name      string
		userGroup string
		want      bool
	}{
		{"配了默认模型分组即为纯用户分组", "reseller", true},
		{"另一个纯用户分组", "agent", true},
		{"未配置的分组不是（存量行为）", "claude", false},
		{"默认模型分组为空视为未配置", "broken", false},
		{"空字符串", "", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, IsPureUserGroup(tt.userGroup))
		})
	}
}

func TestResolveUsingGroup(t *testing.T) {
	setupUserGroupDefaults(t, `{"reseller":"claude","broken":""}`)

	tests := []struct {
		name      string
		userGroup string
		want      string
	}{
		{"纯用户分组翻译成默认模型分组", "reseller", "claude"},
		{"存量分组原样返回", "cc-max", "cc-max"},
		{"默认模型分组为空时原样返回", "broken", "broken"},
		{"空字符串原样返回", "", ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, ResolveUsingGroup(tt.userGroup))
		})
	}
}

// 未配置任何纯用户分组时，两个 helper 必须完全不改变行为——这是存量零影响的保证。
func TestUserGroupHelpersNoOpWhenUnconfigured(t *testing.T) {
	setupUserGroupDefaults(t, `{}`)

	for _, g := range []string{"default", "claude", "cc-max", "codex-pro", ""} {
		assert.False(t, IsPureUserGroup(g), "分组 %q 不应被判为纯用户分组", g)
		assert.Equal(t, g, ResolveUsingGroup(g), "分组 %q 不应被翻译", g)
	}
}
