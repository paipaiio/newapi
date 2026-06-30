package controller

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

// GetOtherServices 用户侧：返回所有「已启用」的服务（按 sort_order 排序）。
func GetOtherServices(c *gin.Context) {
	common.ApiSuccess(c, model.GetEnabledOtherServices())
}

// GetAllOtherServices 管理端：返回全部服务（含禁用）。
func GetAllOtherServices(c *gin.Context) {
	services, err := model.GetAllOtherServices()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, services)
}

type otherServiceRequest struct {
	Id           int    `json:"id"`
	Name         string `json:"name"`
	Description  string `json:"description"`
	Url          string `json:"url"`
	Icon         string `json:"icon"`
	Category     string `json:"category"`
	SortOrder    int    `json:"sort_order"`
	Enabled      bool   `json:"enabled"`
	OpenInNewTab bool   `json:"open_in_new_tab"`
}

// validate 校验并规范化请求字段。
func (r *otherServiceRequest) validate() (string, bool) {
	r.Name = strings.TrimSpace(r.Name)
	r.Url = strings.TrimSpace(r.Url)
	r.Icon = strings.TrimSpace(r.Icon)
	r.Category = strings.TrimSpace(r.Category)
	r.Description = strings.TrimSpace(r.Description)
	if r.Name == "" {
		return "服务名称不能为空", false
	}
	if r.Url == "" {
		return "服务链接不能为空", false
	}
	if !strings.HasPrefix(r.Url, "http://") && !strings.HasPrefix(r.Url, "https://") {
		return "服务链接必须以 http:// 或 https:// 开头", false
	}
	return "", true
}

// CreateOtherService 管理端：新建服务。
func CreateOtherService(c *gin.Context) {
	var req otherServiceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "参数错误"})
		return
	}
	if msg, ok := req.validate(); !ok {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": msg})
		return
	}
	s := &model.OtherService{
		Name:         req.Name,
		Description:  req.Description,
		Url:          req.Url,
		Icon:         req.Icon,
		Category:     req.Category,
		SortOrder:    req.SortOrder,
		Enabled:      req.Enabled,
		OpenInNewTab: req.OpenInNewTab,
	}
	if err := model.CreateOtherService(s); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, s)
}

// UpdateOtherService 管理端：更新服务。
func UpdateOtherService(c *gin.Context) {
	var req otherServiceRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.Id <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "参数错误：id 无效"})
		return
	}
	if msg, ok := req.validate(); !ok {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": msg})
		return
	}
	s := &model.OtherService{
		Id:           req.Id,
		Name:         req.Name,
		Description:  req.Description,
		Url:          req.Url,
		Icon:         req.Icon,
		Category:     req.Category,
		SortOrder:    req.SortOrder,
		Enabled:      req.Enabled,
		OpenInNewTab: req.OpenInNewTab,
	}
	if err := model.UpdateOtherService(s); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, s)
}

// DeleteOtherService 管理端：删除服务。
func DeleteOtherService(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "参数错误：id 无效"})
		return
	}
	if err := model.DeleteOtherService(id); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}
