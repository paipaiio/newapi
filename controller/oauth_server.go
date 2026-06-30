package controller

import (
	"crypto/sha256"
	"encoding/base64"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/oauthprovider"
	"github.com/QuantumNous/new-api/setting/system_setting"

	"github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// 本文件实现 new-api 作为 OpenID Connect Provider（身份提供方）的协议端点：
// discovery / jwks / authorize / token / userinfo，以及供前端同意页调用的 consent 接口。

func oauthServerEnabled() bool {
	return system_setting.GetOAuthServerSettings().Enabled
}

// buildUserClaims 按授权的 scope 组装用户声明，供 id_token 与 userinfo 共用。
func buildUserClaims(user *model.User, scopes map[string]bool) map[string]interface{} {
	claims := map[string]interface{}{}
	if scopes["profile"] {
		name := user.DisplayName
		if name == "" {
			name = user.Username
		}
		claims["name"] = name
		claims["preferred_username"] = user.Username
	}
	if scopes["email"] {
		// 仅在用户确有邮箱时才下发 email/email_verified。
		// 微信/Telegram 等第三方注册用户邮箱为空，发空串会噎到下游 OIDC 库；
		// 按 OIDC 规范，缺失的 claim 应直接省略，接入方应以 sub 作为账号唯一标识。
		if user.Email != "" {
			claims["email"] = user.Email
			claims["email_verified"] = true
		}
	}
	if scopes["groups"] {
		claims["groups"] = []string{user.Group}
	}
	return claims
}

func scopeSet(scope string) map[string]bool {
	m := map[string]bool{}
	for _, s := range strings.Fields(scope) {
		m[s] = true
	}
	return m
}

// ---- Discovery & JWKS ----

func OIDCDiscovery(c *gin.Context) {
	issuer := system_setting.GetOAuthIssuer()
	c.JSON(http.StatusOK, gin.H{
		"issuer":                                issuer,
		"authorization_endpoint":                issuer + "/oauth2/authorize",
		"token_endpoint":                        issuer + "/oauth2/token",
		"userinfo_endpoint":                     issuer + "/oauth2/userinfo",
		"jwks_uri":                              issuer + "/.well-known/jwks.json",
		"response_types_supported":              []string{"code"},
		"grant_types_supported":                 []string{"authorization_code", "refresh_token"},
		"subject_types_supported":               []string{"public"},
		"id_token_signing_alg_values_supported": []string{"RS256"},
		"scopes_supported":                      []string{"openid", "profile", "email", "groups"},
		"token_endpoint_auth_methods_supported": []string{"client_secret_basic", "client_secret_post", "none"},
		"code_challenge_methods_supported":      []string{"S256", "plain"},
		"claims_supported": []string{
			"sub", "iss", "aud", "exp", "iat", "auth_time", "nonce",
			"name", "preferred_username", "email", "email_verified", "groups",
		},
	})
}

func OIDCJWKS(c *gin.Context) {
	jwks, err := oauthprovider.JWKS()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "server_error"})
		return
	}
	c.JSON(http.StatusOK, jwks)
}

// ---- Authorize ----

// redirectWithError 把错误按 OAuth2 规范回传到 RP 的 redirect_uri。
func redirectWithError(c *gin.Context, redirectURI, errCode, desc, state string) {
	u, err := url.Parse(redirectURI)
	if err != nil {
		c.String(http.StatusBadRequest, "invalid redirect_uri")
		return
	}
	q := u.Query()
	q.Set("error", errCode)
	if desc != "" {
		q.Set("error_description", desc)
	}
	if state != "" {
		q.Set("state", state)
	}
	u.RawQuery = q.Encode()
	c.Redirect(http.StatusFound, u.String())
}

func redirectWithCode(c *gin.Context, redirectURI, code, state string) {
	u, err := url.Parse(redirectURI)
	if err != nil {
		c.String(http.StatusBadRequest, "invalid redirect_uri")
		return
	}
	q := u.Query()
	q.Set("code", code)
	if state != "" {
		q.Set("state", state)
	}
	u.RawQuery = q.Encode()
	c.Redirect(http.StatusFound, u.String())
}

func OAuthAuthorize(c *gin.Context) {
	if !oauthServerEnabled() {
		c.String(http.StatusServiceUnavailable, "OAuth provider is not enabled")
		return
	}

	responseType := c.Query("response_type")
	clientId := c.Query("client_id")
	redirectURI := c.Query("redirect_uri")
	scope := c.Query("scope")
	state := c.Query("state")
	nonce := c.Query("nonce")
	codeChallenge := c.Query("code_challenge")
	codeChallengeMethod := c.Query("code_challenge_method")

	// 1) 校验 client 与 redirect_uri —— 这两步出错绝不能回跳（防开放重定向）。
	client := model.GetEnabledOAuthClient(clientId)
	if client == nil {
		c.String(http.StatusBadRequest, "unknown or disabled client_id")
		return
	}
	if redirectURI == "" || !client.IsRedirectAllowed(redirectURI) {
		c.String(http.StatusBadRequest, "redirect_uri is not registered for this client")
		return
	}

	// 自此之后的错误回跳到 RP。
	if responseType != "code" {
		redirectWithError(c, redirectURI, "unsupported_response_type", "only response_type=code is supported", state)
		return
	}

	requestedScopes := strings.Fields(scope)
	hasOpenID := false
	for _, s := range requestedScopes {
		if s == "openid" {
			hasOpenID = true
			break
		}
	}
	if !hasOpenID {
		redirectWithError(c, redirectURI, "invalid_scope", "openid scope is required", state)
		return
	}
	if !client.AreScopesAllowed(requestedScopes) {
		redirectWithError(c, redirectURI, "invalid_scope", "one or more scopes are not allowed for this client", state)
		return
	}

	// 2) PKCE：public 客户端强制，其它可选。
	if codeChallenge != "" {
		if codeChallengeMethod == "" {
			codeChallengeMethod = "plain"
		}
		if codeChallengeMethod != "S256" && codeChallengeMethod != "plain" {
			redirectWithError(c, redirectURI, "invalid_request", "unsupported code_challenge_method", state)
			return
		}
	} else if client.IsPublic {
		redirectWithError(c, redirectURI, "invalid_request", "code_challenge is required for public clients", state)
		return
	}

	// 3) 解析当前登录用户。SameSite=Strict 下首次跨站进入不会带 session cookie，
	//    统一引导到 SPA 登录页并带 redirect 回跳；登录后由前端在同源上下文再次发起 authorize（此时 cookie 会带上）。
	session := sessions.Default(c)
	idVal := session.Get("id")
	if idVal == nil {
		loginURL := "/login?redirect=" + url.QueryEscape(c.Request.URL.RequestURI())
		c.Redirect(http.StatusFound, loginURL)
		return
	}
	userId, _ := idVal.(int)
	user, err := model.GetUserById(userId, false)
	if err != nil || user == nil {
		loginURL := "/login?redirect=" + url.QueryEscape(c.Request.URL.RequestURI())
		c.Redirect(http.StatusFound, loginURL)
		return
	}
	if user.Status != common.UserStatusEnabled {
		redirectWithError(c, redirectURI, "access_denied", "user account is disabled", state)
		return
	}
	if user.Role != common.RoleRootUser && user.LoginDisabled {
		redirectWithError(c, redirectURI, "access_denied", "user is not allowed to log in", state)
		return
	}

	// 4) 创建待处理授权请求。
	req := &model.OAuthAuthorizationCode{
		RequestId:           common.GetUUID(),
		ClientId:            clientId,
		UserId:              userId,
		RedirectUri:         redirectURI,
		Scope:               strings.Join(requestedScopes, " "),
		Nonce:               nonce,
		State:               state,
		CodeChallenge:       codeChallenge,
		CodeChallengeMethod: codeChallengeMethod,
	}
	if err := model.CreateOAuthAuthRequest(req); err != nil {
		redirectWithError(c, redirectURI, "server_error", "failed to create authorization request", state)
		return
	}

	// 5) 受信任应用免同意，直接签发 code 回跳；否则跳到同意页。
	if client.AutoApprove && system_setting.GetOAuthServerSettings().ConsentSkipForAutoApprove {
		code, err := model.ApproveOAuthAuthRequest(req.RequestId, userId)
		if err != nil {
			redirectWithError(c, redirectURI, "server_error", "failed to issue code", state)
			return
		}
		redirectWithCode(c, redirectURI, code, state)
		return
	}
	c.Redirect(http.StatusFound, "/oauth/consent?request_id="+url.QueryEscape(req.RequestId))
}

// ---- Consent (前端同意页调用，UserAuth) ----

func GetOAuthConsent(c *gin.Context) {
	requestId := c.Param("request_id")
	userId := c.GetInt("id")
	req, err := model.GetOAuthAuthRequestByRequestId(requestId)
	if err != nil || req == nil {
		common.ApiErrorMsg(c, "授权请求不存在或已过期")
		return
	}
	if req.UserId != userId {
		common.ApiErrorMsg(c, "无权处理该授权请求")
		return
	}
	if req.Status != model.OAuthCodeStatusPending || req.ExpiresAt <= common.GetTimestamp() {
		common.ApiErrorMsg(c, "授权请求不存在或已过期")
		return
	}
	client := model.GetEnabledOAuthClient(req.ClientId)
	if client == nil {
		common.ApiErrorMsg(c, "应用不存在或已禁用")
		return
	}
	common.ApiSuccess(c, gin.H{
		"client_name": client.Name,
		"client_logo": client.Logo,
		"scopes":      strings.Fields(req.Scope),
		"request_id":  req.RequestId,
	})
}

func PostOAuthConsent(c *gin.Context) {
	requestId := c.Param("request_id")
	userId := c.GetInt("id")
	var body struct {
		Action string `json:"action"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		common.ApiErrorMsg(c, "请求参数错误")
		return
	}
	req, err := model.GetOAuthAuthRequestByRequestId(requestId)
	if err != nil || req == nil {
		common.ApiErrorMsg(c, "授权请求不存在或已过期")
		return
	}
	if req.UserId != userId {
		common.ApiErrorMsg(c, "无权处理该授权请求")
		return
	}
	if req.Status != model.OAuthCodeStatusPending || req.ExpiresAt <= common.GetTimestamp() {
		common.ApiErrorMsg(c, "授权请求不存在或已过期")
		return
	}

	if body.Action == "approve" {
		code, err := model.ApproveOAuthAuthRequest(req.RequestId, userId)
		if err != nil {
			common.ApiErrorMsg(c, "授权失败，请重试")
			return
		}
		u, _ := url.Parse(req.RedirectUri)
		q := u.Query()
		q.Set("code", code)
		if req.State != "" {
			q.Set("state", req.State)
		}
		u.RawQuery = q.Encode()
		common.ApiSuccess(c, gin.H{"redirect": u.String()})
		return
	}

	// 拒绝授权：回跳带 error。
	u, _ := url.Parse(req.RedirectUri)
	q := u.Query()
	q.Set("error", "access_denied")
	if req.State != "" {
		q.Set("state", req.State)
	}
	u.RawQuery = q.Encode()
	common.ApiSuccess(c, gin.H{"redirect": u.String()})
}

// ---- Token ----

func tokenError(c *gin.Context, status int, errCode, desc string) {
	c.JSON(status, gin.H{"error": errCode, "error_description": desc})
}

// extractClientCredentials 从 Basic 头或表单取 client_id / client_secret。
func extractClientCredentials(c *gin.Context) (clientId, clientSecret string) {
	if user, pass, ok := c.Request.BasicAuth(); ok {
		// Basic 头里是 URL 编码的，按 RFC 6749 解码。
		if u, err := url.QueryUnescape(user); err == nil {
			user = u
		}
		if p, err := url.QueryUnescape(pass); err == nil {
			pass = p
		}
		return user, pass
	}
	return c.PostForm("client_id"), c.PostForm("client_secret")
}

func verifyPKCE(challenge, method, verifier string) bool {
	if challenge == "" {
		return true // 该授权未使用 PKCE
	}
	if verifier == "" {
		return false
	}
	switch method {
	case "S256":
		sum := sha256.Sum256([]byte(verifier))
		computed := base64.RawURLEncoding.EncodeToString(sum[:])
		return computed == challenge
	case "plain":
		return verifier == challenge
	default:
		return false
	}
}

func issueTokens(c *gin.Context, clientId string, userId int, scope, nonce string) {
	user, err := model.GetUserById(userId, false)
	if err != nil || user == nil {
		tokenError(c, http.StatusBadRequest, "invalid_grant", "user not found")
		return
	}

	accessToken, err1 := common.GenerateKey()
	refreshToken, err2 := common.GenerateKey()
	if err1 != nil || err2 != nil {
		tokenError(c, http.StatusInternalServerError, "server_error", "failed to generate tokens")
		return
	}
	if err := model.CreateOAuthToken(accessToken, refreshToken, clientId, userId, scope); err != nil {
		tokenError(c, http.StatusInternalServerError, "server_error", "failed to persist tokens")
		return
	}

	now := common.GetTimestamp()
	scopes := scopeSet(scope)
	idClaims := jwt.MapClaims{
		"iss":       system_setting.GetOAuthIssuer(),
		"sub":       strconv.Itoa(userId),
		"aud":       clientId,
		"exp":       now + model.OAuthAccessTokenTTLSeconds,
		"iat":       now,
		"auth_time": now,
	}
	if nonce != "" {
		idClaims["nonce"] = nonce
	}
	for k, v := range buildUserClaims(user, scopes) {
		idClaims[k] = v
	}
	idToken, err := oauthprovider.SignIDToken(idClaims)
	if err != nil {
		tokenError(c, http.StatusInternalServerError, "server_error", "failed to sign id_token")
		return
	}

	c.Header("Cache-Control", "no-store")
	c.Header("Pragma", "no-cache")
	c.JSON(http.StatusOK, gin.H{
		"access_token":  accessToken,
		"token_type":    "Bearer",
		"expires_in":    model.OAuthAccessTokenTTLSeconds,
		"refresh_token": refreshToken,
		"id_token":      idToken,
		"scope":         scope,
	})
}

func OAuthToken(c *gin.Context) {
	if !oauthServerEnabled() {
		tokenError(c, http.StatusServiceUnavailable, "temporarily_unavailable", "OAuth provider is not enabled")
		return
	}

	grantType := c.PostForm("grant_type")
	clientId, clientSecret := extractClientCredentials(c)

	client := model.GetEnabledOAuthClient(clientId)
	if client == nil {
		tokenError(c, http.StatusUnauthorized, "invalid_client", "unknown or disabled client")
		return
	}
	// 机密客户端必须校验密钥；public 客户端不需要（靠 PKCE）。
	if !client.IsPublic {
		if !client.VerifySecret(clientSecret) {
			tokenError(c, http.StatusUnauthorized, "invalid_client", "invalid client credentials")
			return
		}
	}

	switch grantType {
	case "authorization_code":
		code := c.PostForm("code")
		redirectURI := c.PostForm("redirect_uri")
		codeVerifier := c.PostForm("code_verifier")
		rec, err := model.ConsumeOAuthCode(code, clientId, redirectURI)
		if err != nil {
			tokenError(c, http.StatusBadRequest, "invalid_grant", err.Error())
			return
		}
		if !verifyPKCE(rec.CodeChallenge, rec.CodeChallengeMethod, codeVerifier) {
			tokenError(c, http.StatusBadRequest, "invalid_grant", "PKCE verification failed")
			return
		}
		issueTokens(c, clientId, rec.UserId, rec.Scope, rec.Nonce)

	case "refresh_token":
		refreshToken := c.PostForm("refresh_token")
		rec, err := model.GetOAuthTokenByRefresh(refreshToken)
		if err != nil {
			tokenError(c, http.StatusBadRequest, "invalid_grant", "invalid or expired refresh token")
			return
		}
		if rec.ClientId != clientId {
			tokenError(c, http.StatusBadRequest, "invalid_grant", "refresh token was issued to a different client")
			return
		}
		// 轮换：吊销旧记录并签发新令牌。
		user, err := model.GetUserById(rec.UserId, false)
		if err != nil || user == nil {
			tokenError(c, http.StatusBadRequest, "invalid_grant", "user not found")
			return
		}
		accessToken, e1 := common.GenerateKey()
		newRefresh, e2 := common.GenerateKey()
		if e1 != nil || e2 != nil {
			tokenError(c, http.StatusInternalServerError, "server_error", "failed to generate tokens")
			return
		}
		if err := model.RotateOAuthToken(rec.Id, accessToken, newRefresh, clientId, rec.UserId, rec.Scope); err != nil {
			tokenError(c, http.StatusInternalServerError, "server_error", "failed to rotate tokens")
			return
		}
		now := common.GetTimestamp()
		scopes := scopeSet(rec.Scope)
		idClaims := jwt.MapClaims{
			"iss": system_setting.GetOAuthIssuer(), "sub": strconv.Itoa(rec.UserId),
			"aud": clientId, "exp": now + model.OAuthAccessTokenTTLSeconds, "iat": now, "auth_time": now,
		}
		for k, v := range buildUserClaims(user, scopes) {
			idClaims[k] = v
		}
		idToken, err := oauthprovider.SignIDToken(idClaims)
		if err != nil {
			tokenError(c, http.StatusInternalServerError, "server_error", "failed to sign id_token")
			return
		}
		c.Header("Cache-Control", "no-store")
		c.JSON(http.StatusOK, gin.H{
			"access_token":  accessToken,
			"token_type":    "Bearer",
			"expires_in":    model.OAuthAccessTokenTTLSeconds,
			"refresh_token": newRefresh,
			"id_token":      idToken,
			"scope":         rec.Scope,
		})

	default:
		tokenError(c, http.StatusBadRequest, "unsupported_grant_type", "grant_type not supported")
	}
}

// ---- UserInfo ----

func OAuthUserInfo(c *gin.Context) {
	if !oauthServerEnabled() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "temporarily_unavailable"})
		return
	}
	authz := c.GetHeader("Authorization")
	if !strings.HasPrefix(authz, "Bearer ") {
		c.Header("WWW-Authenticate", "Bearer")
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid_token"})
		return
	}
	accessToken := strings.TrimSpace(strings.TrimPrefix(authz, "Bearer "))
	tok, err := model.GetOAuthTokenByAccess(accessToken)
	if err != nil {
		c.Header("WWW-Authenticate", `Bearer error="invalid_token"`)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid_token"})
		return
	}
	user, err := model.GetUserById(tok.UserId, false)
	if err != nil || user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid_token"})
		return
	}
	resp := gin.H{"sub": strconv.Itoa(tok.UserId)}
	for k, v := range buildUserClaims(user, scopeSet(tok.Scope)) {
		resp[k] = v
	}
	c.JSON(http.StatusOK, resp)
}
