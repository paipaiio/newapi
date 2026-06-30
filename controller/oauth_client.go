package controller

import (
	"net/url"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

// 管理端：OAuth 应用（第三方接入「使用本系统登录」）的增删改查。全部需要 AdminAuth。

type oauthClientRequest struct {
	Name         string   `json:"name"`
	Logo         string   `json:"logo"`
	RedirectUris []string `json:"redirect_uris"`
	Scopes       []string `json:"scopes"`
	IsPublic     bool     `json:"is_public"`
	AutoApprove  bool     `json:"auto_approve"`
	Enabled      bool     `json:"enabled"`
}

func validateRedirectUris(uris []string) ([]string, bool) {
	cleaned := make([]string, 0, len(uris))
	for _, u := range uris {
		u = strings.TrimSpace(u)
		if u == "" {
			continue
		}
		parsed, err := url.Parse(u)
		if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
			return nil, false
		}
		cleaned = append(cleaned, u)
	}
	return cleaned, len(cleaned) > 0
}

func normalizeScopes(scopes []string) string {
	if len(scopes) == 0 {
		return "openid profile email"
	}
	hasOpenID := false
	out := make([]string, 0, len(scopes))
	for _, s := range scopes {
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		if s == "openid" {
			hasOpenID = true
		}
		out = append(out, s)
	}
	if !hasOpenID {
		out = append([]string{"openid"}, out...)
	}
	return strings.Join(out, " ")
}

func GetAllOAuthClients(c *gin.Context) {
	clients, err := model.GetAllOAuthClients()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, clients)
}

func CreateOAuthClient(c *gin.Context) {
	var req oauthClientRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "请求参数错误")
		return
	}
	if strings.TrimSpace(req.Name) == "" {
		common.ApiErrorMsg(c, "应用名称不能为空")
		return
	}
	uris, ok := validateRedirectUris(req.RedirectUris)
	if !ok {
		common.ApiErrorMsg(c, "回调地址不合法，至少需要一个 http(s) 地址")
		return
	}

	clientId := "tuf_" + common.GetUUID()
	client := &model.OAuthClient{
		ClientId:     clientId,
		Name:         strings.TrimSpace(req.Name),
		Logo:         strings.TrimSpace(req.Logo),
		RedirectUris: strings.Join(uris, "\n"),
		Scopes:       normalizeScopes(req.Scopes),
		IsPublic:     req.IsPublic,
		AutoApprove:  req.AutoApprove,
		Enabled:      req.Enabled,
	}

	var plainSecret string
	if !req.IsPublic {
		secret, err := common.GenerateKey()
		if err != nil {
			common.ApiError(c, err)
			return
		}
		plainSecret = secret
		if err := client.SetSecret(secret); err != nil {
			common.ApiError(c, err)
			return
		}
	}

	if err := model.CreateOAuthClient(client); err != nil {
		common.ApiError(c, err)
		return
	}
	// 明文密钥只在创建时返回一次。
	common.ApiSuccess(c, gin.H{
		"client":        client,
		"client_secret": plainSecret,
	})
}

func UpdateOAuthClient(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiErrorMsg(c, "无效的 id")
		return
	}
	var req oauthClientRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "请求参数错误")
		return
	}
	if strings.TrimSpace(req.Name) == "" {
		common.ApiErrorMsg(c, "应用名称不能为空")
		return
	}
	uris, ok := validateRedirectUris(req.RedirectUris)
	if !ok {
		common.ApiErrorMsg(c, "回调地址不合法，至少需要一个 http(s) 地址")
		return
	}
	existing, err := model.GetOAuthClientById(id)
	if err != nil {
		common.ApiErrorMsg(c, "应用不存在")
		return
	}
	existing.Name = strings.TrimSpace(req.Name)
	existing.Logo = strings.TrimSpace(req.Logo)
	existing.RedirectUris = strings.Join(uris, "\n")
	existing.Scopes = normalizeScopes(req.Scopes)
	existing.IsPublic = req.IsPublic
	existing.AutoApprove = req.AutoApprove
	existing.Enabled = req.Enabled
	if err := model.UpdateOAuthClient(existing); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, existing)
}

func DeleteOAuthClient(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiErrorMsg(c, "无效的 id")
		return
	}
	if err := model.DeleteOAuthClient(id); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

// RotateOAuthClientSecret 重新生成机密客户端的密钥，返回新的明文密钥（仅此一次）。
func RotateOAuthClientSecret(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiErrorMsg(c, "无效的 id")
		return
	}
	existing, err := model.GetOAuthClientById(id)
	if err != nil {
		common.ApiErrorMsg(c, "应用不存在")
		return
	}
	if existing.IsPublic {
		common.ApiErrorMsg(c, "public 客户端不使用密钥")
		return
	}
	secret, err := common.GenerateKey()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := existing.SetSecret(secret); err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.UpdateOAuthClientSecret(id, existing.ClientSecretHash); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"client_secret": secret})
}
