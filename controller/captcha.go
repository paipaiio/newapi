package controller

import (
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
)

// GetCaptchaConfig 返回当前用户应使用的验证码配置
// 根据IP地域返回 Turnstile 或 GeeTest 配置
func GetCaptchaConfig(c *gin.Context) {
	clientIP := c.ClientIP()
	isChina := common.IsIPFromChina(clientIP)

	// 判断应该使用哪种验证
	var captchaType string
	var siteKey string
	var enabled bool

	if isChina && common.GeeTestCaptchaId != "" {
		// 国内用户优先使用极验
		captchaType = "geetest"
		siteKey = common.GeeTestCaptchaId
		enabled = true
	} else if !isChina && common.TurnstileCheckEnabled && common.TurnstileSiteKey != "" {
		// 境外用户优先使用Turnstile
		captchaType = "turnstile"
		siteKey = common.TurnstileSiteKey
		enabled = true
	} else if common.TurnstileCheckEnabled && common.TurnstileSiteKey != "" {
		// 降级：极验未配置，国内用户也用Turnstile
		captchaType = "turnstile"
		siteKey = common.TurnstileSiteKey
		enabled = true
	} else if common.GeeTestCaptchaId != "" {
		// 降级：Turnstile未配置，境外用户也用极验
		captchaType = "geetest"
		siteKey = common.GeeTestCaptchaId
		enabled = true
	} else {
		// 都未配置，返回禁用状态
		captchaType = "none"
		siteKey = ""
		enabled = false
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"type":    captchaType,
			"siteKey": siteKey,
			"enabled": enabled,
			"region":  map[bool]string{true: "CN", false: "overseas"}[isChina],
		},
	})
}
