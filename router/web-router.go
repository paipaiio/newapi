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
		c.Header("Cache-Control", "no-cache")
		if common.GetTheme() == "classic" {
			c.Data(http.StatusOK, "text/html; charset=utf-8", assets.ClassicIndexPage)
		} else {
			c.Data(http.StatusOK, "text/html; charset=utf-8", assets.DefaultIndexPage)
		}
	})
}
