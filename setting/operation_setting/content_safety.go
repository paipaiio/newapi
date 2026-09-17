package operation_setting

import (
	"strings"

	"github.com/QuantumNous/new-api/setting/config"
)

const (
	ContentSafetyModeOff      = "off"
	ContentSafetyModeAsync    = "async"
	ContentSafetyModeBlocking = "blocking"

	ContentSafetyPolicyStandard   = "standard"
	ContentSafetyPolicyUncensored = "uncensored"
)

// ContentSafetySetting is the gateway-side prompt/output review policy.
// All switches default off so an upgrade is a no-op until an admin enables it.
type ContentSafetySetting struct {
	Enabled bool `json:"enabled"`

	// StandardMode / UncensoredMode: off | async | blocking
	StandardMode   string `json:"standard_mode"`
	UncensoredMode string `json:"uncensored_mode"`

	// Newline-separated model/group matchers. Supports * ? globs or substrings.
	UncensoredModels string `json:"uncensored_models"`
	UncensoredGroups string `json:"uncensored_groups"`

	JailbreakScanEnabled bool `json:"jailbreak_scan_enabled"`

	// Extra hard-block keywords (one per line), always enforced when enabled.
	RedlineWords string `json:"redline_words"`

	GuardEnabled   bool   `json:"guard_enabled"`
	GuardBaseURL   string `json:"guard_base_url"`
	GuardAPIKey    string `json:"guard_api_key"`
	GuardModel     string `json:"guard_model"`
	GuardTimeoutMs int    `json:"guard_timeout_ms"`
	GuardFailOpen  bool   `json:"guard_fail_open"`

	ScanOutput bool `json:"scan_output"`

	// AutoDisableUser disables the calling user after a hard-block finding.
	AutoDisableUser bool `json:"auto_disable_user"`
}

var contentSafetySetting = ContentSafetySetting{
	Enabled:              false,
	StandardMode:         ContentSafetyModeAsync,
	UncensoredMode:       ContentSafetyModeAsync,
	UncensoredModels:     "*uncensored*\n*abliterated*\n*unfiltered*\n*nsfw*",
	UncensoredGroups:     "",
	JailbreakScanEnabled: true,
	RedlineWords:         "",
	GuardEnabled:         false,
	GuardBaseURL:         "",
	GuardAPIKey:          "",
	GuardModel:           "qwen3guard",
	GuardTimeoutMs:       800,
	GuardFailOpen:        true,
	ScanOutput:           true,
	AutoDisableUser:      false,
}

func init() {
	config.GlobalConfig.Register("content_safety", &contentSafetySetting)
}

func GetContentSafetySetting() *ContentSafetySetting {
	return &contentSafetySetting
}

func IsContentSafetyEnabled() bool {
	return contentSafetySetting.Enabled
}

func ShouldCaptureResponseText() bool {
	if IsSessionLoggingEnabled() {
		return true
	}
	s := &contentSafetySetting
	return s.Enabled && s.ScanOutput
}

func NormalizeContentSafetyMode(mode string) string {
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case ContentSafetyModeBlocking:
		return ContentSafetyModeBlocking
	case ContentSafetyModeOff:
		return ContentSafetyModeOff
	default:
		return ContentSafetyModeAsync
	}
}
