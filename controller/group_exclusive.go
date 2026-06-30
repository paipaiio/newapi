package controller

import (
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
)

// exclusiveGroupItem 列表项：分组名 + 授权用户ID列表。
type exclusiveGroupItem struct {
	GroupName string `json:"group_name"`
	UserIds   []int  `json:"user_ids"`
}

// GetExclusiveGroups 列出所有独享分组及其授权用户（管理员）。
func GetExclusiveGroups(c *gin.Context) {
	names := model.GetExclusiveGroupNames()
	items := make([]exclusiveGroupItem, 0, len(names))
	for _, name := range names {
		items = append(items, exclusiveGroupItem{
			GroupName: name,
			UserIds:   model.GetGroupAuthorizedUsers(name),
		})
	}
	common.ApiSuccess(c, items)
}

type setExclusiveRequest struct {
	GroupName string `json:"group_name"`
	UserIds   []int  `json:"user_ids"`
}

// SetExclusiveGroup 设置某分组的独享授权用户名单（管理员）。
// user_ids 为空 = 取消该分组的独享。
func SetExclusiveGroup(c *gin.Context) {
	var req setExclusiveRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.GroupName == "" {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "参数错误：group_name 不能为空"})
		return
	}
	// 分组必须在 GroupRatio 中存在（即已定义）
	if !ratio_setting.ContainsGroupRatio(req.GroupName) {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "分组不存在，请先在分组倍率中定义该分组"})
		return
	}
	if err := model.SetGroupExclusiveUsers(req.GroupName, req.UserIds); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}
