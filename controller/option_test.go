package controller

import "testing"

func TestIsSensitiveOptionKey(t *testing.T) {
	sensitive := []string{
		"WorkerValidKey",
		"SMTPToken",
		"StripeApiSecret",
		"storage_setting.access_key",
		"storage_setting.secret_key",
		"content_safety.guard_api_key",
		"AlipayPrivateKey",
		"SMTPPassword",
	}
	for _, k := range sensitive {
		if !isSensitiveOptionKey(k) {
			t.Fatalf("%s should be treated as sensitive", k)
		}
	}
	public := []string{
		"SystemName",
		"storage_setting.endpoint",
		"storage_setting.key_prefix",
		"fetch_setting.allowed_ports",
		"content_safety.enabled",
	}
	for _, k := range public {
		if isSensitiveOptionKey(k) {
			t.Fatalf("%s should not be treated as sensitive", k)
		}
	}
}
