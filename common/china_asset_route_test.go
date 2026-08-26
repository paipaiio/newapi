package common

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestIsChinaAssetClientRecognizesMainlandAndIngress(t *testing.T) {
	req := &http.Request{Header: http.Header{}}
	assert.True(t, IsChinaAssetClient(req, "1.0.1.1"))
	assert.True(t, IsChinaAssetClient(req, "114.114.114.114"))
	assert.True(t, IsChinaAssetClient(req, "179.253.232.226"))
	assert.True(t, IsChinaAssetClient(req, "154.94.236.224"))
	assert.False(t, IsChinaAssetClient(req, "1.1.1.1"))
	assert.False(t, IsChinaAssetClient(req, "8.8.8.8"))
	assert.False(t, IsChinaAssetClient(req, "152.53.81.85"))
}

func TestIsChinaAssetClientUsesCountryHeader(t *testing.T) {
	req := &http.Request{Header: http.Header{"Cf-Ipcountry": []string{"CN"}}}
	assert.True(t, IsChinaAssetClient(req, "8.8.8.8"))
}

func TestComplianceSiteAlwaysUsesOriginAssets(t *testing.T) {
	t.Setenv("SITE_MODE", "compliance")
	t.Setenv("ASSET_ROUTE", "")
	req := &http.Request{Header: http.Header{"Cf-Ipcountry": []string{"CN"}}}
	assert.True(t, ForceOriginAssetRoute())
	assert.False(t, IsChinaAssetClient(req, "114.114.114.114"))
	assert.False(t, IsChinaAssetClient(req, "179.253.232.226"))
}

func TestAssetRouteOriginOverridesChina(t *testing.T) {
	t.Setenv("SITE_MODE", "")
	t.Setenv("ASSET_ROUTE", "origin")
	req := &http.Request{Header: http.Header{"Cf-Ipcountry": []string{"CN"}}}
	assert.True(t, ForceOriginAssetRoute())
	assert.False(t, IsChinaAssetClient(req, "1.0.1.1"))
}

func TestAssetRouteCDNRestoresGeoOnCompliance(t *testing.T) {
	t.Setenv("SITE_MODE", "compliance")
	t.Setenv("ASSET_ROUTE", "cdn")
	req := &http.Request{Header: http.Header{"Cf-Ipcountry": []string{"CN"}}}
	assert.False(t, ForceOriginAssetRoute())
	assert.True(t, IsChinaAssetClient(req, "8.8.8.8"))
}

func TestAssetRequestClientIPPrefersRealIP(t *testing.T) {
	req := &http.Request{Header: http.Header{
		"X-Real-Ip":         []string{"116.232.117.22"},
		"X-Forwarded-For":   []string{"179.253.232.226"},
	}}
	assert.Equal(t, "116.232.117.22", AssetRequestClientIP(req, "172.18.0.1:1234"))
}

func TestRewriteIndexAssetsForOrigin(t *testing.T) {
	in := []byte(`<script src="https://static.paipaiio.com/av119e9c2d/static/js/index.js">`)
	got := RewriteIndexAssetsForOrigin(in)
	require.Equal(
		t,
		`<script src="/av119e9c2d/static/js/index.js">`,
		string(got),
	)
}
