// Package oauthprovider implements the signing/JWKS side of new-api acting as an
// OpenID Connect Provider (identity provider). It owns the RS256 key used to sign
// id_tokens and the JWKS published to relying parties.
package oauthprovider

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/binary"
	"encoding/pem"
	"errors"
	"strings"
	"sync"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/system_setting"

	"github.com/golang-jwt/jwt/v5"
)

var (
	mu         sync.RWMutex
	privateKey *rsa.PrivateKey
	keyID      string
)

// InitSigningKey 加载（或首次生成并持久化）id_token 签名用的 RSA 私钥。
// 应在 model.InitDB + model.InitOptionMap 之后、主节点上调用一次。
func InitSigningKey() error {
	s := system_setting.GetOAuthServerSettings()
	pemStr := strings.TrimSpace(s.PrivateKeyPEM)
	kid := strings.TrimSpace(s.KeyID)

	if pemStr == "" {
		key, err := rsa.GenerateKey(rand.Reader, 2048)
		if err != nil {
			return err
		}
		der := x509.MarshalPKCS1PrivateKey(key)
		pemBytes := pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: der})
		pemStr = string(pemBytes)
		kid = common.GetUUID()[:16]
		// 持久化（同时经 handleConfigUpdate 写回内存配置结构）。
		if err := model.UpdateOption("oauth_server.private_key_pem", pemStr); err != nil {
			return err
		}
		if err := model.UpdateOption("oauth_server.key_id", kid); err != nil {
			return err
		}
		common.SysLog("oauth provider: generated new RS256 signing key")
	}

	block, _ := pem.Decode([]byte(pemStr))
	if block == nil {
		return errors.New("oauth provider: invalid signing key PEM")
	}
	priv, err := x509.ParsePKCS1PrivateKey(block.Bytes)
	if err != nil {
		return err
	}
	if kid == "" {
		kid = common.GetUUID()[:16]
		_ = model.UpdateOption("oauth_server.key_id", kid)
	}

	mu.Lock()
	privateKey = priv
	keyID = kid
	mu.Unlock()
	return nil
}

// KeyID 返回当前签名密钥的 kid。
func KeyID() string {
	mu.RLock()
	defer mu.RUnlock()
	return keyID
}

func currentKey() (*rsa.PrivateKey, string, error) {
	mu.RLock()
	k, id := privateKey, keyID
	mu.RUnlock()
	if k == nil {
		// 惰性初始化兜底（正常路径已在启动时初始化）。
		if err := InitSigningKey(); err != nil {
			return nil, "", err
		}
		mu.RLock()
		k, id = privateKey, keyID
		mu.RUnlock()
	}
	if k == nil {
		return nil, "", errors.New("oauth provider: signing key not initialized")
	}
	return k, id, nil
}

// SignIDToken 用 RS256 对给定 claims 签发 id_token，header 带 kid。
func SignIDToken(claims jwt.MapClaims) (string, error) {
	key, kid, err := currentKey()
	if err != nil {
		return "", err
	}
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	token.Header["kid"] = kid
	return token.SignedString(key)
}

// JWK 是 JWKS 中的一条公钥记录。
type JWK struct {
	Kty string `json:"kty"`
	Use string `json:"use"`
	Alg string `json:"alg"`
	Kid string `json:"kid"`
	N   string `json:"n"`
	E   string `json:"e"`
}

// JWKS 返回当前签名公钥的 JWKS（供 RP 验证 id_token 签名）。
func JWKS() (map[string]interface{}, error) {
	key, kid, err := currentKey()
	if err != nil {
		return nil, err
	}
	pub := key.Public().(*rsa.PublicKey)

	eBytes := make([]byte, 8)
	binary.BigEndian.PutUint64(eBytes, uint64(pub.E))
	// 去掉前导零字节（指数最小化编码）。
	i := 0
	for i < len(eBytes)-1 && eBytes[i] == 0 {
		i++
	}
	jwk := JWK{
		Kty: "RSA",
		Use: "sig",
		Alg: "RS256",
		Kid: kid,
		N:   base64.RawURLEncoding.EncodeToString(pub.N.Bytes()),
		E:   base64.RawURLEncoding.EncodeToString(eBytes[i:]),
	}
	return map[string]interface{}{"keys": []JWK{jwk}}, nil
}
