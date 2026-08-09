package middleware

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
)

type geetestValidateResponse struct {
	Result string `json:"result"` // "success" or "fail"
	Reason string `json:"reason"`
}

// GeeTestCheck 极验行为验证中间件（国内用户）
func GeeTestCheck() gin.HandlerFunc {
	return func(c *gin.Context) {
		if common.GeeTestCaptchaId == "" || common.GeeTestCaptchaKey == "" {
			// 极验未配置，跳过
			c.Next()
			return
		}

		session := sessions.Default(c)
		geetestChecked := session.Get("geetest")
		if geetestChecked != nil {
			c.Next()
			return
		}

		// 从查询参数获取极验验证结果（前端通过URL传递）
		lotNumber := c.Query("lot_number")
		captchaOutput := c.Query("captcha_output")
		passToken := c.Query("pass_token")
		genTime := c.Query("gen_time")

		if lotNumber == "" || captchaOutput == "" || passToken == "" || genTime == "" {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "极验验证参数不完整",
			})
			c.Abort()
			return
		}

		// 生成签名：hmac-sha256(captcha_key, lot_number)
		// 官方算法只签 lot_number，多签 passToken+genTime 会被极验判 sign_token error
		signToken := hmacSha256(common.GeeTestCaptchaKey, lotNumber)

		// 调用极验服务器二次验证
		rawRes, err := http.PostForm("https://gcaptcha4.geetest.com/validate", url.Values{
			"lot_number":     {lotNumber},
			"captcha_output": {captchaOutput},
			"pass_token":     {passToken},
			"gen_time":       {genTime},
			"sign_token":     {signToken},
			"captcha_id":     {common.GeeTestCaptchaId},
		})
		if err != nil {
			common.SysLog("GeeTest验证请求失败: " + err.Error())
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "极验验证服务不可用",
			})
			c.Abort()
			return
		}
		defer rawRes.Body.Close()

		var res geetestValidateResponse
		err = json.NewDecoder(rawRes.Body).Decode(&res)
		if err != nil {
			common.SysLog("GeeTest响应解析失败: " + err.Error())
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "极验验证结果解析失败",
			})
			c.Abort()
			return
		}

		if res.Result != "success" {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": fmt.Sprintf("极验验证失败: %s", res.Reason),
			})
			c.Abort()
			return
		}

		// 验证通过，标记session
		session.Set("geetest", true)
		err = session.Save()
		if err != nil {
			common.SysLog("GeeTest session保存失败: " + err.Error())
		}

		c.Next()
	}
}

func hmacSha256(key, data string) string {
	h := hmac.New(sha256.New, []byte(key))
	h.Write([]byte(data))
	return hex.EncodeToString(h.Sum(nil))
}
