package router

import (
	"embed"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-contrib/gzip"
	"github.com/gin-contrib/static"
	"github.com/gin-gonic/gin"
)

// WebAssets holds the embedded dashboard frontend assets.
type WebAssets struct {
	BuildFS   embed.FS
	IndexPage []byte
}

func SetWebRouter(router *gin.Engine, assets WebAssets) {
	frontendFS := common.EmbedFolder(assets.BuildFS, "web/dist")
	cdnIndex := assets.IndexPage
	originIndex := common.RewriteIndexAssetsForOrigin(assets.IndexPage)

	router.Use(gzip.Gzip(gzip.DefaultCompression))
	router.Use(middleware.GlobalWebRateLimit())
	router.Use(middleware.Cache())
	// Rewrite versioned CDN paths (/avHASH/static/... or /avHASH/assets/...)
	// to their embedded single-frontend paths.
	router.Use(func(c *gin.Context) {
		path := c.Request.URL.Path
		if strings.HasPrefix(path, "/av") {
			if idx := strings.Index(path[1:], "/"); idx > 0 {
				rest := path[1+idx:]
				if strings.HasPrefix(rest, "/static/") || strings.HasPrefix(rest, "/assets/") ||
					rest == "/favicon.ico" || strings.HasPrefix(rest, "/logo") ||
					strings.HasPrefix(rest, "/manifest") {
					c.Request.URL.Path = rest
				}
			}
		}
		c.Next()
	})
	router.Use(static.Serve("/", frontendFS))
	router.NoRoute(func(c *gin.Context) {
		c.Set(middleware.RouteTagKey, "web")
		// 用带斜杠的前缀精确匹配后端路径，避免误伤前端路由（如 /api-sale 撞 /api）。
		uri := c.Request.RequestURI
		if strings.HasPrefix(uri, "/v1/") || uri == "/v1" ||
			strings.HasPrefix(uri, "/api/") || uri == "/api" ||
			strings.HasPrefix(uri, "/assets/") {
			controller.RelayNotFound(c)
			return
		}
		// 静态资源不存在必须返回 404，绝不能回退到 index.html：
		// 否则 CDN 会把 HTML 当 JS 缓存 30 天（历史事故根因）。
		if strings.HasPrefix(c.Request.URL.Path, "/static/") {
			c.Header("Cache-Control", "no-store")
			c.Status(http.StatusNotFound)
			return
		}
		c.Header("Cache-Control", "no-cache")
		c.Header("Vary", "X-Real-IP, X-Forwarded-For, CF-IPCountry")
		html := cdnIndex
		clientIP := common.AssetRequestClientIP(c.Request, c.ClientIP())
		if !common.IsChinaAssetClient(c.Request, clientIP) {
			html = originIndex
			c.Header("X-Asset-Route", "origin")
		} else {
			c.Header("X-Asset-Route", "cdn")
		}
		c.Data(http.StatusOK, "text/html; charset=utf-8", html)
	})
}
