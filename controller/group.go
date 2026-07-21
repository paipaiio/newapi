package controller

import (
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
)

func GetGroups(c *gin.Context) {
	groupNames := make([]string, 0)
	for groupName := range ratio_setting.GetGroupRatioCopy() {
		groupNames = append(groupNames, groupName)
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    groupNames,
	})
}

// buildUserGroupsPayload 构建某用户的「可见分组 + 倍率」视图。
// isAdmin=true 时返回全部已定义分组（管理员不受可选/白名单限制）。
func buildUserGroupsPayload(userId int, userGroup string, isAdmin bool) map[string]map[string]interface{} {
	usableGroups := make(map[string]map[string]interface{})

	if isAdmin {
		// 管理员视图：所有已定义分组（GroupRatio 注册表）+ auto
		for groupName := range ratio_setting.GetGroupRatioCopy() {
			usableGroups[groupName] = map[string]interface{}{
				"ratio": service.GetUserGroupRatioByUser(userId, userGroup, groupName),
				"desc":  setting.GetUsableGroupDescription(groupName),
			}
		}
		if len(setting.GetAutoGroups()) > 0 {
			usableGroups["auto"] = map[string]interface{}{
				"ratio": "自动",
				"desc":  setting.GetUsableGroupDescription("auto"),
			}
		}
		return usableGroups
	}

	userUsableGroups := service.GetUserDisplayGroupsByUser(userId, userGroup)
	// 遍历「用户可用分组」而非「配置了倍率的分组」：像 kiro-test 这类可用但
	// 未在 group_ratio 里配倍率的分组，之前会被 GetGroupRatioCopy() 漏掉而不显示。
	// 倍率取不到时 GetUserGroupRatio 会回退到默认分组倍率（通常 1）。
	for groupName, desc := range userUsableGroups {
		if groupName == "auto" {
			continue // auto 在下方单独处理（倍率显示为「自动」）
		}
		usableGroups[groupName] = map[string]interface{}{
			"ratio": service.GetUserGroupRatioByUser(userId, userGroup, groupName),
			"desc":  desc,
		}
	}
	if _, ok := userUsableGroups["auto"]; ok {
		usableGroups["auto"] = map[string]interface{}{
			"ratio": "自动",
			"desc":  setting.GetUsableGroupDescription("auto"),
		}
	}
	return usableGroups
}

func GetUserGroups(c *gin.Context) {
	userId := c.GetInt("id")
	userGroup, _ := model.GetUserGroup(userId, false)
	isAdmin := c.GetInt("role") >= common.RoleAdminUser
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    buildUserGroupsPayload(userId, userGroup, isAdmin),
	})
}

// GetUserGroupsPreview 管理员预览任意用户的「可见分组 + 倍率」视角。
// 用于排查"用户看不到某分组/倍率不对"类问题。
// GET /api/user/:id/groups （管理员）
func GetUserGroupsPreview(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "无效的用户 ID"})
		return
	}
	user, err := model.GetUserById(id, false)
	if err != nil || user == nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "用户不存在"})
		return
	}
	isTargetAdmin := user.Role >= common.RoleAdminUser
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"user_id":  user.Id,
			"username": user.Username,
			"group":    user.Group,
			"groups":   buildUserGroupsPayload(user.Id, user.Group, isTargetAdmin),
		},
	})
}
