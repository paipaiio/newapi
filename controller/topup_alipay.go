package controller

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	system_setting "github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
	"github.com/smartwalle/alipay/v3"
)

func getAlipayClient() (*alipay.Client, error) {
	client, err := alipay.New(setting.AlipayAppId, setting.AlipayPrivateKey, !setting.AlipaySandbox)
	if err != nil {
		return nil, err
	}
	if err := client.LoadAliPayPublicKey(setting.AlipayPublicKey); err != nil {
		return nil, err
	}
	return client, nil
}

type AlipayRequest struct {
	Amount int64  `json:"amount"`
	Device string `json:"device"` // "mobile" | "pc"，前端可显式指定；为空时按 User-Agent 判断
}

// isMobileUA 根据 User-Agent 粗判是否为移动端浏览器
func isMobileUA(ua string) bool {
	ua = strings.ToLower(ua)
	for _, kw := range []string{"android", "iphone", "ipod", "mobile", "harmonyos", "windows phone"} {
		if strings.Contains(ua, kw) {
			return true
		}
	}
	return false
}

// RequestAlipay 创建支付宝支付订单：
// 手机端走手机网站支付(wap.pay, 同窗跳转可拉起支付宝App)，电脑端走电脑网站支付(page.pay, 新标签页收银台)
func RequestAlipay(c *gin.Context) {
	if rejectThirdPartyPaymentForSite(c) {
		return
	}
	if !checkUserTopupAllowed(c) {
		return
	}

	var req AlipayRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.Amount <= 0 {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "参数错误"})
		return
	}

	id := c.GetInt("id")
	group := c.GetString("group")
	payMoney := getPayMoney(id, req.Amount, group)
	if payMoney <= 0 {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "充值金额计算错误"})
		return
	}

	if payMoney < setting.AlipayMinTopUp {
		c.JSON(http.StatusOK, gin.H{
			"message": "error",
			"data":    fmt.Sprintf("充值金额不能低于 %.2f 元", setting.AlipayMinTopUp),
		})
		return
	}

	tradeNo := fmt.Sprintf("ALP%d%d", id, time.Now().UnixMicro())
	amount := req.Amount
	if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens {
		amount = decimal.NewFromInt(amount).Div(decimal.NewFromFloat(common.QuotaPerUnit)).IntPart()
	}
	topUp := &model.TopUp{
		UserId:          id,
		Amount:          amount,
		Money:           payMoney,
		TradeNo:         tradeNo,
		PaymentMethod:   model.PaymentMethodAlipay,
		PaymentProvider: model.PaymentProviderAlipay,
		CreateTime:      common.GetTimestamp(),
		Status:          common.TopUpStatusPending,
	}
	if err := topUp.Insert(); err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("alipay: insert topup failed user_id=%d error=%q", id, err.Error()))
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "创建订单失败"})
		return
	}

	client, err := getAlipayClient()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "支付宝配置错误: " + err.Error()})
		return
	}

	notifyURL := fmt.Sprintf("%s/api/user/alipay/notify", system_setting.ServerAddress)
	returnURL := fmt.Sprintf("%s/wallet", system_setting.ServerAddress)
	trade := alipay.Trade{
		Subject:     "API额度充值",
		OutTradeNo:  tradeNo,
		TotalAmount: strconv.FormatFloat(payMoney, 'f', 2, 64),
		NotifyURL:   notifyURL,
		ReturnURL:   returnURL,
	}

	isMobile := req.Device == "mobile" || (req.Device == "" && isMobileUA(c.Request.UserAgent()))

	if isMobile {
		// 手机端：手机网站支付，同窗跳转可拉起支付宝 App
		trade.ProductCode = "QUICK_WAP_WAY"
		wapURL, werr := client.TradeWapPay(alipay.TradeWapPay{Trade: trade})
		if werr != nil {
			logger.LogError(c.Request.Context(), fmt.Sprintf("alipay: wap.pay failed trade_no=%s err=%v", tradeNo, werr))
			c.JSON(http.StatusOK, gin.H{"message": "error", "data": "创建支付宝订单失败"})
			return
		}
		logger.LogInfo(c.Request.Context(), fmt.Sprintf("alipay: wap order created trade_no=%s user_id=%d money=%.2f", tradeNo, id, payMoney))
		c.JSON(http.StatusOK, gin.H{
			"message": "success",
			"data": gin.H{
				"trade_no": tradeNo,
				"pay_type": "redirect_self",
				"pay_url":  wapURL.String(),
			},
		})
		return
	}

	// 电脑端：page.pay + qr_pay_mode=4，服务端抓取返回页面里的官方收款码短链
	// （qr.alipay.com 域名，约40字符：码稀疏易扫，且是官方域名不触发 App 风控），
	// 前端本地渲染成二维码。抓取失败时降级为 iframe 嵌入支付宝页面。
	trade.ProductCode = "FAST_INSTANT_TRADE_PAY"
	pageURL, perr := client.TradePagePay(alipay.TradePagePay{
		Trade:       trade,
		QRPayMode:   "4",
		QRCodeWidth: "200",
	})
	if perr != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("alipay: page.pay(qr_mode4) failed trade_no=%s err=%v", tradeNo, perr))
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "创建支付宝订单失败"})
		return
	}

	if qrCode, qerr := fetchAlipayQRCode(pageURL.String()); qerr == nil {
		logger.LogInfo(c.Request.Context(), fmt.Sprintf("alipay: qr order created trade_no=%s user_id=%d money=%.2f qr=%s", tradeNo, id, payMoney, qrCode))
		c.JSON(http.StatusOK, gin.H{
			"message": "success",
			"data": gin.H{
				"trade_no": tradeNo,
				"qr_code":  qrCode,
			},
		})
		return
	} else {
		logger.LogError(c.Request.Context(), fmt.Sprintf("alipay: extract qrCode failed trade_no=%s err=%v, falling back to iframe", tradeNo, qerr))
	}

	logger.LogInfo(c.Request.Context(), fmt.Sprintf("alipay: qr order created (iframe fallback) trade_no=%s user_id=%d money=%.2f", tradeNo, id, payMoney))
	c.JSON(http.StatusOK, gin.H{
		"message": "success",
		"data": gin.H{
			"trade_no": tradeNo,
			"pay_type": "iframe_qr",
			"pay_url":  pageURL.String(),
		},
	})
}

// alipayQRCodeRe 从 qr_pay_mode=4 返回页面中提取官方收款码短链（qr.alipay.com 域名，App 扫码不触发风控）
var alipayQRCodeRe = regexp.MustCompile(`name="qrCode"[^>]*value="(https://qr\.alipay\.com/[A-Za-z0-9]+)"`)

// fetchAlipayQRCode 请求 page.pay(qr_pay_mode=4) 页面并提取其中的官方二维码短链
func fetchAlipayQRCode(pageURL string) (string, error) {
	httpClient := &http.Client{Timeout: 5 * time.Second}
	resp, err := httpClient.Get(pageURL)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 256*1024))
	if err != nil {
		return "", err
	}
	m := alipayQRCodeRe.FindSubmatch(body)
	if m == nil {
		return "", fmt.Errorf("qrCode field not found in page")
	}
	return string(m[1]), nil
}

// AlipayNotify 处理支付宝异步回调
func AlipayNotify(c *gin.Context) {
	if rejectThirdPartyPaymentForSite(c) {
		return
	}
	ctx := c.Request.Context()
	client, err := getAlipayClient()
	if err != nil {
		logger.LogError(ctx, "alipay notify: client init failed: "+err.Error())
		c.String(http.StatusOK, "fail")
		return
	}

	notification, err := client.GetTradeNotification(c.Request)
	if err != nil {
		logger.LogError(ctx, "alipay notify: parse failed: "+err.Error())
		c.String(http.StatusOK, "fail")
		return
	}

	if notification.TradeStatus != alipay.TradeStatusSuccess {
		c.String(http.StatusOK, "success")
		return
	}

	tradeNo := notification.OutTradeNo
	if err := model.UpdatePendingTopUpStatus(tradeNo, model.PaymentProviderAlipay, common.TopUpStatusSuccess); err != nil {
		if err != model.ErrTopUpStatusInvalid {
			logger.LogError(ctx, fmt.Sprintf("alipay notify: update status failed trade_no=%s error=%v", tradeNo, err))
			c.String(http.StatusOK, "fail")
			return
		}
	}
	logger.LogInfo(ctx, fmt.Sprintf("alipay topup completed trade_no=%s", tradeNo))
	c.String(http.StatusOK, "success")
}

// QueryAlipayOrder 查询支付宝订单状态（前端轮询）。
// 订单在本地仍为 pending 时主动向支付宝查询交易状态，异步回调丢失也能到账。
func QueryAlipayOrder(c *gin.Context) {
	if rejectThirdPartyPaymentForSite(c) {
		return
	}
	tradeNo := c.Query("trade_no")
	if tradeNo == "" {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "缺少 trade_no"})
		return
	}
	topUp := model.GetTopUpByTradeNo(tradeNo)
	if topUp == nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "订单不存在"})
		return
	}
	if topUp.UserId != c.GetInt("id") {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "无权查询"})
		return
	}
	if topUp.Status == common.TopUpStatusPending {
		if client, err := getAlipayClient(); err == nil {
			result, qerr := client.TradeQuery(context.Background(), alipay.TradeQuery{OutTradeNo: tradeNo})
			if qerr == nil && result.IsSuccess() &&
				(result.TradeStatus == alipay.TradeStatusSuccess || result.TradeStatus == alipay.TradeStatusFinished) {
				if uerr := model.UpdatePendingTopUpStatus(tradeNo, model.PaymentProviderAlipay, common.TopUpStatusSuccess); uerr == nil {
					logger.LogInfo(c.Request.Context(), fmt.Sprintf("alipay: topup completed via active query trade_no=%s", tradeNo))
					topUp.Status = common.TopUpStatusSuccess
				}
			}
		}
	}
	c.JSON(http.StatusOK, gin.H{"message": "success", "data": topUp.Status})
}
