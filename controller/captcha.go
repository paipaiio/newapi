package controller

import (
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-gonic/gin"
)

// GetCaptchaConfig 返回当前用户应使用的验证码配置
// Cap 已启用且配置齐全 → Cap（地域无关）；否则按 IP 地域返回 GeeTest 或 Turnstile
func GetCaptchaConfig(c *gin.Context) {
	clientIP := c.ClientIP()
	isChina := common.IsIPFromChina(clientIP)

	// 判断应该使用哪种验证
	var captchaType string
	var siteKey string
	var endpoint string
	var scriptUrl string
	var enabled bool

	if middleware.IsCapConfigured() {
		// Cap 自托管验证（全站统一，地域无关）。siteKey 公开，endpoint 供 widget 取挑战。
		captchaType = "cap"
		siteKey = common.CapSiteKey
		base := strings.TrimRight(strings.TrimSpace(common.CapPublicEndpoint), "/")
		// widget 的 api endpoint = 公共反代地址 + /<siteKey>/（widget 会自动拼 challenge/redeem）
		endpoint = base + "/" + common.CapSiteKey + "/"
		// widget.js（含 wasm，经同一反代自托管，国内不依赖 jsdelivr）。Cap 资源服务器路径带 /assets 前缀。
		scriptUrl = base + "/assets/widget.js"
		enabled = true
	} else if isChina && common.GeeTestCaptchaId != "" {
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
			"type":       captchaType,
			"siteKey":    siteKey,
			"endpoint":   endpoint,
			"script_url": scriptUrl,
			"enabled":    enabled,
			"region":     map[bool]string{true: "CN", false: "overseas"}[isChina],
		},
	})
}
