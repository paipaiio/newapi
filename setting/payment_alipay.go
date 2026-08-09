package setting

// AlipayEnabled 是否启用支付宝官方支付
var AlipayEnabled = false

// AlipayAppId 支付宝应用 ID（APPID）
var AlipayAppId = ""

// AlipayPrivateKey 应用私钥（RSA2，PKCS1 或 PKCS8 PEM 内容）
var AlipayPrivateKey = ""

// AlipayPublicKey 支付宝公钥（用于验签）
var AlipayPublicKey = ""

// AlipaySandbox 是否使用沙箱环境
var AlipaySandbox = false

// AlipayUnitPrice 人民币单价（每 X 元兑换 1 USD 额度）
var AlipayUnitPrice = 7.0

// AlipayMinTopUp 最低充值金额（人民币元）
var AlipayMinTopUp = 1.0
