package common

import (
	"bytes"
	"io"
	"io/fs"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gin-contrib/static"
)

const originAssetReplacement = "/"

// originAssetBootstrap rewrites webpack async-chunk URLs at runtime when the
// bundle still has a CDN publicPath. Idempotent with the nginx inject.
const originAssetBootstrap = `<script data-origin-assets="1">!function(){if(window.__TUFTECH_ORIGIN_ASSETS__)return;window.__TUFTECH_ORIGIN_ASSETS__=1;var C="https://static.paipaiio.com/";function r(u){return"string"==typeof u&&0===u.indexOf(C)?"/"+u.slice(C.length):u}function p(e,t){var n=Object.getOwnPropertyDescriptor(e,t);n&&n.set&&Object.defineProperty(e,t,{configurable:!0,enumerable:n.enumerable,get:n.get,set:function(e){n.set.call(this,r(e))}})}p(HTMLScriptElement.prototype,"src");p(HTMLLinkElement.prototype,"href");}();</script>`

// RewriteCDNHostToOrigin rewrites baked Bitiful CDN URLs to same-origin paths.
// https://static.paipaiio.com/avHASH/foo.js → /avHASH/foo.js
func RewriteCDNHostToOrigin(content []byte) []byte {
	if !bytes.Contains(content, []byte(assetCDNHost)) {
		return content
	}
	return bytes.ReplaceAll(content, []byte(assetCDNHost), []byte(originAssetReplacement))
}

// RewriteIndexAssetsForOrigin rewrites baked CDN URLs in index.html to same-origin
// /avHASH/ paths and injects a runtime publicPath lock for async chunks.
func RewriteIndexAssetsForOrigin(html []byte) []byte {
	html = RewriteCDNHostToOrigin(html)
	if bytes.Contains(html, []byte(`data-origin-assets="1"`)) {
		return html
	}
	return bytes.Replace(html, []byte("<head>"), []byte("<head>"+originAssetBootstrap), 1)
}

// NewOriginAssetFS wraps a frontend filesystem so JS/CSS publicPath strings
// also point at origin. HTML rewrite alone is not enough: webpack's
// __webpack_require__.p stays on the CDN and async chunks 404 against the
// main-site origin (same /avHASH/ namespace, different compile).
func NewOriginAssetFS(inner static.ServeFileSystem) static.ServeFileSystem {
	return &originAssetFS{inner: inner}
}

type originAssetFS struct {
	inner static.ServeFileSystem
	cache sync.Map // string → []byte (rewritten) | originAssetSkip
}

type originAssetSkip struct{}

func (o *originAssetFS) Exists(prefix string, path string) bool {
	return o.inner.Exists(prefix, path)
}

func (o *originAssetFS) Open(name string) (http.File, error) {
	if cached, ok := o.cache.Load(name); ok {
		if data, isBytes := cached.([]byte); isBytes {
			return newBytesFile(data, staticFileInfo{
				name: name,
				size: int64(len(data)),
				mode: 0444,
			}), nil
		}
	}
	file, err := o.inner.Open(name)
	if err != nil {
		return nil, err
	}
	if !originAssetNeedsRewrite(name) {
		return file, nil
	}
	if cached, ok := o.cache.Load(name); ok {
		if _, isSkip := cached.(originAssetSkip); isSkip {
			return file, nil
		}
	}
	info, err := file.Stat()
	if err != nil {
		_ = file.Close()
		return nil, err
	}
	if info.IsDir() {
		return file, nil
	}
	data, err := io.ReadAll(file)
	_ = file.Close()
	if err != nil {
		return nil, err
	}
	rewritten := RewriteCDNHostToOrigin(data)
	if bytes.Equal(rewritten, data) {
		o.cache.Store(name, originAssetSkip{})
		return o.inner.Open(name)
	}
	o.cache.Store(name, rewritten)
	return newBytesFile(rewritten, withSize(info, int64(len(rewritten)))), nil
}

func originAssetNeedsRewrite(name string) bool {
	n := strings.ToLower(name)
	return strings.HasSuffix(n, ".js") ||
		strings.HasSuffix(n, ".css") ||
		strings.HasSuffix(n, ".html") ||
		strings.HasSuffix(n, ".json") ||
		strings.HasSuffix(n, ".map")
}

func withSize(info os.FileInfo, size int64) os.FileInfo {
	if info == nil {
		return staticFileInfo{size: size, modTime: time.Now()}
	}
	return staticFileInfo{
		name:    info.Name(),
		size:    size,
		mode:    info.Mode(),
		modTime: info.ModTime(),
	}
}

type staticFileInfo struct {
	name    string
	size    int64
	mode    fs.FileMode
	modTime time.Time
}

func (s staticFileInfo) Name() string       { return s.name }
func (s staticFileInfo) Size() int64        { return s.size }
func (s staticFileInfo) Mode() fs.FileMode  { return s.mode }
func (s staticFileInfo) ModTime() time.Time { return s.modTime }
func (s staticFileInfo) IsDir() bool        { return false }
func (s staticFileInfo) Sys() any           { return nil }

type bytesFile struct {
	*bytes.Reader
	info os.FileInfo
}

func newBytesFile(data []byte, info os.FileInfo) http.File {
	return &bytesFile{Reader: bytes.NewReader(data), info: info}
}

func (f *bytesFile) Close() error { return nil }

func (f *bytesFile) Readdir(int) ([]os.FileInfo, error) {
	return nil, io.EOF
}

func (f *bytesFile) Stat() (os.FileInfo, error) {
	return f.info, nil
}
