package service

import (
	"strings"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
)

// GetUserUsableGroupsByUser 在 GetUserUsableGroups 的基础上叠加「独享分组」过滤：
// 独享分组默认对所有人隐藏，只有被授权的 userId 才保留。
// 同时，将该用户被授权的所有独享分组直接注入到结果中——即使 user.Group 字段未指向
// 该分组名，授权用户也能正常看到并使用自己的独享分组，无需管理员额外手动同步
// user.Group 字段。
// 所有"用户能用哪些分组"的判断都应优先用此函数（能拿到 userId 时）。
func GetUserUsableGroupsByUser(userId int, userGroup string) map[string]string {
	groups := GetUserUsableGroups(userGroup)
	// 把该用户被授权的独享分组直接注入（独享分组一般不在全局 UserUsableGroups 里）
	for _, name := range model.GetUserAuthorizedExclusiveGroups(userId) {
		if _, exists := groups[name]; !exists {
			groups[name] = setting.GetUsableGroupDescription(name)
		}
	}
	// 移除用户无权使用的独享分组
	for name := range groups {
		if model.IsExclusiveGroup(name) && !model.IsUserAllowedExclusive(userId, name) {
			delete(groups, name)
		}
	}
	return groups
}

// GetUserDisplayGroupsByUser 在 GetUserUsableGroupsByUser 基础上再叠加「可见分组白名单」过滤。
// 仅用于"展示"场景（令牌分组下拉 / 定价页 / 模型列表），不用于鉴权与路由，
// 避免白名单意外拒绝既有令牌（用户明确要求：可见分组仅影响展示）。
func GetUserDisplayGroupsByUser(userId int, userGroup string) map[string]string {
	groups := GetUserUsableGroupsByUser(userId, userGroup)
	return filterByVisibleGroups(userId, userGroup, groups)
}

// GetUserDisplayAutoGroupsByUser 展示用的 auto 分组列表（叠加可见白名单过滤）。
func GetUserDisplayAutoGroupsByUser(userId int, userGroup string) []string {
	visible := GetUserDisplayGroupsByUser(userId, userGroup)
	autoGroups := make([]string, 0)
	for _, group := range setting.GetAutoGroups() {
		if _, ok := visible[group]; ok {
			autoGroups = append(autoGroups, group)
		}
	}
	return autoGroups
}

// filterByVisibleGroups 叠加「可见分组白名单」过滤（仅影响展示）：
// 用户 Setting.VisibleGroups 非空时，只保留白名单内的分组；为空表示不限制。
// 兜底：若过滤后为空，回退到用户自身分组 userGroup（含 auto 时保留 auto），避免用户完全无分组可见。
func filterByVisibleGroups(userId int, userGroup string, groups map[string]string) map[string]string {
	cache, err := model.GetUserCache(userId)
	if err != nil || cache == nil {
		return groups
	}
	visible := cache.GetSetting().VisibleGroups
	if len(visible) == 0 {
		return groups
	}
	allow := make(map[string]struct{}, len(visible))
	for _, g := range visible {
		if g = strings.TrimSpace(g); g != "" {
			allow[g] = struct{}{}
		}
	}
	if len(allow) == 0 {
		return groups
	}
	filtered := make(map[string]string)
	for name, desc := range groups {
		if _, ok := allow[name]; ok {
			filtered[name] = desc
		}
	}
	// 兜底：白名单与可用分组无交集时，至少保留用户自身分组，避免无组可用
	if len(filtered) == 0 {
		if desc, ok := groups[userGroup]; ok {
			filtered[userGroup] = desc
		}
	}
	return filtered
}

func GetUserUsableGroups(userGroup string) map[string]string {
	groupsCopy := setting.GetUserUsableGroupsCopy()
	if userGroup != "" {
		specialSettings, b := ratio_setting.GetGroupRatioSetting().GroupSpecialUsableGroup.Get(userGroup)
		if b {
			// 处理特殊可用分组
			for specialGroup, desc := range specialSettings {
				if strings.HasPrefix(specialGroup, "-:") {
					// 移除分组
					groupToRemove := strings.TrimPrefix(specialGroup, "-:")
					delete(groupsCopy, groupToRemove)
				} else if strings.HasPrefix(specialGroup, "+:") {
					// 添加分组
					groupToAdd := strings.TrimPrefix(specialGroup, "+:")
					groupsCopy[groupToAdd] = desc
				} else {
					// 直接添加分组
					groupsCopy[specialGroup] = desc
				}
			}
		}
		// 如果userGroup不在UserUsableGroups中，返回UserUsableGroups + userGroup
		if _, ok := groupsCopy[userGroup]; !ok {
			groupsCopy[userGroup] = "用户分组"
		}
	}
	return groupsCopy
}

func GroupInUserUsableGroups(userGroup, groupName string) bool {
	_, ok := GetUserUsableGroups(userGroup)[groupName]
	return ok
}

// GetUserAutoGroup 根据用户分组获取自动分组设置
func GetUserAutoGroup(userGroup string) []string {
	groups := GetUserUsableGroups(userGroup)
	autoGroups := make([]string, 0)
	for _, group := range setting.GetAutoGroups() {
		if _, ok := groups[group]; ok {
			autoGroups = append(autoGroups, group)
		}
	}
	return autoGroups
}

// GetUserAutoGroupByUser 在 GetUserAutoGroup 基础上叠加独享分组过滤。
func GetUserAutoGroupByUser(userId int, userGroup string) []string {
	groups := GetUserUsableGroupsByUser(userId, userGroup)
	autoGroups := make([]string, 0)
	for _, group := range setting.GetAutoGroups() {
		if _, ok := groups[group]; ok {
			autoGroups = append(autoGroups, group)
		}
	}
	return autoGroups
}

// GetUserGroupRatio 获取用户使用某个分组的倍率
// userGroup 用户分组
// group 需要获取倍率的分组
func GetUserGroupRatio(userGroup, group string) float64 {
	ratio, ok := ratio_setting.GetGroupGroupRatio(userGroup, group)
	if ok {
		return ratio
	}
	return ratio_setting.GetGroupRatio(group)
}

// GetUserPersonalGroupRatio 返回用户对某分组的个人倍率覆写（user.Setting.GroupRatios）。
// 未设置时 ok=false。
func GetUserPersonalGroupRatio(userId int, group string) (float64, bool) {
	if userId <= 0 {
		return 0, false
	}
	cache, err := model.GetUserCache(userId)
	if err != nil || cache == nil {
		return 0, false
	}
	overrides := cache.GetSetting().GroupRatios
	if len(overrides) == 0 {
		return 0, false
	}
	ratio, ok := overrides[group]
	return ratio, ok
}

// GetUserGroupRatioByUser 解析用户在某分组的最终倍率：
// 个人覆写 > 用户组特殊倍率（GroupGroupRatio）> 全局倍率（GroupRatio）。
// 计费与所有展示场景都应使用此函数（能拿到 userId 时）。
func GetUserGroupRatioByUser(userId int, userGroup, group string) float64 {
	if ratio, ok := GetUserPersonalGroupRatio(userId, group); ok {
		return ratio
	}
	return GetUserGroupRatio(userGroup, group)
}
