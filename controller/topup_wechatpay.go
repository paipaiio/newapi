package controller

import (
	"context"
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
	"github.com/wechatpay-apiv3/wechatpay-go/core/auth/verifiers"
	"github.com/wechatpay-apiv3/wechatpay-go/core/downloader"
	"github.com/wechatpay-apiv3/wechatpay-go/core/notify"
	"github.com/wechatpay-apiv3/wechatpay-go/core/option"
	"github.com/wechatpay-apiv3/wechatpay-go/services/payments"
	"github.com/wechatpay-apiv3/wechatpay-go/services/payments/native"
	"github.com/wechatpay-apiv3/wechatpay-go/utils"
)

func getWechatPayClient() (*core.Client, error) {
	// Replace literal \n with actual newlines for PEM format
	privateKeyContent := strings.ReplaceAll(setting.WechatPayPrivateKey, "\\n", "\n")

	privateKey, err := utils.LoadPrivateKey(privateKeyContent)
	if err != nil {
		privateKey, err = utils.LoadPrivateKeyWithPath(privateKeyContent)
		if err != nil {
			return nil, fmt.Errorf("加载微信支付私钥失败: %w", err)
		}
	}

	ctx := context.Background()
	
	// 使用 APIv3 密钥自动下载证书模式（标准做法）
	opts := []core.ClientOption{
		option.WithWechatPayAutoAuthCipher(
			setting.WechatPayMchId,
			setting.WechatPaySerialNo,
			privateKey,
			setting.WechatPayApiV3Key,
		),
	}
	
	return core.NewClient(ctx, opts...)
}

type WechatPayRequest struct {
	Amount int64 `json:"amount"`
}

// RequestWechatPay 创建微信支付 Native 订单，返回 code_url 供前端渲染二维码
func RequestWechatPay(c *gin.Context) {
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
	ctx := c.Request.Context()
	// Replace literal \n with actual newlines for PEM format
	privateKeyContent := strings.ReplaceAll(setting.WechatPayPrivateKey, "\\n", "\n")


	privateKey, err := utils.LoadPrivateKey(setting.WechatPayPrivateKey)
	if err != nil {
		privateKey, err = utils.LoadPrivateKeyWithPath(privateKeyContent)
		if err != nil {
			logger.LogError(ctx, "wechatpay notify: load private key failed: "+err.Error())
			c.JSON(http.StatusInternalServerError, gin.H{"code": "FAIL", "message": "配置错误"})
			return
		}
	}

	// 注册证书下载器（首次需要下载平台证书用于验签）
	if err := downloader.MgrInstance().RegisterDownloaderWithPrivateKey(
		ctx, privateKey, setting.WechatPaySerialNo, setting.WechatPayMchId, setting.WechatPayApiV3Key,
	); err != nil {
		logger.LogError(ctx, "wechatpay notify: register downloader failed: "+err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{"code": "FAIL", "message": "证书初始化失败"})
		return
	}

	// GetCertificateVisitor 返回 core.CertificateVisitor，实现了 CertificateGetter 接口
	certVisitor := downloader.MgrInstance().GetCertificateVisitor(setting.WechatPayMchId)
	handler, err := notify.NewRSANotifyHandler(
		setting.WechatPayApiV3Key,
		verifiers.NewSHA256WithRSAVerifier(certVisitor),
	)
	if err != nil {
		logger.LogError(ctx, "wechatpay notify: create handler failed: "+err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{"code": "FAIL", "message": "初始化失败"})
		return
	}

	// payments.Transaction 是通用交易结构（native/jsapi/app 共用）
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
			logger.LogError(ctx, "wechatpay notify: update order failed: "+err.Error())
		}
	}
	c.JSON(http.StatusOK, gin.H{"code": "SUCCESS", "message": "OK"})
}
