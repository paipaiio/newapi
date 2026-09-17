package model

import (
	"errors"
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"

	"gorm.io/gorm"
)

func normalizeRedeemAPIKeyCandidates(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	stripped := strings.TrimPrefix(raw, "sk-")
	if stripped == "" {
		return nil
	}
	if stripped == raw {
		return []string{raw}
	}
	return []string{stripped, raw}
}

// RedeemAccountByAPIKey transfers the entire wallet of the account that owns
// key to destUserId, then disables that source account and all of its tokens.
// It is intended for the compliance site redemption form only.
func RedeemAccountByAPIKey(rawKey string, destUserId int) (quota int, err error) {
	candidates := normalizeRedeemAPIKeyCandidates(rawKey)
	if len(candidates) == 0 || destUserId == 0 {
		return 0, ErrRedeemFailed
	}

	var sourceUserId int
	err = DB.Transaction(func(tx *gorm.DB) error {
		token := &Token{}
		var findErr error
		for _, key := range candidates {
			findErr = lockForUpdate(tx).Where(commonKeyCol+" = ?", key).First(token).Error
			if findErr == nil {
				break
			}
			if !errors.Is(findErr, gorm.ErrRecordNotFound) {
				return findErr
			}
		}
		if findErr != nil {
			return ErrRedeemFailed
		}
		if token.UserId == destUserId {
			return ErrRedeemFailed
		}

		firstID, secondID := token.UserId, destUserId
		if firstID > secondID {
			firstID, secondID = secondID, firstID
		}
		var locked []User
		if err := lockForUpdate(tx).Where("id IN ?", []int{firstID, secondID}).Find(&locked).Error; err != nil {
			return err
		}
		users := make(map[int]*User, len(locked))
		for i := range locked {
			users[locked[i].Id] = &locked[i]
		}
		source, okSource := users[token.UserId]
		dest, okDest := users[destUserId]
		if !okSource || !okDest {
			return ErrRedeemFailed
		}
		if source.Role >= common.RoleAdminUser {
			return ErrRedeemFailed
		}
		if source.Status != common.UserStatusEnabled || dest.Status != common.UserStatusEnabled {
			return ErrRedeemFailed
		}
		if source.Quota <= 0 {
			return ErrRedeemFailed
		}

		quota = source.Quota
		sourceUserId = source.Id

		if err := tx.Model(&User{}).Where("id = ?", dest.Id).
			Update("quota", gorm.Expr("quota + ?", quota)).Error; err != nil {
			return err
		}

		if _, err := IncrementUserAuthVersionWithTx(tx, source.Id); err != nil {
			return err
		}
		result := tx.Model(&User{}).
			Where("id = ? AND status = ?", source.Id, common.UserStatusEnabled).
			Updates(map[string]interface{}{
				"quota":  0,
				"status": common.UserStatusDisabled,
			})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return ErrRedeemFailed
		}
		if err := tx.Model(&Token{}).Where("user_id = ?", source.Id).
			Update("status", common.TokenStatusDisabled).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		if !errors.Is(err, ErrRedeemFailed) {
			common.SysError("account key redeem failed: " + err.Error())
		}
		return 0, ErrRedeemFailed
	}

	_ = invalidateUserCache(destUserId)
	_ = invalidateUserCache(sourceUserId)
	_ = InvalidateUserTokensCache(sourceUserId)
	_, _ = RevokeAllUserSessions(sourceUserId, "account_key_redeemed")
	syncCreditUserQuotaCache(destUserId, quota, "account_key_redeem")
	RecordLog(destUserId, LogTypeTopup, fmt.Sprintf("通过账户 Key 兑换转入 %s，来源用户 %d", logger.LogQuota(quota), sourceUserId))
	RecordLog(sourceUserId, LogTypeTopup, fmt.Sprintf("账户余额 %s 已被兑换并停用，目标用户 %d", logger.LogQuota(quota), destUserId))
	return quota, nil
}
