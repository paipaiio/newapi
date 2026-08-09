package router

import (
	"embed"
	"io/fs"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-contrib/gzip"
	"github.com/gin-contrib/static"
	"github.com/gin-gonic/gin"
)

// ThemeAssets holds the embedded frontend assets for both themes.
type ThemeAssets struct {
	DefaultBuildFS   embed.FS
	DefaultIndexPage []byte
	ClassicBuildFS   embed.FS
	ClassicIndexPage []byte
}

func SetWebRouter(router *gin.Engine, assets ThemeAssets) {
	defaultFS := common.EmbedFolder(assets.DefaultBuildFS, "web/default/dist")
	classicFS := common.EmbedFolder(assets.ClassicBuildFS, "web/classic/dist")
	themeFS := common.NewThemeAwareFS(defaultFS, classicFS)

	// Serve /docs/* directly from the embedded classic dist, bypassing the
	// gin-contrib/static middleware which has trouble with embedded directories.
	docsSubFS, err := fs.Sub(assets.ClassicBuildFS, "web/classic/dist/docs")
	if err == nil {
		docsHandler := http.FileServerFS(docsSubFS)
		router.GET("/docs", func(c *gin.Context) {
			http.Redirect(c.Writer, c.Request, "/docs/", http.StatusMovedPermanently)
		})
		router.GET("/docs/*filepath", func(c *gin.Context) {
			c.Request.URL.Path = c.Param("filepath")
			docsHandler.ServeHTTP(c.Writer, c.Request)
		})
	}

	router.Use(gzip.Gzip(gzip.DefaultCompression))
	router.Use(middleware.GlobalWebRateLimit())
	router.Use(middleware.Cache())
	// 资源按构建命名空间（/av26/static/... → /static/...）：每次构建换前缀，
	// 彻底避免 CDN 上旧的被污染缓存条目影响新构建。
	router.Use(func(c *gin.Context) {
		p := c.Request.URL.Path
		if strings.HasPrefix(p, "/av") {
			if idx := strings.Index(p[1:], "/"); idx > 0 {
				rest := p[1+idx:]
				if strings.HasPrefix(rest, "/static/") || rest == "/favicon.ico" ||
					strings.HasPrefix(rest, "/logo") || strings.HasPrefix(rest, "/manifest") {
					c.Request.URL.Path = rest
				}
			}
		}
		c.Next()
	})
	router.Use(static.Serve("/", themeFS))
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
		if common.GetTheme() == "classic" {
			c.Data(http.StatusOK, "text/html; charset=utf-8", assets.ClassicIndexPage)
		} else {
			c.Data(http.StatusOK, "text/html; charset=utf-8", assets.DefaultIndexPage)
		}
	})
}
