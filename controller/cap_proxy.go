package controller

import (
	"net/http"
	"net/http/httputil"
	"net/url"
	"path"
	"strings"
	"unicode"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
)

// capProxyAllowed 只放行浏览器 widget 需要的路径，挡住 Cap 控制台和管理 API。
// 允许：GET/HEAD /assets/* ；POST /<siteKey>/challenge|redeem。
// siteverify、/server/*、/swagger、登录页都不走公网反代。
func capProxyAllowed(method, requestPath string) bool {
	raw := strings.TrimPrefix(requestPath, "/api/cap")
	if raw == "" {
		raw = "/"
	}
	if !strings.HasPrefix(raw, "/") {
		raw = "/" + raw
	}
	if strings.Contains(raw, "..") {
		return false
	}
	cleaned := path.Clean(raw)

	switch strings.ToUpper(method) {
	case http.MethodGet, http.MethodHead:
		return strings.HasPrefix(cleaned, "/assets/") && cleaned != "/assets"
	case http.MethodPost:
		parts := strings.Split(strings.Trim(cleaned, "/"), "/")
		if len(parts) != 2 || !validCapSiteKey(parts[0]) {
			return false
		}
		return parts[1] == "challenge" || parts[1] == "redeem"
	default:
		return false
	}
}

func validCapSiteKey(siteKey string) bool {
	if n := len(siteKey); n < 4 || n > 64 {
		return false
	}
	for _, r := range siteKey {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '-' || r == '_' {
			continue
		}
		return false
	}
	return true
}

// CapProxy 把 /api/cap/* 反向代理到 Cap standalone（common.CapServerURL）。
// 让浏览器经现有 nginx → new-api 链路访问 Cap 的 widget.js / wasm / challenge / redeem，
// 无需在宝塔 nginx 单独加 location（会被覆盖，历史坑）。siteverify 由后端直接调内部地址，
// 不走此代理。子路径原样转发：/api/cap/<siteKey>/challenge → <cap>/<siteKey>/challenge。
func CapProxy(c *gin.Context) {
	if !capProxyAllowed(c.Request.Method, c.Request.URL.Path) {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "not found"})
		return
	}

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
