package router

import (
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"

	"github.com/gin-gonic/gin"
)

// SetOAuthServerRouter 注册本系统作为 OpenID Connect Provider 的根级协议端点。
// 必须在 SetWebRouter 之前调用：这些是具体路由，会先于 SPA 的 NoRoute 兜底匹配，
// 否则 /.well-known/* 与 /oauth2/* 会被 SPA 返回 index.html。
func SetOAuthServerRouter(router *gin.Engine) {
	// OIDC 发现与公钥（RP 集成只需 issuer 即可自动发现这些端点）
	router.GET("/.well-known/openid-configuration", controller.OIDCDiscovery)
	router.GET("/.well-known/jwks.json", controller.OIDCJWKS)

	// 授权码流：authorize（浏览器跳转）、token（服务端调用）、userinfo（Bearer）
	router.GET("/oauth2/authorize", controller.OAuthAuthorize)
	router.POST("/oauth2/token", middleware.CriticalRateLimit(), controller.OAuthToken)
	router.GET("/oauth2/userinfo", controller.OAuthUserInfo)
}
