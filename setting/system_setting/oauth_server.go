package system_setting

import (
	"strings"

	"github.com/QuantumNous/new-api/setting/config"
)

// OAuthServerSettings 配置本系统作为 OpenID Connect Provider（身份提供方）的运行参数。
// 通过 config 框架以 oauth_server.<json> 形式分字段持久化到 options 表，热加载。
type OAuthServerSettings struct {
	Enabled                   bool   `json:"enabled"`                       // 总开关，关闭时所有 /oauth2 端点返回未启用
	Issuer                    string `json:"issuer"`                        // 签发者 URL（iss + 各端点基地址），空则回退 ServerAddress
	PrivateKeyPEM             string `json:"private_key_pem"`               // RS256 私钥（PKCS1 PEM），首次启动自动生成
	KeyID                     string `json:"key_id"`                        // JWK kid，随私钥一起生成
	ConsentSkipForAutoApprove bool   `json:"consent_skip_for_auto_approve"` // auto_approve 客户端是否跳过同意页
}

// 默认配置：同意页跳过开关默认开启（受信任应用免同意）。
var defaultOAuthServerSettings = OAuthServerSettings{
	ConsentSkipForAutoApprove: true,
}

func init() {
	config.GlobalConfig.Register("oauth_server", &defaultOAuthServerSettings)
}

func GetOAuthServerSettings() *OAuthServerSettings {
	return &defaultOAuthServerSettings
}

// GetOAuthIssuer 返回签发者基地址（去掉末尾斜杠）；未配置时回退到 ServerAddress。
func GetOAuthIssuer() string {
	s := strings.TrimSpace(defaultOAuthServerSettings.Issuer)
	if s == "" {
		s = strings.TrimSpace(ServerAddress)
	}
	return strings.TrimRight(s, "/")
}
