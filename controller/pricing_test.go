package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/model"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRestrictPricingEnableGroupsKeepsOnlyVisible(t *testing.T) {
	original := []string{"GPT", "claude-user_kd2kh2xv", "admin", "claude"}
	pricing := []model.Pricing{{
		ModelName:   "claude-sonnet-5",
		EnableGroup: append([]string{}, original...),
	}}

	got := restrictPricingEnableGroups(pricing, map[string]string{
		"GPT":  "GPT",
		"Grok": "Grok",
	})
	require.Len(t, got, 1)
	assert.Equal(t, []string{"GPT"}, got[0].EnableGroup)
	assert.Equal(t, original, pricing[0].EnableGroup)
}

func TestRestrictPricingEnableGroupsExpandsAllToVisible(t *testing.T) {
	pricing := []model.Pricing{{
		ModelName:   "open-model",
		EnableGroup: []string{"all"},
	}}

	got := restrictPricingEnableGroups(pricing, map[string]string{
		"Grok": "Grok",
		"GPT":  "GPT",
		"auto": "auto",
	})
	require.Len(t, got, 1)
	assert.Equal(t, []string{"GPT", "Grok"}, got[0].EnableGroup)
}

func TestFilterPricingByUsableGroupsKeepsIntersectingModels(t *testing.T) {
	pricing := []model.Pricing{
		{ModelName: "keep", EnableGroup: []string{"GPT", "admin"}},
		{ModelName: "drop", EnableGroup: []string{"claude-user_kd2kh2xv"}},
	}
	got := filterPricingByUsableGroups(pricing, map[string]string{"GPT": "GPT"})
	require.Len(t, got, 1)
	assert.Equal(t, "keep", got[0].ModelName)
}
