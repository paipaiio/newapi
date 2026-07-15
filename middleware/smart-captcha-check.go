package middleware

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
)

// SmartCaptchaCheck 根据用户IP地域智能选择验证方式
// 国内IP → 极验GeeTest
// 境外IP → Cloudflare Turnstile
func SmartCaptchaCheck() gin.HandlerFunc {
	return func(c *gin.Context) {
		// 如果两种验证都未启用，直接跳过
		if !common.TurnstileCheckEnabled && common.GeeTestCaptchaId == "" {
			c.Next()
			return
		}

		clientIP := c.ClientIP()
		isChina := common.IsIPFromChina(clientIP)

		if isChina && common.GeeTestCaptchaId != "" {
			// 国内用户 + 极验已配置 → 使用极验
			GeeTestCheck()(c)
		} else if !isChina && common.TurnstileCheckEnabled {
			// 境外用户 + Turnstile已启用 → 使用Turnstile
			TurnstileCheck()(c)
		} else if common.TurnstileCheckEnabled {
			// 降级：极验未配置但Turnstile可用，国内用户也用Turnstile
			TurnstileCheck()(c)
		} else if common.GeeTestCaptchaId != "" {
			// 降级：Turnstile未启用但极验可用，境外用户也用极验
			GeeTestCheck()(c)
		} else {
			// 都不可用，跳过验证
			c.Next()
		}
	}
}
