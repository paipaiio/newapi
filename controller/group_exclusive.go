package controller

import (
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
)

// exclusiveGroupItem 列表项：分组名 + 授权用户ID列表 + 已解析的授权用户信息。
type exclusiveGroupItem struct {
	GroupName string                `json:"group_name"`
	UserIds   []int                 `json:"user_ids"`
	Users     []model.ExclusiveUser `json:"users"`
}

// GetExclusiveGroups 列出所有独享分组及其授权用户（管理员）。
// 授权用户的用户名在后端一次性解析（IN 查询），避免前端只能匹配到最近注册的小批用户。
func GetExclusiveGroups(c *gin.Context) {
	names := model.GetExclusiveGroupNames()
	// 先收集全部授权用户ID，一次查询解析用户名
	allIds := make([]int, 0)
	seen := make(map[int]struct{})
	perGroup := make(map[string][]int, len(names))
	for _, name := range names {
		ids := model.GetGroupAuthorizedUsers(name)
		perGroup[name] = ids
		for _, id := range ids {
			if _, ok := seen[id]; !ok {
				seen[id] = struct{}{}
				allIds = append(allIds, id)
			}
		}
	}
	usernames := model.GetExclusiveUsersByIds(allIds)

	items := make([]exclusiveGroupItem, 0, len(names))
	for _, name := range names {
		ids := perGroup[name]
		users := make([]model.ExclusiveUser, 0, len(ids))
		for _, id := range ids {
			users = append(users, model.ExclusiveUser{Id: id, Username: usernames[id]})
		}
		items = append(items, exclusiveGroupItem{
			GroupName: name,
			UserIds:   ids,
			Users:     users,
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
