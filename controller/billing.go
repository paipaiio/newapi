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
	// 按模型明细的聚合维度：账户级(无限令牌/非令牌统计)用 statUserId，普通令牌用 statTokenId
	var statUserId, statTokenId int

	if common.DisplayTokenStatEnabled {
		tokenId := c.GetInt("token_id")
		token, err = model.GetTokenById(tokenId)
		// 无限额度令牌回退到账户级已用量，与 GetSubscription 口径一致
		if err == nil && token != nil && token.UnlimitedQuota {
			userId := c.GetInt("id")
			statUserId = userId
			usedQuota, err = model.GetUserUsedQuota(userId)
			if err == nil {
				user, userErr := model.GetUserById(userId, false)
				if userErr == nil && user != nil {
					// 账户级总额度=剩余(user.Quota)+已用，
					// 与非无限令牌分支(RemainQuota+UsedQuota)及 GetSubscription 口径一致；
					// 否则 total_quota 会错报成剩余额度、remaining 会算成 剩余-已用
					totalQuota = user.Quota + usedQuota
				}
			}
		} else if err == nil && token != nil {
			usedQuota = token.UsedQuota
			totalQuota = token.RemainQuota + token.UsedQuota
			statTokenId = token.Id
		}
	} else {
		userId := c.GetInt("id")
		statUserId = userId
		usedQuota, err = model.GetUserUsedQuota(userId)
		if err == nil {
			user, userErr := model.GetUserById(userId, false)
			if userErr == nil && user != nil {
				// 账户级总额度=剩余+已用，与 GetSubscription 口径一致
				totalQuota = user.Quota + usedQuota
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

	// convert 把原始平台额度换算成展示口径（0.01 dollar 之前的“元”值）：
	// 先除以分组倍率还原不含分组加价的实际用量，再按展示类型换算单位。
	// used/total/每个模型明细共用此闭包，保证 model_usage 各项之和与 total_usage 同口径自洽。
	usingGroup := common.GetContextKeyString(c, constant.ContextKeyUsingGroup)
	groupRatio := ratio_setting.GetGroupRatio(usingGroup)
	convert := func(raw float64) float64 {
		v := raw
		if groupRatio > 0 {
			v = v / groupRatio
		}
		switch operation_setting.GetQuotaDisplayType() {
		case operation_setting.QuotaDisplayTypeCNY:
			v = v / common.QuotaPerUnit * operation_setting.USDExchangeRate
		case operation_setting.QuotaDisplayTypeTokens:
			// tokens 保持原值
		default:
			v = v / common.QuotaPerUnit
		}
		return v
	}

	usedAmount := convert(float64(usedQuota))
	totalAmount := convert(float64(totalQuota))

	remainingAmount := totalAmount - usedAmount
	if remainingAmount < 0 {
		remainingAmount = 0
	}

	// 按模型消耗明细（累计，与 total_usage 同口径的 0.01 dollar）。
	// 维度与主口径一致：无限令牌/账户级按 user_id，普通令牌按 token_id。
	// 查询失败仅忽略明细，不影响主返回。
	var modelUsage []ModelUsageDetail
	if statUserId > 0 || statTokenId > 0 {
		if stats, statErr := model.GetModelUsageStats(statUserId, statTokenId); statErr == nil {
			modelUsage = make([]ModelUsageDetail, 0, len(stats))
			for _, s := range stats {
				if s.ModelName == "" {
					continue
				}
				modelUsage = append(modelUsage, ModelUsageDetail{
					ModelName: s.ModelName,
					Usage:     convert(float64(s.Quota)) * 100,
					Count:     s.Count,
					Tokens:    s.Tokens,
				})
			}
		}
	}

	usage := OpenAIUsageResponse{
		Object:     "list",
		TotalUsage: usedAmount * 100,
		Remaining:  remainingAmount * 100,
		TotalQuota: totalAmount * 100,
		ModelUsage: modelUsage,
	}
	c.JSON(200, usage)
	return
}
