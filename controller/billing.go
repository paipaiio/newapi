package controller

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
)

func GetSubscription(c *gin.Context) {
	var remainQuota int
	var usedQuota int
	var err error
	var token *model.Token
	var expiredTime int64
	if common.DisplayTokenStatEnabled {
		tokenId := c.GetInt("token_id")
		token, err = model.GetTokenById(tokenId)
		// 无限额度令牌的真实余额上限在账户(user.quota)上，
		// 回退到账户级额度，使售卖的无限 key 能正确反映账户余额
		if err == nil && token != nil && token.UnlimitedQuota {
			userId := c.GetInt("id")
			expiredTime = token.ExpiredTime
			remainQuota, err = model.GetUserQuota(userId, false)
			if err == nil {
				usedQuota, err = model.GetUserUsedQuota(userId)
			}
			token = nil // 阻止后续 UnlimitedQuota 硬编码 1 亿
		} else if err == nil && token != nil {
			expiredTime = token.ExpiredTime
			remainQuota = token.RemainQuota
			usedQuota = token.UsedQuota
		}
	} else {
		userId := c.GetInt("id")
		remainQuota, err = model.GetUserQuota(userId, false)
		usedQuota, err = model.GetUserUsedQuota(userId)
	}
	if expiredTime <= 0 {
		expiredTime = 0
	}
	if err != nil {
		openAIError := types.OpenAIError{
			Message: err.Error(),
			Type:    "upstream_error",
		}
		c.JSON(200, gin.H{
			"error": openAIError,
		})
		return
	}
	quota := remainQuota + usedQuota
	amount := float64(quota)
	// 真实额度：除以该密钥所属分组倍率，与 /usage 口径统一，
	// 使客户端 subscription - usage 能正确算出剩余额度
	usingGroup := common.GetContextKeyString(c, constant.ContextKeyUsingGroup)
	groupRatio := ratio_setting.GetGroupRatio(usingGroup)
	if groupRatio > 0 {
		amount = amount / groupRatio
	}
	// OpenAI 兼容接口中的 *_USD 字段含义保持“额度单位”对应值：
	// 我们将其解释为以“站点展示类型”为准：
	// - USD: 直接除以 QuotaPerUnit
	// - CNY: 先转 USD 再乘汇率
	// - TOKENS: 直接使用 tokens 数量
	switch operation_setting.GetQuotaDisplayType() {
	case operation_setting.QuotaDisplayTypeCNY:
		amount = amount / common.QuotaPerUnit * operation_setting.USDExchangeRate
	case operation_setting.QuotaDisplayTypeTokens:
		// amount 保持 tokens 数值
	default:
		amount = amount / common.QuotaPerUnit
	}
	if token != nil && token.UnlimitedQuota {
		amount = 100000000
	}
	subscription := OpenAISubscriptionResponse{
		Object:             "billing_subscription",
		HasPaymentMethod:   true,
		SoftLimitUSD:       amount,
		HardLimitUSD:       amount,
		SystemHardLimitUSD: amount,
		AccessUntil:        expiredTime,
	}
	c.JSON(200, subscription)
	return
}

func GetUsage(c *gin.Context) {
	var usedQuota int
	var totalQuota int
	var err error
	var token *model.Token

	if common.DisplayTokenStatEnabled {
		tokenId := c.GetInt("token_id")
		token, err = model.GetTokenById(tokenId)
		// 无限额度令牌回退到账户级已用量，与 GetSubscription 口径一致
		if err == nil && token != nil && token.UnlimitedQuota {
			userId := c.GetInt("id")
			usedQuota, err = model.GetUserUsedQuota(userId)
			if err == nil {
				user, userErr := model.GetUserById(userId, false)
				if userErr == nil && user != nil {
					totalQuota = user.Quota
				}
			}
		} else if err == nil && token != nil {
			usedQuota = token.UsedQuota
			totalQuota = token.RemainQuota + token.UsedQuota
		}
	} else {
		userId := c.GetInt("id")
		usedQuota, err = model.GetUserUsedQuota(userId)
		if err == nil {
			user, userErr := model.GetUserById(userId, false)
			if userErr == nil && user != nil {
				totalQuota = user.Quota
			}
		}
	}

	if err != nil {
		openAIError := types.OpenAIError{
			Message: err.Error(),
			Type:    "new_api_error",
		}
		c.JSON(200, gin.H{
			"error": openAIError,
		})
		return
	}

	usedAmount := float64(usedQuota)
	totalAmount := float64(totalQuota)
	// 真实用量：将平台消耗额度除以该密钥所属分组的倍率，
	// 还原为不含分组加价的实际消耗量
	usingGroup := common.GetContextKeyString(c, constant.ContextKeyUsingGroup)
	groupRatio := ratio_setting.GetGroupRatio(usingGroup)
	if groupRatio > 0 {
		usedAmount = usedAmount / groupRatio
		totalAmount = totalAmount / groupRatio
	}

	// 根据显示类型转换单位
	switch operation_setting.GetQuotaDisplayType() {
	case operation_setting.QuotaDisplayTypeCNY:
		usedAmount = usedAmount / common.QuotaPerUnit * operation_setting.USDExchangeRate
		totalAmount = totalAmount / common.QuotaPerUnit * operation_setting.USDExchangeRate
	case operation_setting.QuotaDisplayTypeTokens:
		// tokens 保持原值
	default:
		usedAmount = usedAmount / common.QuotaPerUnit
		totalAmount = totalAmount / common.QuotaPerUnit
	}

	remainingAmount := totalAmount - usedAmount
	if remainingAmount < 0 {
		remainingAmount = 0
	}

	usage := OpenAIUsageResponse{
		Object:     "list",
		TotalUsage: usedAmount * 100,
		Remaining:  remainingAmount * 100,
		TotalQuota: totalAmount * 100,
	}
	c.JSON(200, usage)
	return
}
