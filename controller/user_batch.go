package controller

import (
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

// AdminLookupToken 管理员反查 token 归属（按 key/用户名/批次号模糊搜，跨所有用户）。
// GET /api/user/token/lookup?keyword=xxx&p=1&page_size=20
func AdminLookupToken(c *gin.Context) {
	keyword := c.Query("keyword")
	pageInfo := common.GetPageQuery(c)
	results, total, err := model.AdminSearchTokens(keyword, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	// 完整 key 带 sk- 前缀供复制；展示用的 key 脱敏（前后各 6 位）
	for i := range results {
		results[i].FullKey = "sk-" + results[i].Key
		results[i].Key = "sk-" + maskKey(results[i].Key)
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(results)
	common.ApiSuccess(c, pageInfo)
}

func maskKey(key string) string {
	if len(key) <= 12 {
		return key
	}
	return key[:6] + "******" + key[len(key)-6:]
}

// BatchSetGroupRequest 批量改分组请求。
type BatchSetGroupRequest struct {
	IDs   []int  `json:"ids"`
	Group string `json:"group"`
}

// BatchSetUserGroup 批量修改用户分组。
// POST /api/user/manage/batch_group
func BatchSetUserGroup(c *gin.Context) {
	var req BatchSetGroupRequest
	if err := c.ShouldBindJSON(&req); err != nil || len(req.IDs) == 0 || len(req.IDs) > 500 || req.Group == "" {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "参数错误：ids 须为 1-500 条且 group 不能为空"})
		return
	}
	if err := model.DB.Model(&model.User{}).Where("id IN ?", req.IDs).Update("group", req.Group).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	for _, id := range req.IDs {
		_ = model.InvalidateUserCache(id)
	}
	common.ApiSuccess(c, nil)
}

// BatchManageQuotaRequest 批量改余额请求。
// Mode: add(增量加) / subtract(增量减) / override(直接设为)
type BatchManageQuotaRequest struct {
	IDs   []int  `json:"ids"`
	Mode  string `json:"mode"`
	Value int    `json:"value"`
}

// BatchManageUserQuota 批量修改用户余额。
// POST /api/user/manage/batch_quota
func BatchManageUserQuota(c *gin.Context) {
	var req BatchManageQuotaRequest
	if err := c.ShouldBindJSON(&req); err != nil || len(req.IDs) == 0 || len(req.IDs) > 500 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "参数错误：ids 须为 1-500 条"})
		return
	}
	if req.Value < 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "数值不能为负"})
		return
	}

	var opErr error
	switch req.Mode {
	case "add":
		for _, id := range req.IDs {
			if err := model.IncreaseUserQuota(id, req.Value, true); err != nil {
				opErr = err
				break
			}
		}
	case "subtract":
		for _, id := range req.IDs {
			if err := model.DecreaseUserQuota(id, req.Value, true); err != nil {
				opErr = err
				break
			}
		}
	case "override":
		opErr = model.DB.Model(&model.User{}).Where("id IN ?", req.IDs).Update("quota", req.Value).Error
	default:
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "mode 只能是 add/subtract/override"})
		return
	}

	if opErr != nil {
		common.ApiError(c, opErr)
		return
	}
	for _, id := range req.IDs {
		_ = model.InvalidateUserCache(id)
	}
	common.ApiSuccess(c, nil)
}

// GetBatchStats 返回所有售卖批次的聚合统计（管理员）。
// GET /api/user/batch/stats
func GetBatchStats(c *gin.Context) {
	rows, err := model.GetBatchStats()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, rows)
}

// BatchManageUserRequest 批量管理用户请求。
type BatchManageUserRequest struct {
	IDs    []int  `json:"ids"`
	Action string `json:"action"` // disable / enable / delete
}

// BatchManageUser 批量启用/禁用/删除用户。
// POST /api/user/manage/batch_action
func BatchManageUser(c *gin.Context) {
	var req BatchManageUserRequest
	if err := c.ShouldBindJSON(&req); err != nil || len(req.IDs) == 0 || len(req.IDs) > 500 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "参数错误：ids 须为 1-500 条"})
		return
	}

	var opErr error
	switch req.Action {
	case "disable":
		opErr = model.DB.Model(&model.User{}).Where("id IN ?", req.IDs).Update("status", common.UserStatusDisabled).Error
	case "enable":
		opErr = model.DB.Model(&model.User{}).Where("id IN ?", req.IDs).Update("status", common.UserStatusEnabled).Error
	case "delete":
		for _, id := range req.IDs {
			if err := model.DeleteUserById(id); err != nil {
				opErr = err
				break
			}
		}
	case "disable_login":
		// 禁止登录：不影响 status，已创建的 API key 仍可用。root 用户(role=100)豁免，避免误锁。
		opErr = model.DB.Model(&model.User{}).Where("id IN ? AND role <> ?", req.IDs, common.RoleRootUser).Update("login_disabled", true).Error
	case "enable_login":
		opErr = model.DB.Model(&model.User{}).Where("id IN ?", req.IDs).Update("login_disabled", false).Error
	default:
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "action 只能是 disable/enable/delete/disable_login/enable_login"})
		return
	}

	if opErr != nil {
		common.ApiError(c, opErr)
		return
	}
	// 失效缓存 + 令牌缓存（禁用/删除后阻止旧状态继续生效）
	for _, id := range req.IDs {
		_ = model.InvalidateUserCache(id)
		_ = model.InvalidateUserTokensCache(id)
	}
	common.ApiSuccess(c, nil)
}

// SetTokenRateLimitRequest 管理员设置单个 token 的 RPM/TPM。
type SetTokenRateLimitRequest struct {
	TokenId int `json:"token_id"`
	Rpm     int `json:"rpm"`
	Tpm     int `json:"tpm"`
}

// SetTokenRateLimit 管理员给任意 token 设置 RPM/TPM 限流（跨用户）。
// POST /api/user/token/rate_limit
func SetTokenRateLimit(c *gin.Context) {
	var req SetTokenRateLimitRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.TokenId <= 0 || req.Rpm < 0 || req.Tpm < 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "参数错误"})
		return
	}
	token, err := model.GetTokenById(req.TokenId)
	if err != nil || token == nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "令牌不存在"})
		return
	}
	if err := model.DB.Model(&model.Token{}).Where("id = ?", req.TokenId).
		Updates(map[string]interface{}{"rpm": req.Rpm, "tpm": req.Tpm}).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	// 失效该用户令牌缓存，使新限流即时生效
	_ = model.InvalidateUserTokensCache(token.UserId)
	common.ApiSuccess(c, nil)
}

// BatchSetVisibleGroupsRequest 批量设置可见分组白名单请求。
// Groups 为空 = 清除限制（恢复看到全部可用分组）。
type BatchSetVisibleGroupsRequest struct {
	IDs    []int    `json:"ids"`
	Groups []string `json:"groups"`
}

// BatchSetVisibleGroups 批量设置用户「可见分组白名单」（仅影响展示）。
// POST /api/user/manage/batch_visible_groups
func BatchSetVisibleGroups(c *gin.Context) {
	var req BatchSetVisibleGroupsRequest
	if err := c.ShouldBindJSON(&req); err != nil || len(req.IDs) == 0 || len(req.IDs) > 500 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "参数错误：ids 须为 1-500 条"})
		return
	}
	// 规范化分组白名单：去空、去重、保序
	normalized := make([]string, 0, len(req.Groups))
	seen := make(map[string]struct{})
	for _, g := range req.Groups {
		g = strings.TrimSpace(g)
		if g == "" {
			continue
		}
		if _, dup := seen[g]; dup {
			continue
		}
		seen[g] = struct{}{}
		normalized = append(normalized, g)
	}

	for _, id := range req.IDs {
		user, err := model.GetUserById(id, true)
		if err != nil || user == nil {
			continue
		}
		// 读改写：仅改 VisibleGroups，保留用户其他 setting（notify/webhook 等）
		setting := user.GetSetting()
		setting.VisibleGroups = normalized
		user.SetSetting(setting)
		if err := user.Update(false); err != nil {
			common.ApiError(c, err)
			return
		}
		_ = model.InvalidateUserCache(id)
	}
	common.ApiSuccess(c, nil)
}
