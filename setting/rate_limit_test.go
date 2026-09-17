package setting

import "testing"

func TestResolveGroupRateLimit(t *testing.T) {
	prevGroup := ModelRequestRateLimitGroup
	prevAuto := AutoGroups2JsonString()
	defer func() {
		ModelRequestRateLimitGroup = prevGroup
		_ = UpdateAutoGroupsByJsonString(prevAuto)
	}()

	ModelRequestRateLimitGroup = map[string][2]int{
		"vip":     {10, 5},
		"default": {100, 50},
		"pro":     {20, 8},
	}
	if err := UpdateAutoGroupsByJsonString(`["default","vip"]`); err != nil {
		t.Fatal(err)
	}

	total, success, found := ResolveGroupRateLimit("vip,default", "default")
	if !found || total != 10 || success != 5 {
		t.Fatalf("comma groups pick strictest: total=%d success=%d found=%v", total, success, found)
	}

	total, success, found = ResolveGroupRateLimit("auto", "pro")
	if !found || total != 10 || success != 5 {
		t.Fatalf("auto expands to auto groups + user group: total=%d success=%d found=%v", total, success, found)
	}

	total, success, found = ResolveGroupRateLimit("", "pro")
	if !found || total != 20 || success != 8 {
		t.Fatalf("empty token group falls back to user group: total=%d success=%d found=%v", total, success, found)
	}

	total, success, found = ResolveGroupRateLimit("missing", "also-missing")
	if found {
		t.Fatalf("missing groups should not be found, got total=%d success=%d", total, success)
	}
}
