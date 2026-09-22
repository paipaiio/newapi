package common

import (
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
)

const (
	assetCDNHost          = "https://static.paipaiio.com/"
	defaultChinaIngressIP = "179.253.232.226,154.94.236.224"
)

var (
	chinaNetsOnce sync.Once
	chinaNets     []*net.IPNet
	ingressOnce   sync.Once
	ingressIPs    map[string]struct{}
)

func loadChinaNets() {
	chinaNetsOnce.Do(func() {
		all := make([]string, 0, len(chinaIPv4CIDRs)+len(chinaIPv6CIDRs))
		all = append(all, chinaIPv4CIDRs...)
		all = append(all, chinaIPv6CIDRs...)
		chinaNets = make([]*net.IPNet, 0, len(all))
		for _, cidr := range all {
			_, network, err := net.ParseCIDR(cidr)
			if err != nil {
				continue
			}
			chinaNets = append(chinaNets, network)
		}
	})
}

func loadIngressIPs() {
	ingressOnce.Do(func() {
		raw := strings.TrimSpace(os.Getenv("CHINA_INGRESS_IPS"))
		if raw == "" {
			raw = defaultChinaIngressIP
		}
		ingressIPs = make(map[string]struct{})
		for _, part := range strings.Split(raw, ",") {
			ip := net.ParseIP(strings.TrimSpace(part))
			if ip == nil {
				continue
			}
			ingressIPs[ip.String()] = struct{}{}
		}
	})
}

// ForceOriginAssetRoute reports whether this process should never emit
// Bitiful CDN URLs in index.html. ASSET_ROUTE=origin always wins;
// ASSET_ROUTE=cdn restores geo routing.
func ForceOriginAssetRoute() bool {
	return strings.EqualFold(strings.TrimSpace(os.Getenv("ASSET_ROUTE")), "origin")
}

// IsChinaAssetClient reports whether this request should keep CDN asset URLs.
// Mainland China addresses use Bitiful. The DMIT optimized ingress
// (179.253.232.226 by default) is treated as China even if GeoIP says otherwise.
func IsChinaAssetClient(r *http.Request, clientIP string) bool {
	if ForceOriginAssetRoute() {
		return false
	}
	loadIngressIPs()
	ip := net.ParseIP(strings.TrimSpace(clientIP))
	if ip != nil {
		if _, ok := ingressIPs[ip.String()]; ok {
			return true
		}
	}
	if country := strings.ToUpper(strings.TrimSpace(r.Header.Get("CF-IPCountry"))); country == "CN" {
		return true
	}
	if ip == nil {
		return false
	}
	loadChinaNets()
	for _, network := range chinaNets {
		if network.Contains(ip) {
			return true
		}
	}
	return false
}

// AssetRequestClientIP prefers nginx X-Real-IP (already unwrapped by
// set_real_ip_from the DMIT optimizer) then gin/ClientIP-equivalent headers.
func AssetRequestClientIP(r *http.Request, fallback string) string {
	if ip := strings.TrimSpace(r.Header.Get("X-Real-IP")); ip != "" {
		if parsed := net.ParseIP(ip); parsed != nil {
			return parsed.String()
		}
	}
	if xff := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); xff != "" {
		first := strings.TrimSpace(strings.Split(xff, ",")[0])
		if parsed := net.ParseIP(first); parsed != nil {
			return parsed.String()
		}
	}
	if host, _, err := net.SplitHostPort(fallback); err == nil {
		fallback = host
	}
	if parsed := net.ParseIP(strings.TrimSpace(fallback)); parsed != nil {
		return parsed.String()
	}
	return strings.TrimSpace(fallback)
}


