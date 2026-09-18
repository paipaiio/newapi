package controller

import (
	"maps"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/stretchr/testify/require"
)

func TestFormatWaffoPancakeAmount_UsesDisplayPriceString(t *testing.T) {
	testCases := []struct {
		name     string
		amount   float64
		expected string
	}{
		{name: "whole amount", amount: 29, expected: "29.00"},
		{name: "decimal amount", amount: 29.9, expected: "29.90"},
		{name: "round half up to cents", amount: 29.999, expected: "30.00"},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			require.Equal(t, tc.expected, formatWaffoPancakeAmount(tc.amount))
		})
	}
}

func TestResolveTopupDiscount(t *testing.T) {
	originalDiscounts := make(map[int]float64, len(operation_setting.GetPaymentSetting().AmountDiscount))
	maps.Copy(originalDiscounts, operation_setting.GetPaymentSetting().AmountDiscount)
	t.Cleanup(func() {
		operation_setting.GetPaymentSetting().AmountDiscount = originalDiscounts
	})

	operation_setting.GetPaymentSetting().AmountDiscount = map[int]float64{
		100: 0.9,
		200: 0, // 非正值 = 无效配置，视为不打折
	}

	testCases := []struct {
		name     string
		userId   int // 0 = 跳过用户查询（测试环境无 DB）
		amount   int
		expected float64
	}{
		{name: "no tier config returns full price", userId: 0, amount: 50, expected: 1.0},
		{name: "tier discount applies", userId: 0, amount: 100, expected: 0.9},
		{name: "non-positive tier discount ignored", userId: 0, amount: 200, expected: 1.0},
	}
	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			require.InDelta(t, tc.expected, resolveTopupDiscount(tc.userId, tc.amount), 0.000001)
		})
	}
}

func TestGetWaffoPancakePayMoney(t *testing.T) {
	originalQuotaDisplayType := operation_setting.GetGeneralSetting().QuotaDisplayType
	originalExchangeRate := operation_setting.USDExchangeRate
	originalPancakeRate := setting.WaffoPancakeExchangeRate
	originalDiscounts := make(map[int]float64, len(operation_setting.GetPaymentSetting().AmountDiscount))
	maps.Copy(originalDiscounts, operation_setting.GetPaymentSetting().AmountDiscount)
	originalTopupGroupRatio := common.TopupGroupRatio2JSONString()

	t.Cleanup(func() {
		operation_setting.GetGeneralSetting().QuotaDisplayType = originalQuotaDisplayType
		operation_setting.USDExchangeRate = originalExchangeRate
		setting.WaffoPancakeExchangeRate = originalPancakeRate
		operation_setting.GetPaymentSetting().AmountDiscount = originalDiscounts
		require.NoError(t, common.UpdateTopupGroupRatioByJSONString(originalTopupGroupRatio))
	})

	operation_setting.USDExchangeRate = 7.0
	operation_setting.GetPaymentSetting().AmountDiscount = map[int]float64{
		10:                           0.8,
		int(common.QuotaPerUnit * 3): 0.5,
		20:                           0,
	}
	require.NoError(t, common.UpdateTopupGroupRatioByJSONString(`{"default":1,"vip":1.2}`))

	testCases := []struct {
		name             string
		amount           int64
		group            string
		quotaDisplayType string
		pancakeRate      float64
		expected         float64
	}{
		{
			// CNY 展示 + 收款汇率与系统汇率一致：收取金额 = topup_amount
			//（与展示等值），再乘分组倍率与折扣。10 × 1.2 × 0.8 = 9.6
			name:             "cny display with matching rate charges usd equivalent",
			amount:           10,
			group:            "vip",
			quotaDisplayType: operation_setting.QuotaDisplayTypeCNY,
			pancakeRate:      7.0,
			expected:         9.6,
		},
		{
			// 收款汇率是系统汇率的两倍：美元收款减半。10 × 7/14 × 1.2 × 0.8 = 4.8
			name:             "cny display with double rate halves usd charge",
			amount:           10,
			group:            "vip",
			quotaDisplayType: operation_setting.QuotaDisplayTypeCNY,
			pancakeRate:      14.0,
			expected:         4.8,
		},
		{
			// 收款汇率 0 = 跟随系统汇率，与展示等值。
			name:             "zero pancake rate follows system rate",
			amount:           10,
			group:            "vip",
			quotaDisplayType: operation_setting.QuotaDisplayTypeCNY,
			pancakeRate:      0,
			expected:         9.6,
		},
		{
			// USD 展示：$ 仅是符号，显示数字即人民币面额，按收款汇率换成美元。
			// 10 ÷ 14 × 1.2 × 0.8 ≈ 0.6857
			name:             "usd display converts face cny to usd via pancake rate",
			amount:           10,
			group:            "vip",
			quotaDisplayType: operation_setting.QuotaDisplayTypeUSD,
			pancakeRate:      14.0,
			expected:         0.685714,
		},
		{
			// USD 展示 + 收款汇率与系统汇率一致（7）：20 ÷ 7 ≈ 2.857
			name:             "usd display with matching rate",
			amount:           20,
			group:            "default",
			quotaDisplayType: operation_setting.QuotaDisplayTypeUSD,
			pancakeRate:      7.0,
			expected:         2.857143,
		},
		{
			// TOKENS 展示：额度先按 QuotaPerUnit 折成显示单位（3），再按
			// 收款汇率换算。3 ÷ 14 × 1.2 × 0.5 ≈ 0.1286
			name:             "tokens display converts quota to display units before pricing",
			amount:           int64(common.QuotaPerUnit * 3),
			group:            "vip",
			quotaDisplayType: operation_setting.QuotaDisplayTypeTokens,
			pancakeRate:      14.0,
			expected:         0.128571,
		},
		{
			// 收款汇率 0 = 跟随系统汇率（7）：20 ÷ 7 ≈ 2.857
			name:             "zero pancake rate falls back to system rate",
			amount:           20,
			group:            "default",
			quotaDisplayType: operation_setting.QuotaDisplayTypeUSD,
			pancakeRate:      0,
			expected:         2.857143,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			operation_setting.GetGeneralSetting().QuotaDisplayType = tc.quotaDisplayType
			setting.WaffoPancakeExchangeRate = tc.pancakeRate
			actual := getWaffoPancakePayMoney(0, tc.amount, tc.group)
			require.InDelta(t, tc.expected, actual, 0.000001)
		})
	}
}
