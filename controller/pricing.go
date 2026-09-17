package controller

import (
	"maps"
	"slices"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
)

// restrictPricingEnableGroups 按用户「可见分组白名单」裁剪每个模型的 EnableGroup，
// 返回新 slice 不修改入参。EnableGroup 含 "all" 时展开为可见分组全集（除 auto，排序）。
// visible 为空表示未设白名单，原样返回。
func restrictPricingEnableGroups(pricing []model.Pricing, visible map[string]string) []model.Pricing {
	if len(visible) == 0 {
		return pricing
	}
	out := make([]model.Pricing, 0, len(pricing))
	for _, item := range pricing {
		cp := item
		if common.StringsContains(item.EnableGroup, "all") {
			groups := make([]string, 0, len(visible))
			for g := range visible {
				if g == "auto" {
					continue
				}
				groups = append(groups, g)
			}
			slices.Sort(groups)
			cp.EnableGroup = groups
		} else {
			groups := make([]string, 0, len(item.EnableGroup))
			for _, g := range item.EnableGroup {
				if _, ok := visible[g]; ok {
					groups = append(groups, g)
				}
			}
			cp.EnableGroup = groups
		}
		out = append(out, cp)
	}
	return out
}

func filterPricingByUsableGroups(pricing []model.Pricing, usableGroup map[string]string) []model.Pricing {
	if len(pricing) == 0 {
		return pricing
	}
	if len(usableGroup) == 0 {
		return []model.Pricing{}
	}

	filtered := make([]model.Pricing, 0, len(pricing))
	for _, item := range pricing {
		if common.StringsContains(item.EnableGroup, "all") {
			filtered = append(filtered, item)
			continue
		}
		for _, group := range item.EnableGroup {
			if _, ok := usableGroup[group]; ok {
				filtered = append(filtered, item)
				break
			}
		}
	}
	return filtered
}

func GetPricing(c *gin.Context) {
	pricing := model.GetPricing()
	userId, exists := c.Get("id")
	usableGroup := map[string]string{}
	groupRatio := map[string]float64{}
	maps.Copy(groupRatio, ratio_setting.GetGroupRatioCopy())
	var group string
	resolvedUserId := 0
	visibleGroups := map[string]string{}
	// ⚠️ 本路由默认走 TryUserAuth（只 set id 不 set role），c.GetInt("role") 恒为 0，
	// 因此角色必须从 user cache 读；取不到时保持 RoleGuestUser 按最受限处理。
	role := common.RoleGuestUser
	if exists {
		resolvedUserId = userId.(int)
		user, err := model.GetUserCache(userId.(int))
		if err == nil {
			group = user.Group
			role = user.Role
			for _, vg := range user.GetSetting().VisibleGroups {
				if vg != "" {
					visibleGroups[vg] = vg
				}
			}
			for g := range groupRatio {
				ratio, ok := ratio_setting.GetGroupGroupRatio(group, g)
				if ok {
					groupRatio[g] = ratio
				}
			}
			// 个人倍率覆写优先级最高（user.Setting.GroupRatios）
			if overrides := user.GetSetting().GroupRatios; len(overrides) > 0 {
				for g, r := range overrides {
					if _, ok := groupRatio[g]; ok {
						groupRatio[g] = r
					}
				}
			}
		}
	}

	usableGroup = service.GetDisplayGroupsForRole(resolvedUserId, group, role)
	// 管理员不受分组可见性限制：跳过按可用分组裁剪模型列表，否则 EnableGroup 指向
	// 未在注册表里的分组的模型会被误删。
	if !service.IsGroupUnrestrictedRole(role) {
		pricing = filterPricingByUsableGroups(pricing, usableGroup)
		// check groupRatio contains usableGroup
		for group := range ratio_setting.GetGroupRatioCopy() {
			if _, ok := usableGroup[group]; !ok {
				delete(groupRatio, group)
			}
		}
		// 用户级可见分组白名单（售卖账户场景）：进一步把 EnableGroup 裁剪到白名单内。
		if len(visibleGroups) > 0 {
			pricing = restrictPricingEnableGroups(pricing, visibleGroups)
		}
	}

	c.JSON(200, gin.H{
		"success":            true,
		"data":               pricing,
		"vendors":            model.GetVendors(),
		"group_ratio":        groupRatio,
		"usable_group":       usableGroup,
		"supported_endpoint": model.GetSupportedEndpointMap(),
		"auto_groups":        service.GetDisplayAutoGroupsForRole(resolvedUserId, group, role),
		"pricing_version":    "a42d372ccf0b5dd13ecf71203521f9d2",
	})
}

func ResetModelRatio(c *gin.Context) {
	defaultStr := ratio_setting.DefaultModelRatio2JSONString()
	err := model.UpdateOption("ModelRatio", defaultStr)
	if err != nil {
		c.JSON(200, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	err = ratio_setting.UpdateModelRatioByJSONString(defaultStr)
	if err != nil {
		c.JSON(200, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(200, gin.H{
		"success": true,
		"message": "重置模型倍率成功",
	})
}
