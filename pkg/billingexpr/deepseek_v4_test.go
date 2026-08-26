package billingexpr_test

import (
	"math"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/QuantumNous/new-api/setting/billing_setting"
)

// Official DeepSeek V4 CNY 1:1 expressions. Peak windows are Beijing
// 09:00-12:00 and 14:00-18:00 (UTC 01:00-04:00 and 06:00-10:00).
const (
	deepseekV4FlashExpr = `(tier("off_peak", p * 1.5 + c * 4.5 + cr * 0.05)) * (hour("Asia/Shanghai") >= 9 && hour("Asia/Shanghai") < 12 ? 2 : 1) * (hour("Asia/Shanghai") >= 14 && hour("Asia/Shanghai") < 18 ? 2 : 1)`
	deepseekV4ProExpr   = `(tier("off_peak", p * 4.5 + c * 13.5 + cr * 0.15)) * (hour("Asia/Shanghai") >= 9 && hour("Asia/Shanghai") < 12 ? 2 : 1) * (hour("Asia/Shanghai") >= 14 && hour("Asia/Shanghai") < 18 ? 2 : 1)`
)

func deepseekV4PeakMultiplier() float64 {
	loc, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		tNow := time.Now().UTC()
		h := tNow.Hour()
		if (h >= 1 && h < 4) || (h >= 6 && h < 10) {
			return 2
		}
		return 1
	}
	h := time.Now().In(loc).Hour()
	if (h >= 9 && h < 12) || (h >= 14 && h < 18) {
		return 2
	}
	return 1
}

func TestDeepSeekV4Flash_PeakOffPeak(t *testing.T) {
	params := billingexpr.TokenParams{P: 1000, C: 200, CR: 100}
	cost, trace, err := billingexpr.RunExpr(deepseekV4FlashExpr, params)
	if err != nil {
		t.Fatal(err)
	}
	base := 1000*1.5 + 200*4.5 + 100*0.05
	want := base * deepseekV4PeakMultiplier()
	if math.Abs(cost-want) > 1e-6 {
		t.Errorf("cost = %f, want %f", cost, want)
	}
	if trace.MatchedTier != "off_peak" {
		t.Errorf("tier = %q, want off_peak", trace.MatchedTier)
	}
	if err := billing_setting.SmokeTestExpr(deepseekV4FlashExpr); err != nil {
		t.Fatal(err)
	}
}

func TestDeepSeekV4Pro_PeakOffPeak(t *testing.T) {
	params := billingexpr.TokenParams{P: 1000, C: 200, CR: 100}
	cost, trace, err := billingexpr.RunExpr(deepseekV4ProExpr, params)
	if err != nil {
		t.Fatal(err)
	}
	base := 1000*4.5 + 200*13.5 + 100*0.15
	want := base * deepseekV4PeakMultiplier()
	if math.Abs(cost-want) > 1e-6 {
		t.Errorf("cost = %f, want %f", cost, want)
	}
	if trace.MatchedTier != "off_peak" {
		t.Errorf("tier = %q, want off_peak", trace.MatchedTier)
	}
	if err := billing_setting.SmokeTestExpr(deepseekV4ProExpr); err != nil {
		t.Fatal(err)
	}
}

func TestDeepSeekV4_PeakWindowsAreDouble(t *testing.T) {
	mult := deepseekV4PeakMultiplier()
	if mult != 1 && mult != 2 {
		t.Fatalf("unexpected multiplier %v", mult)
	}
	cost, _, err := billingexpr.RunExpr(deepseekV4FlashExpr, billingexpr.TokenParams{P: 1e6})
	if err != nil {
		t.Fatal(err)
	}
	// 1M uncached input tokens: 1.5 off-peak / 3.0 peak
	want := 1.5e6 * mult
	if math.Abs(cost-want) > 1e-3 {
		t.Errorf("1M flash input cost = %f, want %f", cost, want)
	}
}
