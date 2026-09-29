package controller

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service/contentsafety"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/gin-gonic/gin"
)

// errCodeContentSafetyBlocked 内容安全硬拦的错误码（文档约定，前端/客户端可识别）。
const errCodeContentSafetyBlocked = types.ErrorCode("content_safety_blocked")

// scanContentSafetyInput 在预扣费之前对文本类请求做内容安全输入侧扫描。
// 返回 nil 表示放行；命中硬拦返回 403 content_safety_blocked。
// 任何取参/扫描异常都静默放行——内容安全是软增强，绝不影响正常请求链路。
func scanContentSafetyInput(c *gin.Context, relayInfo *relaycommon.RelayInfo) *types.NewAPIError {
	if !operation_setting.GetContentSafetySetting().Enabled {
		return nil
	}
	switch relayInfo.RelayFormat {
	case types.RelayFormatOpenAI,
		types.RelayFormatClaude,
		types.RelayFormatGemini,
		types.RelayFormatOpenAIResponses,
		types.RelayFormatOpenAIAlphaSearch:
	default:
		return nil
	}
	storage, err := common.GetBodyStorage(c)
	if err != nil {
		return nil
	}
	rawBody, err := storage.Bytes()
	if err != nil || len(rawBody) == 0 {
		return nil
	}
	scanText, fullText := contentsafety.ExtractScanText(
		rawBody, model.ExtractContentText(rawBody, ""))
	if strings.TrimSpace(scanText) == "" && strings.TrimSpace(fullText) == "" {
		return nil
	}
	req := contentsafety.Request{
		UserId:    relayInfo.UserId,
		Username:  common.GetContextKeyString(c, constant.ContextKeyUserName),
		TokenName: c.GetString("token_name"),
		ModelName: relayInfo.OriginModelName,
		// 注意：此时尚未选渠道，relayInfo.ChannelMeta 为 nil，
		// 上游模型名（UpstreamModelName）不可用，留空即可。
		Group:      common.GetContextKeyString(c, constant.ContextKeyUsingGroup),
		TokenGroup: relayInfo.TokenGroup,
		RequestId:  relayInfo.RequestId,
		ScanText:   scanText,
		FullText:   fullText,
		Phase:      contentsafety.PhaseInput,
	}
	result := contentsafety.Evaluate(c.Request.Context(), req)
	if result.Action != contentsafety.ActionBlock {
		return nil
	}
	return types.NewErrorWithStatusCode(
		contentsafety.ErrBlocked, errCodeContentSafetyBlocked,
		http.StatusForbidden, types.ErrOptionWithSkipRetry())
}

func GetContentSafetyEvents(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	userId, _ := strconv.Atoi(c.Query("user_id"))
	startTs, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTs, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)

	events, total, err := model.GetContentSafetyEvents(model.GetContentSafetyEventsParams{
		UserId:       userId,
		Username:     c.Query("username"),
		ModelName:    c.Query("model_name"),
		RequestId:    c.Query("request_id"),
		Policy:       c.Query("policy"),
		Action:       c.Query("action"),
		Category:     c.Query("category"),
		ReviewStatus: c.Query("review_status"),
		StartTs:      startTs,
		EndTs:        endTs,
		Page:         pageInfo.GetPage(),
		PageSize:     pageInfo.GetPageSize(),
	})
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"items": events,
			"total": total,
			"page":  pageInfo.GetPage(),
		},
	})
}

func GetContentSafetyStats(c *gin.Context) {
	stats, err := model.GetContentSafetyStats()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": stats})
}

func GetContentSafetyEvent(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "invalid id"})
		return
	}
	evt, err := model.GetContentSafetyEventById(id)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "record not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": evt})
}

type reviewContentSafetyRequest struct {
	Status string `json:"status"`
	Note   string `json:"note"`
}

func ReviewContentSafetyEvent(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "invalid id"})
		return
	}
	var req reviewContentSafetyRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "invalid body"})
		return
	}
	status := strings.ToLower(strings.TrimSpace(req.Status))
	switch status {
	case contentsafety.ReviewReviewed, contentsafety.ReviewDismissed, contentsafety.ReviewBanned, contentsafety.ReviewPending:
	default:
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "invalid review status"})
		return
	}
	evt, err := model.ReviewContentSafetyEvent(id, status, req.Note, c.GetInt("id"))
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	if status == contentsafety.ReviewBanned && evt.UserId > 0 {
		if err := model.DisableUserForPolicy(evt.UserId); err != nil {
			common.SysError("content safety review ban failed: " + err.Error())
		}
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": evt})
}
