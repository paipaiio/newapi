package controller

import (
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
)

// CapProxy 把 /api/cap/* 反向代理到 Cap standalone（common.CapServerURL）。
// 让浏览器经现有 nginx → new-api 链路访问 Cap 的 widget.js / wasm / challenge / redeem，
// 无需在宝塔 nginx 单独加 location（会被覆盖，历史坑）。siteverify 由后端直接调内部地址，
// 不走此代理。子路径原样转发：/api/cap/<siteKey>/challenge → <cap>/<siteKey>/challenge。
func CapProxy(c *gin.Context) {
	server := strings.TrimRight(strings.TrimSpace(common.CapServerURL), "/")
	if server == "" {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "Cap 未配置"})
		return
	}
	target, err := url.Parse(server)
	if err != nil {
		common.SysLog("Cap 反代地址配置错误: " + err.Error())
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "Cap 地址配置错误"})
		return
	}

	proxy := httputil.NewSingleHostReverseProxy(target)
	origDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		origDirector(req)
		req.URL.Path = strings.TrimPrefix(req.URL.Path, "/api/cap")
		if req.URL.Path == "" {
			req.URL.Path = "/"
		}
		req.Host = target.Host
	}
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, e error) {
		common.SysLog("Cap 反代失败: " + e.Error())
		c.JSON(http.StatusBadGateway, gin.H{"success": false, "message": "Cap 服务不可用"})
	}
	proxy.ServeHTTP(c.Writer, c.Request)
}
