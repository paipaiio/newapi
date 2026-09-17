package setting

// Waffo Pancake hosted checkout configuration. Gateway is enabled once
// MerchantID + PrivateKey + ProductID are populated (no separate Enabled
// flag, matching Stripe / Creem). StoreID + ProductID are operator-bound
// via SaveWaffoPancakeConfig.
var (
	WaffoPancakeMerchantID string
	WaffoPancakePrivateKey string
	WaffoPancakeReturnURL  string
	WaffoPancakeMinTopUp   int = 1
	WaffoPancakeStoreID    string
	WaffoPancakeProductID  string
	// 收款汇率：1 USD = X CNY。钱包页面展示的人民币金额按此汇率换算成 USD
	// 向买家收款（其它网关如 Epay 仍按各自的人民币价格收款，不受影响）。
	// 0 = 跟随系统 USDExchangeRate。
	WaffoPancakeExchangeRate float64 = 0
	// 收银台支付方式白/黑名单（JSON 字符串数组，如 ["wechat"]），对应 Pancake
	// create-checkout-session 的 includePaymentMethods / excludePaymentMethods。
	// 两者互斥，同时配置时仅白名单生效；留空 = 不限制。
	WaffoPancakeIncludePaymentMethods string
	WaffoPancakeExcludePaymentMethods string
)
