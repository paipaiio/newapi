package controller

import (
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

// GetPublicKeyBalance 通过 API Key 查询余额与使用情况，无需登录。
// GET /api/public/key-balance?key=sk-xxx
//
// 额度口径与 /dashboard/billing/usage 保持一致：
//   - token.UnlimitedQuota=false：余额/用量取 token 自身（普通限额 key 及新售卖 key）
//   - token.UnlimitedQuota=true：余额/用量取账户（旧售卖模式：token 无限，账户是实际上限）
//
// 模型明细聚合维度同上：限额 token 按 token_id，无限 token 按 user_id。
func GetPublicKeyBalance(c *gin.Context) {
	key := strings.TrimSpace(c.Query("key"))
	if key == "" {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "请提供 key 参数"})
		return
	}
	key = strings.TrimPrefix(key, "sk-")

	token, err := model.GetTokenByKey(key, false)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "key 不存在或已失效"})
		return
	}
	if token.Status != common.TokenStatusEnabled {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "key 已被禁用"})
		return
	}

	var remainQuota, usedQuota, totalQuota int
	var requestCount int
	var statUserId, statTokenId int

	if token.UnlimitedQuota {
		// 旧售卖模式：token 无限额度，账户 quota 才是真实余额上限
		var user model.User
		if dbErr := model.DB.Where("id = ? AND status = 1", token.UserId).
			Select("id, quota, used_quota, request_count").
			First(&user).Error; dbErr != nil {
			c.JSON(http.StatusOK, gin.H{"success": false, "message": "获取账户信息失败"})
			return
		}
		remainQuota = user.Quota
		usedQuota = user.UsedQuota
		totalQuota = user.Quota + user.UsedQuota
		requestCount = user.RequestCount
		statUserId = token.UserId
	} else {
		// 普通限额 key 或新售卖 key：以 token 自身额度为准
		remainQuota = token.RemainQuota
		usedQuota = token.UsedQuota
		totalQuota = token.RemainQuota + token.UsedQuota
		statTokenId = token.Id
		// request_count 从关联账户读取（对独享账户的售卖 key 即等于该 key 的请求数）
		var user model.User
		if dbErr := model.DB.Where("id = ? AND status = 1", token.UserId).
			Select("id, request_count").
			First(&user).Error; dbErr == nil {
			requestCount = user.RequestCount
		}
	}

	expiredAt := token.ExpiredTime
	if expiredAt == -1 {
		expiredAt = 0
	}

	// 按模型消耗明细（原始 quota 单位，前端用 formatQuota 统一换算）
	type ModelStat struct {
		ModelName string `json:"model_name"`
		Quota     int64  `json:"quota"`
		Count     int64  `json:"count"`
		Tokens    int64  `json:"tokens"`
	}
	modelStats := make([]ModelStat, 0)
	if rawStats, statErr := model.GetModelUsageStats(statUserId, statTokenId); statErr == nil {
		for _, s := range rawStats {
			if s.ModelName == "" {
				continue
			}
			modelStats = append(modelStats, ModelStat{
				ModelName: s.ModelName,
				Quota:     s.Quota,
				Count:     s.Count,
				Tokens:    s.Tokens,
			})
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"name":            token.Name,
			"group":           token.Group,
			"expires_at":      expiredAt,
			"unlimited_quota": token.UnlimitedQuota,
			"remain_quota":    remainQuota,
			"used_quota":      usedQuota,
			"total_quota":     totalQuota,
			"request_count":   requestCount,
			"model_stats":     modelStats,
		},
	})
}
