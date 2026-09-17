package ratio_setting

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestResolveModelChargePrefersGroupPrice(t *testing.T) {
	require.NoError(t, UpdateModelPriceByJSONString(`{"claude-sonnet-5":3}`))
	require.NoError(t, UpdateGroupModelPriceByJSONString(`{"claude-sonnet-5":{"claude-user_kd2kh2xv":8}}`))
	t.Cleanup(func() {
		_ = UpdateModelPriceByJSONString(`{}`)
		_ = UpdateGroupModelPriceByJSONString(`{}`)
		_ = UpdateGroupModelRatioByJSONString(`{}`)
	})

	charge := ResolveModelCharge("claude-sonnet-5", "claude-user_kd2kh2xv")
	require.True(t, charge.OK)
	assert.True(t, charge.UsePrice)
	assert.Equal(t, 8.0, charge.Price)
	assert.Equal(t, 0.0, charge.Ratio)

	charge = ResolveModelCharge("claude-sonnet-5", "GPT")
	require.True(t, charge.OK)
	assert.True(t, charge.UsePrice)
	assert.Equal(t, 3.0, charge.Price)
}

func TestResolveModelChargePrefersGroupRatio(t *testing.T) {
	require.NoError(t, UpdateModelPriceByJSONString(`{}`))
	require.NoError(t, UpdateModelRatioByJSONString(`{"claude-sonnet-5":2}`))
	require.NoError(t, UpdateGroupModelRatioByJSONString(`{"claude-sonnet-5":{"GPT":5}}`))
	t.Cleanup(func() {
		_ = UpdateModelRatioByJSONString(`{}`)
		_ = UpdateGroupModelPriceByJSONString(`{}`)
		_ = UpdateGroupModelRatioByJSONString(`{}`)
	})

	charge := ResolveModelCharge("claude-sonnet-5", "GPT")
	require.True(t, charge.OK)
	assert.False(t, charge.UsePrice)
	assert.Equal(t, -1.0, charge.Price)
	assert.Equal(t, 5.0, charge.Ratio)
}

func TestResolveModelChargePrefersGroupTokenPrice(t *testing.T) {
	require.NoError(t, UpdateModelRatioByJSONString(`{"claude-sonnet-5":2}`))
	require.NoError(t, UpdateCompletionRatioByJSONString(`{"claude-sonnet-5":5}`))
	require.NoError(t, UpdateGroupModelRatioByJSONString(`{"claude-sonnet-5":{"GPT":9}}`))
	require.NoError(t, UpdateGroupModelTokenPriceByJSONString(`{"claude-sonnet-5":{"GPT":{"input":3,"output":15}}}`))
	t.Cleanup(func() {
		_ = UpdateModelRatioByJSONString(`{}`)
		_ = UpdateCompletionRatioByJSONString(`{}`)
		_ = UpdateGroupModelPriceByJSONString(`{}`)
		_ = UpdateGroupModelRatioByJSONString(`{}`)
		_ = UpdateGroupModelTokenPriceByJSONString(`{}`)
	})

	charge := ResolveModelCharge("claude-sonnet-5", "GPT")
	require.True(t, charge.OK)
	assert.False(t, charge.UsePrice)
	assert.True(t, charge.HasRatio)
	assert.Equal(t, -1.0, charge.Price)
	assert.Equal(t, 1.5, charge.Ratio)
	assert.True(t, charge.HasCompletion)
	assert.Equal(t, 5.0, charge.CompletionRatio)

	charge = ResolveModelCharge("claude-sonnet-5", "default")
	require.True(t, charge.OK)
	assert.Equal(t, 2.0, charge.Ratio)
	assert.False(t, charge.HasCompletion)
}

func TestResolveModelChargeGroupCreateCacheOnly(t *testing.T) {
	require.NoError(t, UpdateModelRatioByJSONString(`{"claude-sonnet-5":1.5}`))
	require.NoError(t, UpdateGroupModelTokenPriceByJSONString(`{"claude-sonnet-5":{"GPT":{"create_cache":7.5}}}`))
	t.Cleanup(func() {
		_ = UpdateModelRatioByJSONString(`{}`)
		_ = UpdateGroupModelTokenPriceByJSONString(`{}`)
	})

	charge := ResolveModelCharge("claude-sonnet-5", "GPT")
	require.True(t, charge.OK)
	assert.False(t, charge.HasRatio)
	assert.True(t, charge.HasCreateCache)
	assert.InDelta(t, 2.5, charge.CreateCacheRatio, 1e-9)
}
