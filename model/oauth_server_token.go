package model

import (
	"errors"

	"github.com/QuantumNous/new-api/common"
)

// OAuthToken 本系统作为 OIDC Provider 签发给第三方应用的访问令牌 / 刷新令牌。
// 令牌为不透明随机串，库里只存 SHA-256 哈希，便于按值查找且可吊销。
type OAuthToken struct {
	Id               int    `json:"id" gorm:"primaryKey;autoIncrement"`
	AccessTokenHash  string `json:"-" gorm:"type:varchar(64);uniqueIndex"`
	RefreshTokenHash string `json:"-" gorm:"type:varchar(64);index"` // public 客户端或不签发刷新令牌时为空
	ClientId         string `json:"client_id" gorm:"type:varchar(64);index"`
	UserId           int    `json:"user_id" gorm:"index"`
	Scope            string `json:"scope" gorm:"type:varchar(512)"`
	AccessExpiresAt  int64  `json:"access_expires_at" gorm:"index"`
	RefreshExpiresAt int64  `json:"refresh_expires_at"`
	Revoked          bool   `json:"revoked" gorm:"type:tinyint(1);default:0;index"`
	CreatedAt        int64  `json:"created_at" gorm:"bigint"`
}

func (OAuthToken) TableName() string {
	return "oauth_tokens"
}

const (
	OAuthAccessTokenTTLSeconds  = 3600           // 1 小时
	OAuthRefreshTokenTTLSeconds = 30 * 24 * 3600 // 30 天
)

// CreateOAuthToken 写入一对访问/刷新令牌（传入明文，内部哈希后存储）。
// refreshToken 为空表示不签发刷新令牌。
func CreateOAuthToken(accessToken, refreshToken, clientId string, userId int, scope string) error {
	now := common.GetTimestamp()
	t := OAuthToken{
		AccessTokenHash: oauthHashToken(accessToken),
		ClientId:        clientId,
		UserId:          userId,
		Scope:           scope,
		AccessExpiresAt: now + OAuthAccessTokenTTLSeconds,
		CreatedAt:       now,
	}
	if refreshToken != "" {
		t.RefreshTokenHash = oauthHashToken(refreshToken)
		t.RefreshExpiresAt = now + OAuthRefreshTokenTTLSeconds
	}
	return DB.Create(&t).Error
}

// GetOAuthTokenByAccess 用明文访问令牌取记录，校验未吊销、未过期（userinfo 用）。
func GetOAuthTokenByAccess(accessToken string) (*OAuthToken, error) {
	hash := oauthHashToken(accessToken)
	var t OAuthToken
	if err := DB.Where("access_token_hash = ?", hash).First(&t).Error; err != nil {
		return nil, err
	}
	if t.Revoked {
		return nil, errors.New("token revoked")
	}
	if t.AccessExpiresAt <= common.GetTimestamp() {
		return nil, errors.New("token expired")
	}
	return &t, nil
}

// GetOAuthTokenByRefresh 用明文刷新令牌取记录，校验未吊销、未过期（刷新流程用）。
func GetOAuthTokenByRefresh(refreshToken string) (*OAuthToken, error) {
	hash := oauthHashToken(refreshToken)
	var t OAuthToken
	if err := DB.Where("refresh_token_hash = ?", hash).First(&t).Error; err != nil {
		return nil, err
	}
	if t.Revoked {
		return nil, errors.New("token revoked")
	}
	if t.RefreshExpiresAt <= common.GetTimestamp() {
		return nil, errors.New("refresh token expired")
	}
	return &t, nil
}

// RotateOAuthToken 吊销旧记录并写入新的一对令牌（刷新令牌轮换）。
func RotateOAuthToken(oldId int, accessToken, refreshToken, clientId string, userId int, scope string) error {
	if err := DB.Model(&OAuthToken{}).Where("id = ?", oldId).
		Update("revoked", true).Error; err != nil {
		return err
	}
	return CreateOAuthToken(accessToken, refreshToken, clientId, userId, scope)
}

// CleanupExpiredOAuthTokens 删除访问与刷新均已过期、或已吊销的令牌记录。
func CleanupExpiredOAuthTokens() error {
	now := common.GetTimestamp()
	return DB.Where("(access_expires_at < ? AND (refresh_expires_at = 0 OR refresh_expires_at < ?)) OR revoked = ?",
		now, now, true).Delete(&OAuthToken{}).Error
}
