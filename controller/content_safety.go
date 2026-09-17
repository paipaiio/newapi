package controller

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/contentsafety"

	"github.com/gin-gonic/gin"
)

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
