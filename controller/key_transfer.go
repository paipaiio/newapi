package controller

import (
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type keyTransferRequest struct {
	TargetKey string `json:"target_key"` // 保留的 key（余额转入方）
	SourceKey string `json:"source_key"` // 被清空的 key（余额转出方）
}

// PostPublicKeyTransfer 把 source_key 的可用余额迁移到 target_key，无需登录。
// POST /api/public/key-transfer  body: {target_key, source_key}
//
// 关键：额度门在 relay 里是「账户 quota 恒生效 + token quota 仅在限额时生效」，两者都扣。
// 所以：
//   - 源可用余额 = 无限额 token 取账户 quota；限额 token 取 min(token.RemainQuota, 账户 quota)
//   - 转入目标：目标无限额 → 只加账户 quota（绝不动 token、绝不变限额，避免旧无限额 key 被套上限额导致原余额不可用）；
//     目标限额 → 账户 quota 与 token.RemainQuota 同步各加相同金额（min 不变）
//   - 清空源：账户 quota 扣掉迁移额；源为限额 token 时其 remain_quota 一并扣，使其 min 门为 0 而失效
//
// used_quota（历史消耗）两边都不动，因此不能用会反向改 used_quota 的 Increase/DecreaseTokenQuota，
// 改为事务内直接以相对表达式更新 quota / remain_quota，提交后清账户与 token 缓存。
func PostPublicKeyTransfer(c *gin.Context) {
	var req keyTransferRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "参数错误"})
		return
	}

	targetKey := strings.TrimPrefix(strings.TrimSpace(req.TargetKey), "sk-")
	sourceKey := strings.TrimPrefix(strings.TrimSpace(req.SourceKey), "sk-")
	if targetKey == "" || sourceKey == "" {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "请填写目标 key 和迁移 key"})
		return
	}
	if targetKey == sourceKey {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "目标 key 和迁移 key 不能相同"})
		return
	}

	dstToken, err := model.GetTokenByKey(targetKey, false)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "目标 key 不存在或已失效"})
		return
	}
	srcToken, err := model.GetTokenByKey(sourceKey, false)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "迁移 key 不存在或已失效"})
		return
	}
	if dstToken.Status != common.TokenStatusEnabled {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "目标 key 已被禁用"})
		return
	}
	if srcToken.Status != common.TokenStatusEnabled {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "迁移 key 已被禁用"})
		return
	}

	// 读取两个账户的当前余额
	var srcUserQuota, dstUserQuota int
	if err := model.DB.Model(&model.User{}).Where("id = ?", srcToken.UserId).
		Select("quota").Find(&srcUserQuota).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "获取迁移 key 账户信息失败"})
		return
	}
	if err := model.DB.Model(&model.User{}).Where("id = ?", dstToken.UserId).
		Select("quota").Find(&dstUserQuota).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "获取目标 key 账户信息失败"})
		return
	}

	// 计算源可用余额
	transferAmount := srcUserQuota
	if !srcToken.UnlimitedQuota && srcToken.RemainQuota < transferAmount {
		transferAmount = srcToken.RemainQuota
	}
	if transferAmount <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "迁移 key 没有可迁移的余额"})
		return
	}

	err = model.DB.Transaction(func(tx *gorm.DB) error {
		// 清空源账户余额，并直接禁用账户（status=2），彻底阻止该 key 继续使用
		if err := tx.Model(&model.User{}).Where("id = ?", srcToken.UserId).
			Updates(map[string]interface{}{
				"quota":  gorm.Expr("quota - ?", transferAmount),
				"status": common.UserStatusDisabled,
			}).Error; err != nil {
			return err
		}
		// 同时禁用源 token，token 层面也立即失效
		if err := tx.Model(&model.Token{}).Where("id = ?", srcToken.Id).
			Update("status", common.TokenStatusDisabled).Error; err != nil {
			return err
		}
		// 源为限额 token：remain_quota 一并扣减，使其 min 门为 0 而失效
		if !srcToken.UnlimitedQuota {
			if err := tx.Model(&model.Token{}).Where("id = ?", srcToken.Id).
				Update("remain_quota", gorm.Expr("remain_quota - ?", transferAmount)).Error; err != nil {
				return err
			}
		}
		// 转入目标账户余额
		if err := tx.Model(&model.User{}).Where("id = ?", dstToken.UserId).
			Update("quota", gorm.Expr("quota + ?", transferAmount)).Error; err != nil {
			return err
		}
		// 目标为限额 token：remain_quota 同步加相同金额；无限额目标绝不动 token
		if !dstToken.UnlimitedQuota {
			if err := tx.Model(&model.Token{}).Where("id = ?", dstToken.Id).
				Update("remain_quota", gorm.Expr("remain_quota + ?", transferAmount)).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		common.SysError("key-transfer 事务失败: " + err.Error())
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "迁移失败，请重试"})
		return
	}

	// 清理两个账户及其令牌缓存，让余额与 token 门限立即生效
	_ = model.InvalidateUserCache(srcToken.UserId)
	_ = model.InvalidateUserCache(dstToken.UserId)
	_ = model.InvalidateUserTokensCache(srcToken.UserId)
	_ = model.InvalidateUserTokensCache(dstToken.UserId)

	// 计算目标 key 迁移后的可用余额用于展示
	dstNewRemain := dstUserQuota + transferAmount
	if !dstToken.UnlimitedQuota {
		newTokenRemain := dstToken.RemainQuota + transferAmount
		if newTokenRemain < dstNewRemain {
			dstNewRemain = newTokenRemain
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"transfer_amount":   transferAmount,
			"target_remain":     dstNewRemain,
			"target_name":       dstToken.Name,
			"target_unlimited":  dstToken.UnlimitedQuota,
		},
	})
}
