package service

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
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

// filterByVisibleGroups 应用「可见分组白名单」（仅影响展示）：
// 用户 Setting.VisibleGroups 非空时，该用户能看到的就是白名单本身；为空表示不限制。
//
// 白名单是权威的：管理员给某个用户显式配了哪些分组，就以那份配置为准，不再受
// 「全局公开可选分组」限制。因此白名单里那些系统已定义、但没开放给用户自选的分组
// （典型场景：分组只分配给特定客户，不公开）也会被放进来，否则管理员配了却不生效。
// 合法性口径与 relay 一致（ratio_setting.ContainsGroupRatio），保证这里能看到的分组
// relay 一定放行，不会出现「选得到但用不了」。
//
// 兜底：若结果为空，回退到用户自身分组 userGroup，避免用户完全无分组可见。
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
	// 白名单里未出现在 groups 中的分组，是管理员分配给该用户、但没公开给所有人自选的
	// 分组。它们同样要放出来，否则「设置里配了可见分组却看不到」。
	// 只接受系统已定义（配了倍率）的分组名，过滤掉改名/删除后残留的脏数据。
	for name := range allow {
		if _, ok := filtered[name]; ok {
			continue
		}
		if ratio_setting.ContainsGroupRatio(name) {
			filtered[name] = setting.GetUsableGroupDescription(name)
		}
	}
	// 独享分组是管理员对该用户的显式授权，优先级高于可见白名单：始终保留，
	// 否则会出现"已授权独享分组但用户分组选择里看不到"的问题。
	for _, name := range model.GetUserAuthorizedExclusiveGroups(userId) {
		if desc, ok := groups[name]; ok {
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

func IsUserSelectableGroup(userGroup, groupName string) bool {
	if groupName == "" || groupName == "auto" {
		return false
	}
	return GroupInUserUsableGroups(userGroup, groupName) && ratio_setting.ContainsGroupRatio(groupName)
}

// GetUserAutoGroup 根据用户分组获取自动分组设置
func GetUserAutoGroup(userGroup string) []string {
	autoGroups := make([]string, 0)
	seen := make(map[string]struct{})
	for _, group := range setting.GetAutoGroups() {
		if !IsUserSelectableGroup(userGroup, group) {
			continue
		}
		if _, ok := seen[group]; ok {
			continue
		}
		seen[group] = struct{}{}
		autoGroups = append(autoGroups, group)
	}
	return autoGroups
}

// GetUserAutoGroupByUser 在 GetUserAutoGroup 基础上叠加独享分组授权。
func GetUserAutoGroupByUser(userId int, userGroup string) []string {
	groups := GetUserUsableGroupsByUser(userId, userGroup)
	autoGroups := make([]string, 0)
	for _, group := range setting.GetAutoGroups() {
		if _, ok := groups[group]; ok && ratio_setting.ContainsGroupRatio(group) {
			autoGroups = append(autoGroups, group)
		}
	}
	return autoGroups
}

// FilterUserTokenAutoGroups applies current group permissions before the token limit.
func FilterUserTokenAutoGroups(userGroup string, groups []string) []string {
	return filterUserTokenAutoGroupsByUser(0, userGroup, groups)
}

func filterUserTokenAutoGroupsByUser(userId int, userGroup string, groups []string) []string {
	maxCount := setting.GetMaxTokenAutoGroups()
	filtered := make([]string, 0, min(len(groups), maxCount))
	seen := make(map[string]struct{})
	var usable map[string]string
	if userId > 0 {
		usable = GetUserUsableGroupsByUser(userId, userGroup)
	}
	for _, group := range groups {
		selectable := IsUserSelectableGroup(userGroup, group)
		if usable != nil {
			_, selectable = usable[group]
			selectable = selectable && ratio_setting.ContainsGroupRatio(group)
		}
		if !selectable {
			continue
		}
		if _, ok := seen[group]; ok {
			continue
		}
		seen[group] = struct{}{}
		filtered = append(filtered, group)
		if len(filtered) == maxCount {
			break
		}
	}
	return filtered
}

// GetRequestAutoGroups resolves the ordered Auto groups for the current token.
func GetRequestAutoGroups(c *gin.Context, userGroup string) []string {
	userId := common.GetContextKeyInt(c, constant.ContextKeyUserId)
	value, ok := common.GetContextKey(c, constant.ContextKeyTokenAutoGroups)
	if !ok {
		if userId > 0 {
			return GetUserAutoGroupByUser(userId, userGroup)
		}
		return GetUserAutoGroup(userGroup)
	}
	groups, ok := value.([]string)
	if !ok {
		return []string{}
	}
	return filterUserTokenAutoGroupsByUser(userId, userGroup, groups)
}

// GetGroupsEnabledModels 按 groups 顺序获取各分组启用的模型并去重。
func GetGroupsEnabledModels(groups []string) []string {
	seen := make(map[string]struct{})
	models := make([]string, 0)
	for _, group := range groups {
		for _, modelName := range model.GetGroupEnabledModels(group) {
			if _, ok := seen[modelName]; !ok {
				seen[modelName] = struct{}{}
				models = append(models, modelName)
			}
		}
	}
	return models
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

// IsGroupUnrestrictedRole 判断该角色是否不受分组可见性限制（管理员及以上）。
func IsGroupUnrestrictedRole(role int) bool {
	return role >= common.RoleAdminUser
}

// GetAllDefinedGroups 返回系统内所有「已定义」分组：GroupRatio 注册表 ∪ 全局可选分组，
// 并在配置了 auto 子分组时补上虚拟分组 auto。
// 取并集是因为两边都可能有对方没有的分组——像 kiro-test 这类可用但未配倍率的分组
// 不在 GroupRatio 里，而独享分组通常只在 GroupRatio 里。
func GetAllDefinedGroups() map[string]string {
	groups := make(map[string]string)
	for name := range ratio_setting.GetGroupRatioCopy() {
		groups[name] = setting.GetUsableGroupDescription(name)
	}
	for name, desc := range setting.GetUserUsableGroupsCopy() {
		if _, exists := groups[name]; !exists {
			groups[name] = desc
		}
	}
	if len(setting.GetAutoGroups()) > 0 {
		groups["auto"] = setting.GetUsableGroupDescription("auto")
	}
	return groups
}

// GetDisplayGroupsForRole 是所有「展示分组」场景的统一入口：
//   - 管理员及以上：返回全部已定义分组，不受独享名单与可见白名单限制
//   - 普通用户：等价于 GetUserDisplayGroupsByUser（独享 + 可见白名单双重过滤）
//
// 新增任何展示分组的页面/接口都应调用此函数，不要各自去拼过滤逻辑——
// 历史上定价页（模型广场）就是因为绕过统一入口而漏掉了管理员豁免。
// ⚠️ 仅用于展示；鉴权与渠道选择等强制路径必须继续用 GetUserUsableGroupsByUser。
func GetDisplayGroupsForRole(userId int, userGroup string, role int) map[string]string {
	if IsGroupUnrestrictedRole(role) {
		return GetAllDefinedGroups()
	}
	return GetUserDisplayGroupsByUser(userId, userGroup)
}

// GetDisplayAutoGroupsForRole 展示用的 auto 子分组列表，管理员不受限制。
func GetDisplayAutoGroupsForRole(userId int, userGroup string, role int) []string {
	if IsGroupUnrestrictedRole(role) {
		return append(make([]string, 0), setting.GetAutoGroups()...)
	}
	return GetUserDisplayAutoGroupsByUser(userId, userGroup)
}
