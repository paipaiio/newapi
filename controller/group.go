package controller

import (
	"net/http"

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

func GetUserGroups(c *gin.Context) {
	usableGroups := make(map[string]map[string]interface{})
	userGroup := ""
	userId := c.GetInt("id")
	userGroup, _ = model.GetUserGroup(userId, false)
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
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    usableGroups,
	})
}
