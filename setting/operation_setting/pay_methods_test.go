package operation_setting

import "testing"

func TestIsEpayPayMethodType(t *testing.T) {
	t.Parallel()
	if !IsEpayPayMethodType("alipay") {
		t.Fatal("Epay alipay must stay an Epay processor id")
	}
	if !IsEpayPayMethodType("wxpay") {
		t.Fatal("Epay wxpay must stay an Epay processor id")
	}
	if !IsEpayPayMethodType("custom1") {
		t.Fatal("custom Epay types must stay Epay processor ids")
	}
	for _, methodType := range []string{"stripe", "waffo", "waffo_pancake", "creem", "wechatpay", "alipay_direct", ""} {
		if IsEpayPayMethodType(methodType) {
			t.Fatalf("%s must not be treated as Epay", methodType)
		}
	}
}
