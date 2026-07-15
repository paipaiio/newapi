package controller

import (
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

// getAdminTargetUser fetches the target user by URL :id param and verifies
// that the calling admin is allowed to manage a user of that role.
func getAdminTargetUser(c *gin.Context) (*model.User, bool) {
	targetId, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return nil, false
	}
	targetUser, err := model.GetUserById(targetId, false)
	if err != nil {
		common.ApiError(c, err)
		return nil, false
	}
	myRole := c.GetInt("role")
	if !canManageTargetRole(myRole, targetUser.Role) {
		common.ApiErrorI18n(c, i18n.MsgForbidden)
		return nil, false
	}
	return targetUser, true
}

// AdminGetUserTokens GET /api/user/:id/tokens
func AdminGetUserTokens(c *gin.Context) {
	targetUser, ok := getAdminTargetUser(c)
	if !ok {
		return
	}
	pageInfo := common.GetPageQuery(c)
	tokens, err := model.GetAllUserTokens(targetUser.Id, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	total, _ := model.CountUserTokens(targetUser.Id)
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(buildMaskedTokenResponses(tokens))
	common.ApiSuccess(c, pageInfo)
}

// AdminGetUserToken GET /api/user/:id/tokens/:token_id
func AdminGetUserToken(c *gin.Context) {
	targetUser, ok := getAdminTargetUser(c)
	if !ok {
		return
	}
	tokenId, err := strconv.Atoi(c.Param("token_id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	token, err := model.GetTokenByIds(tokenId, targetUser.Id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, buildMaskedTokenResponse(token))
}

// AdminUpdateUserToken PUT /api/user/:id/tokens/:token_id
func AdminUpdateUserToken(c *gin.Context) {
	targetUser, ok := getAdminTargetUser(c)
	if !ok {
		return
	}
	tokenId, err := strconv.Atoi(c.Param("token_id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	statusOnly := c.Query("status_only")

	incoming := model.Token{}
	if err := c.ShouldBindJSON(&incoming); err != nil {
		common.ApiError(c, err)
		return
	}

	if statusOnly == "" {
		if len(incoming.Name) > 50 {
			common.ApiErrorI18n(c, i18n.MsgTokenNameTooLong)
			return
		}
		if !incoming.UnlimitedQuota {
			if incoming.RemainQuota < 0 {
				common.ApiErrorI18n(c, i18n.MsgTokenQuotaNegative)
				return
			}
			maxQuotaValue := int((1000000000 * common.QuotaPerUnit))
			if incoming.RemainQuota > maxQuotaValue {
				common.ApiErrorI18n(c, i18n.MsgTokenQuotaExceedMax, map[string]any{"Max": maxQuotaValue})
				return
			}
		}
	}

	cleanToken, err := model.GetTokenByIds(tokenId, targetUser.Id)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	if incoming.Status == common.TokenStatusEnabled {
		if cleanToken.Status == common.TokenStatusExpired && cleanToken.ExpiredTime <= common.GetTimestamp() && cleanToken.ExpiredTime != -1 {
			common.ApiErrorI18n(c, i18n.MsgTokenExpiredCannotEnable)
			return
		}
		if cleanToken.Status == common.TokenStatusExhausted && cleanToken.RemainQuota <= 0 && !cleanToken.UnlimitedQuota {
			common.ApiErrorI18n(c, i18n.MsgTokenExhaustedCannotEable)
			return
		}
	}

	if statusOnly != "" {
		cleanToken.Status = incoming.Status
	} else {
		normalizedGroup, err := validateTokenGroups(incoming.Group)
		if err != nil {
			common.ApiError(c, err)
			return
		}
		incoming.Group = normalizedGroup
		cleanToken.Name = incoming.Name
		cleanToken.ExpiredTime = incoming.ExpiredTime
		cleanToken.RemainQuota = incoming.RemainQuota
		cleanToken.UnlimitedQuota = incoming.UnlimitedQuota
		cleanToken.ModelLimitsEnabled = incoming.ModelLimitsEnabled
		cleanToken.ModelLimits = incoming.ModelLimits
		cleanToken.AllowIps = incoming.AllowIps
		cleanToken.Group = incoming.Group
		cleanToken.CrossGroupRetry = incoming.CrossGroupRetry
		cleanToken.Rpm = incoming.Rpm
		cleanToken.Tpm = incoming.Tpm
	}

	if err := cleanToken.Update(); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    buildMaskedTokenResponse(cleanToken),
	})
}

// AdminDeleteUserToken DELETE /api/user/:id/tokens/:token_id
func AdminDeleteUserToken(c *gin.Context) {
	targetUser, ok := getAdminTargetUser(c)
	if !ok {
		return
	}
	tokenId, err := strconv.Atoi(c.Param("token_id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	token, err := model.GetTokenByIds(tokenId, targetUser.Id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := token.Delete(); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

// AdminGetUserTokenKey GET /api/user/:id/tokens/:token_id/key
// Returns the full plaintext key. Rate-limited: max 10 calls/min per admin.
func AdminGetUserTokenKey(c *gin.Context) {
	targetUser, ok := getAdminTargetUser(c)
	if !ok {
		return
	}
	tokenId, err := strconv.Atoi(c.Param("token_id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	token, err := model.GetTokenByIds(tokenId, targetUser.Id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"key": token.GetFullKey(),
	})
}
