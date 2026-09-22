package common

import (
	"io"
	"net/http"
	"os"
	"testing"
	"time"

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

func TestAssetRouteOriginOverridesChina(t *testing.T) {
	t.Setenv("SITE_MODE", "")
	t.Setenv("ASSET_ROUTE", "origin")
	req := &http.Request{Header: http.Header{"Cf-Ipcountry": []string{"CN"}}}
	assert.True(t, ForceOriginAssetRoute())
	assert.False(t, IsChinaAssetClient(req, "1.0.1.1"))
}
func TestAssetRequestClientIPPrefersRealIP(t *testing.T) {
	req := &http.Request{Header: http.Header{
		"X-Real-Ip":         []string{"116.232.117.22"},
		"X-Forwarded-For":   []string{"179.253.232.226"},
	}}
	assert.Equal(t, "116.232.117.22", AssetRequestClientIP(req, "172.18.0.1:1234"))
}

func TestRewriteIndexAssetsForOrigin(t *testing.T) {
	in := []byte(`<head><script src="https://static.paipaiio.com/av119e9c2d/static/js/index.js">`)
	got := string(RewriteIndexAssetsForOrigin(in))
	assert.Contains(t, got, `src="/av119e9c2d/static/js/index.js"`)
	assert.Contains(t, got, `data-origin-assets="1"`)
	assert.NotContains(t, got, `src="https://static.paipaiio.com/`)
}

func TestRewriteCDNHostToOriginRewritesWebpackPublicPath(t *testing.T) {
	in := []byte(`c.p="https://static.paipaiio.com/av5d48f643/",c.f.j=function`)
	got := RewriteCDNHostToOrigin(in)
	require.Equal(t, `c.p="/av5d48f643/",c.f.j=function`, string(got))
}

func TestOriginAssetFSRewritesJSPublicPath(t *testing.T) {
	inner := &memServeFS{files: map[string][]byte{
		"/static/js/index.js": []byte(`c.p="https://static.paipaiio.com/av5d48f643/"`),
		"/logo.png":           []byte("https://static.paipaiio.com/keep"),
	}}
	fs := NewOriginAssetFS(inner)

	file, err := fs.Open("/static/js/index.js")
	require.NoError(t, err)
	defer file.Close()
	got, err := io.ReadAll(file)
	require.NoError(t, err)
	assert.Equal(t, `c.p="/av5d48f643/"`, string(got))

	png, err := fs.Open("/logo.png")
	require.NoError(t, err)
	defer png.Close()
	pngBytes, err := io.ReadAll(png)
	require.NoError(t, err)
	assert.Equal(t, "https://static.paipaiio.com/keep", string(pngBytes))
}

type memServeFS struct {
	files map[string][]byte
}

func (m *memServeFS) Exists(_ string, path string) bool {
	_, ok := m.files[path]
	return ok
}

func (m *memServeFS) Open(name string) (http.File, error) {
	data, ok := m.files[name]
	if !ok {
		return nil, os.ErrNotExist
	}
	return newBytesFile(data, staticFileInfo{
		name:    name,
		size:    int64(len(data)),
		mode:    0444,
		modTime: time.Now(),
	}), nil
}
