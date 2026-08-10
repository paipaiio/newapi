package middleware

import (
	"bytes"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
)

type capSiteverifyResponse struct {
	Success bool `json:"success"`
}

var capHTTPClient = &http.Client{Timeout: 8 * time.Second}

// IsCapConfigured 判断 Cap 是否启用且配置齐全（总开关 + 三项必填）。
func IsCapConfigured() bool {
	return common.CapEnabled &&
		strings.TrimSpace(common.CapServerURL) != "" &&
		strings.TrimSpace(common.CapSiteKey) != "" &&
		strings.TrimSpace(common.CapSecretKey) != ""
}

// CapCheck 极验/Turnstile 之外的第三种验证码：Cap 自托管 proof-of-work。
// 前端 widget 解出 PoW 后得到一次性 token，经 query 参数 cap_token 传来；
// 后端拿 secret 调 Cap standalone 的 /<siteKey>/siteverify 验证（token 单次有效）。
func CapCheck() gin.HandlerFunc {
	return func(c *gin.Context) {
		token := strings.TrimSpace(c.Query("cap_token"))
		if token == "" {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "Cap token 为空",
			})
			c.Abort()
			return
		}

		server := strings.TrimRight(strings.TrimSpace(common.CapServerURL), "/")
		siteKey := strings.TrimSpace(common.CapSiteKey)
		secret := strings.TrimSpace(common.CapSecretKey)
		if server == "" || siteKey == "" || secret == "" {
			common.SysLog("Cap 验证失败: CapServerURL/CapSiteKey/CapSecretKey 未配置完整")
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "Cap 验证服务未配置",
			})
			c.Abort()
			return
		}

		verifyURL := fmt.Sprintf("%s/%s/siteverify", server, siteKey)
		body, err := common.Marshal(map[string]string{
			"secret":   secret,
			"response": token,
		})
		if err != nil {
			common.SysLog("Cap 验证请求编码失败: " + err.Error())
			c.JSON(http.StatusOK, gin.H{"success": false, "message": "Cap 验证服务不可用"})
			c.Abort()
			return
		}
		req, err := http.NewRequestWithContext(c.Request.Context(), http.MethodPost, verifyURL, bytes.NewReader(body))
		if err != nil {
			common.SysLog("Cap 验证请求构造失败: " + err.Error())
			c.JSON(http.StatusOK, gin.H{"success": false, "message": "Cap 验证服务不可用"})
			c.Abort()
			return
		}
		req.Header.Set("Content-Type", "application/json")

		rawRes, err := capHTTPClient.Do(req)
		if err != nil {
			common.SysLog("Cap 验证请求失败: " + err.Error())
			c.JSON(http.StatusOK, gin.H{"success": false, "message": "Cap 验证服务不可用"})
			c.Abort()
			return
		}
		defer rawRes.Body.Close()

		var res capSiteverifyResponse
		if err := common.DecodeJson(rawRes.Body, &res); err != nil {
			common.SysLog("Cap 响应解析失败: " + err.Error())
			c.JSON(http.StatusOK, gin.H{"success": false, "message": "Cap 验证结果解析失败"})
			c.Abort()
			return
		}

		if !res.Success {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "Cap 校验失败，请刷新重试！",
			})
			c.Abort()
			return
		}

		c.Next()
	}
}
