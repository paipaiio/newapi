package setting

// WechatPayEnabled 是否启用微信支付官方支付
var WechatPayEnabled = false

// WechatPayMchId 微信支付商户号
var WechatPayMchId = ""

// WechatPayAppId 绑定的公众号 / 小程序 / APP 的 AppID（H5 支付可留空）
var WechatPayAppId = ""

// WechatPayApiV3Key APIv3 密钥（32 字节字符串）
var WechatPayApiV3Key = ""

// WechatPaySerialNo 商户 API 证书序列号
var WechatPaySerialNo = ""

// WechatPayPrivateKey 商户 API 私钥（PEM 内容，apiclient_key.pem）
var WechatPayPrivateKey = ""

// WechatPayPublicKey 微信支付平台公钥（PEM 内容，用于公钥模式）
var WechatPayPublicKey = ""

// WechatPayNotifyUrl 回调地址，留空时由系统自动拼接
var WechatPayNotifyUrl = ""

// WechatPayUnitPrice 人民币单价（每 X 元兑换 1 USD 额度）
var WechatPayUnitPrice = 7.0

// WechatPayMinTopUp 最低充值金额（人民币元）
var WechatPayMinTopUp = 1.0
