package setting

// Waffo Pancake hosted checkout configuration. Gateway is enabled once
// MerchantID + PrivateKey + ProductID are populated (no separate Enabled
// flag, matching Stripe / Creem). StoreID + ProductID are operator-bound
// via SaveWaffoPancakeConfig.
var (
	WaffoPancakeMerchantID string
	WaffoPancakePrivateKey string
	WaffoPancakeReturnURL  string
	WaffoPancakeUnitPrice  float64 = 1.0
	WaffoPancakeMinTopUp   int     = 1
	WaffoPancakeStoreID    string
	WaffoPancakeProductID  string
	// 收银台支付方式白/黑名单（JSON 字符串数组，如 ["wechat"]），对应 Pancake
	// create-checkout-session 的 includePaymentMethods / excludePaymentMethods。
	// 两者互斥，同时配置时仅白名单生效；留空 = 不限制。
	WaffoPancakeIncludePaymentMethods string
	WaffoPancakeExcludePaymentMethods string
)
