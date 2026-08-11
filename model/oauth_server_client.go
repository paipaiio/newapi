package model

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"sync"

	"github.com/QuantumNous/new-api/common"
	"golang.org/x/crypto/bcrypt"
)

// OAuthClient 注册到本系统的第三方应用（依赖方/RP）。
// 本系统作为 OpenID Connect Provider，第三方用这里分配的 client_id / client_secret
// 接入「使用 TUFTech 登录」。
type OAuthClient struct {
	Id               int    `json:"id" gorm:"primaryKey;autoIncrement"`
	ClientId         string `json:"client_id" gorm:"type:varchar(64);uniqueIndex;not null"`
	ClientSecretHash string `json:"-" gorm:"type:varchar(128)"`                                     // bcrypt 哈希；public 客户端为空
	Name             string `json:"name" gorm:"type:varchar(128);not null"`                         // 展示名（同意页/管理页）
	Logo             string `json:"logo" gorm:"type:varchar(512)"`                                  // 图标 URL（可空）
	RedirectUris     string `json:"redirect_uris" gorm:"type:text"`                                 // 回调地址，换行分隔，精确匹配
	Scopes           string `json:"scopes" gorm:"type:varchar(512);default:'openid profile email'"` // 允许的 scope，空格分隔
	IsPublic         bool   `json:"is_public" gorm:"type:tinyint(1);default:0"`                     // public 客户端：无 secret，强制 PKCE
	AutoApprove      bool   `json:"auto_approve" gorm:"type:tinyint(1);default:0"`                  // 受信任应用：跳过用户同意页
	Enabled          bool   `json:"enabled" gorm:"type:tinyint(1);default:1;index"`
	CreatedAt        int64  `json:"created_at" gorm:"bigint"`
	UpdatedAt        int64  `json:"updated_at" gorm:"bigint"`
}

func (OAuthClient) TableName() string {
	return "oauth_clients"
}

// splitFields 按换行/空白拆分多值字段，去空去重保序。
func splitFields(s string) []string {
	raw := strings.FieldsFunc(s, func(r rune) bool {
		return r == '\n' || r == '\r' || r == ' ' || r == '\t' || r == ','
	})
	seen := make(map[string]struct{}, len(raw))
	out := make([]string, 0, len(raw))
	for _, v := range raw {
		v = strings.TrimSpace(v)
		if v == "" {
			continue
		}
		if _, ok := seen[v]; ok {
			continue
		}
		seen[v] = struct{}{}
		out = append(out, v)
	}
	return out
}

func (c *OAuthClient) RedirectUriList() []string { return splitFields(c.RedirectUris) }
func (c *OAuthClient) ScopeList() []string       { return splitFields(c.Scopes) }

// IsRedirectAllowed 精确匹配回调地址（OAuth2 安全要求，不做前缀/通配匹配）。
func (c *OAuthClient) IsRedirectAllowed(uri string) bool {
	for _, u := range c.RedirectUriList() {
		if u == uri {
			return true
		}
	}
	return false
}

// AreScopesAllowed 判断请求的 scope 是否都在允许集合内。
func (c *OAuthClient) AreScopesAllowed(requested []string) bool {
	allowed := make(map[string]struct{})
	for _, s := range c.ScopeList() {
		allowed[s] = struct{}{}
	}
	for _, s := range requested {
		if _, ok := allowed[s]; !ok {
			return false
		}
	}
	return true
}

// SetSecret 用 bcrypt 存储客户端密钥（仅创建/轮换时调用，明文只返回一次）。
func (c *OAuthClient) SetSecret(plain string) error {
	h, err := bcrypt.GenerateFromPassword([]byte(plain), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	c.ClientSecretHash = string(h)
	return nil
}

// VerifySecret 校验明文密钥；public 客户端（无 secret）恒为 false。
func (c *OAuthClient) VerifySecret(plain string) bool {
	if c.ClientSecretHash == "" {
		return false
	}
	return bcrypt.CompareHashAndPassword([]byte(c.ClientSecretHash), []byte(plain)) == nil
}

// 内存缓存：仅缓存「已启用」客户端，按 client_id 索引，供 authorize/token 高频读取。
var (
	oauthClientMu    sync.RWMutex
	oauthClientCache map[string]*OAuthClient
	oauthClientInit  bool
)

// InitOAuthClientCache 从数据库加载全部已启用客户端到内存。
func InitOAuthClientCache() error {
	var rows []OAuthClient
	if err := DB.Where("enabled = ?", true).Find(&rows).Error; err != nil {
		return err
	}
	m := make(map[string]*OAuthClient, len(rows))
	for i := range rows {
		c := rows[i]
		m[c.ClientId] = &c
	}
	oauthClientMu.Lock()
	oauthClientCache = m
	oauthClientInit = true
	oauthClientMu.Unlock()
	return nil
}

func ensureOAuthClientCache() {
	oauthClientMu.RLock()
	ok := oauthClientInit
	oauthClientMu.RUnlock()
	if !ok {
		_ = InitOAuthClientCache()
	}
}

// GetEnabledOAuthClient 按 client_id 返回已启用客户端（缓存），不存在返回 nil。
func GetEnabledOAuthClient(clientId string) *OAuthClient {
	ensureOAuthClientCache()
	oauthClientMu.RLock()
	defer oauthClientMu.RUnlock()
	if c, ok := oauthClientCache[clientId]; ok {
		cp := *c
		return &cp
	}
	return nil
}

// GetAllOAuthClients 返回全部客户端（含禁用），管理端用，直查 DB。
func GetAllOAuthClients() ([]OAuthClient, error) {
	var rows []OAuthClient
	err := DB.Order("id asc").Find(&rows).Error
	return rows, err
}

func GetOAuthClientById(id int) (*OAuthClient, error) {
	var c OAuthClient
	err := DB.First(&c, id).Error
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func CreateOAuthClient(c *OAuthClient) error {
	now := common.GetTimestamp()
	c.CreatedAt = now
	c.UpdatedAt = now
	if err := DB.Create(c).Error; err != nil {
		return err
	}
	return InitOAuthClientCache()
}

// UpdateOAuthClient 更新可编辑字段（不含 client_id / secret），用 Select 避免 bool 零值被忽略。
func UpdateOAuthClient(c *OAuthClient) error {
	c.UpdatedAt = common.GetTimestamp()
	if err := DB.Model(&OAuthClient{}).Where("id = ?", c.Id).
		Select("name", "logo", "redirect_uris", "scopes",
			"is_public", "auto_approve", "enabled", "updated_at").
		Updates(c).Error; err != nil {
		return err
	}
	return InitOAuthClientCache()
}

// UpdateOAuthClientSecret 单独写入新的密钥哈希（轮换密钥）。
func UpdateOAuthClientSecret(id int, secretHash string) error {
	if err := DB.Model(&OAuthClient{}).Where("id = ?", id).
		Update("client_secret_hash", secretHash).Error; err != nil {
		return err
	}
	return InitOAuthClientCache()
}

func DeleteOAuthClient(id int) error {
	if err := DB.Delete(&OAuthClient{}, id).Error; err != nil {
		return err
	}
	return InitOAuthClientCache()
}

// oauthHashToken 对授权码/令牌做 SHA-256（十六进制）以便建唯一索引并按值查找。
// 这些值本身是高熵随机串，SHA-256 足够且可索引（区别于 client_secret 用 bcrypt）。
func oauthHashToken(s string) string {
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:])
}
