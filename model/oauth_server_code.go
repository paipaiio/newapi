package model

import (
	"errors"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

// OAuthAuthorizationCode 把「待同意的授权请求」与「已签发的授权码」放在同一条生命周期记录里。
// authorize 端点创建 pending 记录并把 request_id 交给同意页；用户同意后写入 code 并置为 approved；
// token 端点用 code 兑换令牌后置为 used。code 只用一次、短时有效。
type OAuthAuthorizationCode struct {
	Id                  int    `json:"id" gorm:"primaryKey;autoIncrement"`
	RequestId           string `json:"request_id" gorm:"type:varchar(64);uniqueIndex;not null"`
	CodeHash            string `json:"-" gorm:"type:varchar(64);index"` // sha256(code)，同意后写入
	ClientId            string `json:"client_id" gorm:"type:varchar(64);index"`
	UserId              int    `json:"user_id" gorm:"index"`
	RedirectUri         string `json:"redirect_uri" gorm:"type:varchar(512)"`
	Scope               string `json:"scope" gorm:"type:varchar(512)"`
	Nonce               string `json:"nonce" gorm:"type:varchar(255)"`
	State               string `json:"state" gorm:"type:varchar(512)"`
	CodeChallenge       string `json:"code_challenge" gorm:"type:varchar(255)"`
	CodeChallengeMethod string `json:"code_challenge_method" gorm:"type:varchar(16)"`
	Status              string `json:"status" gorm:"type:varchar(16);index"` // pending | approved | used
	ExpiresAt           int64  `json:"expires_at" gorm:"index"`
	CreatedAt           int64  `json:"created_at" gorm:"bigint"`
}

func (OAuthAuthorizationCode) TableName() string {
	return "oauth_authorization_codes"
}

const (
	OAuthCodeStatusPending  = "pending"
	OAuthCodeStatusApproved = "approved"
	OAuthCodeStatusUsed     = "used"

	// 授权请求/码有效期（秒）。
	OAuthCodeTTLSeconds = 600
)

// CreateOAuthAuthRequest 创建待同意的授权请求，返回 request_id。
func CreateOAuthAuthRequest(req *OAuthAuthorizationCode) error {
	now := common.GetTimestamp()
	req.CreatedAt = now
	req.ExpiresAt = now + OAuthCodeTTLSeconds
	req.Status = OAuthCodeStatusPending
	return DB.Create(req).Error
}

// GetOAuthAuthRequestByRequestId 取未过期的授权请求（任意状态，供同意页展示与决策）。
func GetOAuthAuthRequestByRequestId(requestId string) (*OAuthAuthorizationCode, error) {
	var r OAuthAuthorizationCode
	err := DB.Where("request_id = ?", requestId).First(&r).Error
	if err != nil {
		return nil, err
	}
	return &r, nil
}

// ApproveOAuthAuthRequest 把 pending 请求标记为 approved 并写入新生成的授权码哈希。
// 返回明文授权码（只在此刻可得）。要求请求未过期且仍为 pending，避免重复签发。
func ApproveOAuthAuthRequest(requestId string, userId int) (string, error) {
	code, err := common.GenerateKey()
	if err != nil {
		return "", err
	}
	codeHash := oauthHashToken(code)
	now := common.GetTimestamp()
	res := DB.Model(&OAuthAuthorizationCode{}).
		Where("request_id = ? AND user_id = ? AND status = ? AND expires_at > ?",
			requestId, userId, OAuthCodeStatusPending, now).
		Updates(map[string]interface{}{
			"code_hash": codeHash,
			"status":    OAuthCodeStatusApproved,
		})
	if res.Error != nil {
		return "", res.Error
	}
	if res.RowsAffected == 0 {
		return "", errors.New("authorization request not found or already handled")
	}
	return code, nil
}

// ConsumeOAuthCode 用明文授权码换取记录并原子置为 used（防重放）。
// 校验：approved 状态、未过期、client_id 与 redirect_uri 匹配。
func ConsumeOAuthCode(code, clientId, redirectUri string) (*OAuthAuthorizationCode, error) {
	codeHash := oauthHashToken(code)
	now := common.GetTimestamp()
	var rec OAuthAuthorizationCode
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("code_hash = ?", codeHash).First(&rec).Error; err != nil {
			return err
		}
		if rec.Status != OAuthCodeStatusApproved {
			return errors.New("authorization code already used or invalid")
		}
		if rec.ExpiresAt <= now {
			return errors.New("authorization code expired")
		}
		if rec.ClientId != clientId {
			return errors.New("authorization code was issued to a different client")
		}
		if rec.RedirectUri != redirectUri {
			return errors.New("redirect_uri mismatch")
		}
		res := tx.Model(&OAuthAuthorizationCode{}).
			Where("id = ? AND status = ?", rec.Id, OAuthCodeStatusApproved).
			Update("status", OAuthCodeStatusUsed)
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return errors.New("authorization code already used")
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &rec, nil
}

// CleanupExpiredOAuthCodes 删除过期的授权请求/码（含已用），由定期任务调用。
func CleanupExpiredOAuthCodes() error {
	now := common.GetTimestamp()
	return DB.Where("expires_at < ? OR status = ?", now, OAuthCodeStatusUsed).
		Delete(&OAuthAuthorizationCode{}).Error
}
