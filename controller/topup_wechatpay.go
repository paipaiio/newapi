package controller

import (
	"context"
	"crypto/rsa"
	"fmt"
	"net/http"
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
	"github.com/wechatpay-apiv3/wechatpay-go/core"
	"github.com/wechatpay-apiv3/wechatpay-go/core/auth"
	"github.com/wechatpay-apiv3/wechatpay-go/core/auth/verifiers"
	"github.com/wechatpay-apiv3/wechatpay-go/core/downloader"
	"github.com/wechatpay-apiv3/wechatpay-go/core/notify"
	"github.com/wechatpay-apiv3/wechatpay-go/core/option"
	"github.com/wechatpay-apiv3/wechatpay-go/services/payments"
	"github.com/wechatpay-apiv3/wechatpay-go/services/payments/native"
	"github.com/wechatpay-apiv3/wechatpay-go/utils"
)

func loadWechatPayPrivateKey() (*rsa.PrivateKey, error) {
	privateKeyContent := strings.ReplaceAll(setting.WechatPayPrivateKey, `\n`, "\n")
	privateKey, err := utils.LoadPrivateKey(privateKeyContent)
	if err != nil {
		return nil, fmt.Errorf("加载微信支付私钥失败: %w", err)
	}
	return privateKey, nil
}

func loadWechatPayPublicKey() (*rsa.PublicKey, error) {
	publicKeyContent := strings.ReplaceAll(setting.WechatPayPublicKey, `\n`, "\n")
	publicKey, err := utils.LoadPublicKey(publicKeyContent)
	if err != nil {
		return nil, fmt.Errorf("加载微信支付平台公钥失败: %w", err)
	}
	return publicKey, nil
}

func useWechatPayPublicKeyMode() bool {
	return strings.TrimSpace(setting.WechatPayPublicKeyID) != "" &&
		strings.TrimSpace(setting.WechatPayPublicKey) != ""
}

func getWechatPayClient() (*core.Client, error) {
	privateKey, err := loadWechatPayPrivateKey()
	if err != nil {
		return nil, err
	}

	var authOption core.ClientOption
	if useWechatPayPublicKeyMode() {
		publicKey, err := loadWechatPayPublicKey()
		if err != nil {
			return nil, err
		}
		authOption = option.WithWechatPayPublicKeyAuthCipher(
			setting.WechatPayMchId,
			setting.WechatPaySerialNo,
			privateKey,
			setting.WechatPayPublicKeyID,
			publicKey,
		)
	} else {
		authOption = option.WithWechatPayAutoAuthCipher(
			setting.WechatPayMchId,
			setting.WechatPaySerialNo,
			privateKey,
			setting.WechatPayApiV3Key,
		)
	}

	return core.NewClient(context.Background(), authOption)
}

type WechatPayRequest struct {
	Amount int64 `json:"amount"`
}

// RequestWechatPay 创建微信支付 Native 订单，返回 code_url 供前端渲染二维码
func RequestWechatPay(c *gin.Context) {
	if rejectThirdPartyPaymentForSite(c) {
		return
	}
	if !checkUserTopupAllowed(c) {
		return
	}

	var req WechatPayRequest
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

	if payMoney < setting.WechatPayMinTopUp {
		c.JSON(http.StatusOK, gin.H{
			"message": "error",
			"data":    fmt.Sprintf("充值金额不能低于 %.2f 元", setting.WechatPayMinTopUp),
		})
		return
	}

	tradeNo := fmt.Sprintf("WXP%d%d", id, time.Now().UnixMicro())
	amountFen := int64(payMoney * 100)

	amount := req.Amount
	if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens {
		amount = decimal.NewFromInt(amount).Div(decimal.NewFromFloat(common.QuotaPerUnit)).IntPart()
	}
	topUp := &model.TopUp{
		UserId:          id,
		Amount:          amount,
		Money:           payMoney,
		TradeNo:         tradeNo,
		PaymentMethod:   model.PaymentMethodWechatPay,
		PaymentProvider: model.PaymentProviderWechatPay,
		CreateTime:      common.GetTimestamp(),
		Status:          common.TopUpStatusPending,
	}
	if err := topUp.Insert(); err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("wechatpay: insert topup failed user_id=%d error=%q", id, err.Error()))
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "创建订单失败"})
		return
	}

	client, err := getWechatPayClient()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "微信支付配置错误: " + err.Error()})
		return
	}

	notifyUrl := system_setting.ServerAddress + "/api/user/wechatpay/notify"
	if setting.WechatPayNotifyUrl != "" {
		notifyUrl = setting.WechatPayNotifyUrl
	}

	svc := native.NativeApiService{Client: client}
	resp, _, err := svc.Prepay(context.Background(), native.PrepayRequest{
		Appid:       core.String(setting.WechatPayAppId),
		Mchid:       core.String(setting.WechatPayMchId),
		Description: core.String("API额度充值"),
		OutTradeNo:  core.String(tradeNo),
		NotifyUrl:   core.String(notifyUrl),
		Amount: &native.Amount{
			Total:    core.Int64(amountFen),
			Currency: core.String("CNY"),
		},
	})
	if err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("wechatpay: prepay failed trade_no=%s error=%q", tradeNo, err.Error()))
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "创建微信支付订单失败: " + err.Error()})
		return
	}

	logger.LogInfo(c.Request.Context(), fmt.Sprintf("wechatpay: order created trade_no=%s user_id=%d money=%.2f", tradeNo, id, payMoney))
	logger.LogInfo(c.Request.Context(), fmt.Sprintf("wechatpay response data: {message:success, data:{trade_no:%s, code_url:%s}}", tradeNo, *resp.CodeUrl))
	c.JSON(http.StatusOK, gin.H{
		"message": "success",
		"data": gin.H{
			"trade_no": tradeNo,
			"code_url": *resp.CodeUrl,
		},
	})
}

// WechatPayNotify 处理微信支付回调通知
func WechatPayNotify(c *gin.Context) {
	if rejectThirdPartyPaymentForSite(c) {
		return
	}
	ctx := c.Request.Context()

	var verifier auth.Verifier
	if useWechatPayPublicKeyMode() {
		publicKey, err := loadWechatPayPublicKey()
		if err != nil {
			logger.LogError(ctx, "wechatpay notify: load public key failed: "+err.Error())
			c.JSON(http.StatusInternalServerError, gin.H{"code": "FAIL", "message": "配置错误"})
			return
		}
		verifier = verifiers.NewSHA256WithRSAPubkeyVerifier(
			setting.WechatPayPublicKeyID,
			*publicKey,
		)
	} else {
		privateKey, err := loadWechatPayPrivateKey()
		if err != nil {
			logger.LogError(ctx, "wechatpay notify: load private key failed: "+err.Error())
			c.JSON(http.StatusInternalServerError, gin.H{"code": "FAIL", "message": "配置错误"})
			return
		}
		if err := downloader.MgrInstance().RegisterDownloaderWithPrivateKey(
			ctx, privateKey, setting.WechatPaySerialNo, setting.WechatPayMchId, setting.WechatPayApiV3Key,
		); err != nil {
			logger.LogError(ctx, "wechatpay notify: register downloader failed: "+err.Error())
			c.JSON(http.StatusInternalServerError, gin.H{"code": "FAIL", "message": "证书初始化失败"})
			return
		}
		certVisitor := downloader.MgrInstance().GetCertificateVisitor(setting.WechatPayMchId)
		verifier = verifiers.NewSHA256WithRSAVerifier(certVisitor)
	}

	handler, err := notify.NewRSANotifyHandler(setting.WechatPayApiV3Key, verifier)
	if err != nil {
		logger.LogError(ctx, "wechatpay notify: create handler failed: "+err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{"code": "FAIL", "message": "初始化失败"})
		return
	}

	transaction := new(payments.Transaction)
	if _, err := handler.ParseNotifyRequest(ctx, c.Request, transaction); err != nil {
		logger.LogError(ctx, "wechatpay notify: parse failed: "+err.Error())
		c.JSON(http.StatusBadRequest, gin.H{"code": "FAIL", "message": "解析通知失败"})
		return
	}

	if transaction.TradeState == nil || *transaction.TradeState != "SUCCESS" {
		c.JSON(http.StatusOK, gin.H{"code": "SUCCESS", "message": "OK"})
		return
	}

	tradeNo := *transaction.OutTradeNo
	if err := model.UpdatePendingTopUpStatus(tradeNo, model.PaymentProviderWechatPay, common.TopUpStatusSuccess); err != nil {
		if err != model.ErrTopUpStatusInvalid {
			logger.LogError(ctx, fmt.Sprintf("wechatpay notify: update failed trade_no=%s error=%v", tradeNo, err))
			c.JSON(http.StatusInternalServerError, gin.H{"code": "FAIL", "message": "更新订单失败"})
			return
		}
	}

	logger.LogInfo(ctx, fmt.Sprintf("wechatpay topup completed trade_no=%s", tradeNo))
	c.JSON(http.StatusOK, gin.H{"code": "SUCCESS", "message": "OK"})
}

// QueryWechatPayOrder 查询微信支付订单状态（前端轮询）
func QueryWechatPayOrder(c *gin.Context) {
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
	c.JSON(http.StatusOK, gin.H{"message": "success", "data": topUp.Status})
}
