package constant

import (
	"fmt"
	"os"
	"strings"
)

const (
	SiteModeNormal     = "normal"
	SiteModeCompliance = "compliance"
)

var (
	SiteMode      = SiteModeNormal
	SitePublicURL string
)

func InitSiteMode() error {
	mode := strings.ToLower(strings.TrimSpace(os.Getenv("SITE_MODE")))
	if mode == "" {
		mode = SiteModeNormal
	}
	if mode != SiteModeNormal && mode != SiteModeCompliance {
		return fmt.Errorf("SITE_MODE must be %q or %q", SiteModeNormal, SiteModeCompliance)
	}
	SiteMode = mode
	SitePublicURL = strings.TrimRight(strings.TrimSpace(os.Getenv("SITE_PUBLIC_URL")), "/")
	return nil
}

func IsComplianceSite() bool {
	return SiteMode == SiteModeCompliance
}
