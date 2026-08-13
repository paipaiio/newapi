package ratio_setting

import (
	"encoding/json"
	"errors"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/QuantumNous/new-api/types"
)

var defaultGroupRatio = map[string]float64{
	"default": 1,
	"vip":     1,
	"svip":    1,
}

var groupRatioMap = types.NewRWMap[string, float64]()

var defaultGroupGroupRatio = map[string]map[string]float64{
	"vip": {
		"edit_this": 0.9,
	},
}

var groupGroupRatioMap = types.NewRWMap[string, map[string]float64]()

var defaultGroupSpecialUsableGroup = map[string]map[string]string{}

// defaultUserGroupDefaultGroup 「纯用户分组」表：用户分组名 → 默认模型分组。
// 在这张表里有条目的分组是纯粹的用户身份标签（如 reseller），它本身不是模型/渠道
// 分组：不会被注入用户的可选分组列表，令牌未指定分组时按这里配置的默认模型分组路由。
// 表里没有的分组保持原有行为（分组名同时充当用户组与渠道组），存量零影响。
var defaultUserGroupDefaultGroup = map[string]string{}

var userGroupDefaultGroupMap = types.NewRWMap[string, string]()

type GroupRatioSetting struct {
	GroupRatio              *types.RWMap[string, float64]            `json:"group_ratio"`
	GroupGroupRatio         *types.RWMap[string, map[string]float64] `json:"group_group_ratio"`
	GroupSpecialUsableGroup *types.RWMap[string, map[string]string]  `json:"group_special_usable_group"`
	UserGroupDefaultGroup   *types.RWMap[string, string]             `json:"user_group_default_group"`
}

var groupRatioSetting GroupRatioSetting

func init() {
	groupSpecialUsableGroup := types.NewRWMap[string, map[string]string]()
	groupSpecialUsableGroup.AddAll(defaultGroupSpecialUsableGroup)

	groupRatioMap.AddAll(defaultGroupRatio)
	groupGroupRatioMap.AddAll(defaultGroupGroupRatio)
	userGroupDefaultGroupMap.AddAll(defaultUserGroupDefaultGroup)

	groupRatioSetting = GroupRatioSetting{
		GroupSpecialUsableGroup: groupSpecialUsableGroup,
		GroupRatio:              groupRatioMap,
		GroupGroupRatio:         groupGroupRatioMap,
		UserGroupDefaultGroup:   userGroupDefaultGroupMap,
	}

	config.GlobalConfig.Register("group_ratio_setting", &groupRatioSetting)
}

func GetGroupRatioSetting() *GroupRatioSetting {
	if groupRatioSetting.GroupSpecialUsableGroup == nil {
		groupRatioSetting.GroupSpecialUsableGroup = types.NewRWMap[string, map[string]string]()
		groupRatioSetting.GroupSpecialUsableGroup.AddAll(defaultGroupSpecialUsableGroup)
	}
	if groupRatioSetting.UserGroupDefaultGroup == nil {
		groupRatioSetting.UserGroupDefaultGroup = types.NewRWMap[string, string]()
		groupRatioSetting.UserGroupDefaultGroup.AddAll(defaultUserGroupDefaultGroup)
	}
	return &groupRatioSetting
}

func GetUserGroupDefaultGroupCopy() map[string]string {
	return GetGroupRatioSetting().UserGroupDefaultGroup.ReadAll()
}

func UserGroupDefaultGroup2JSONString() string {
	return GetGroupRatioSetting().UserGroupDefaultGroup.MarshalJSONString()
}

func UpdateUserGroupDefaultGroupByJSONString(jsonStr string) error {
	return types.LoadFromJsonString(GetGroupRatioSetting().UserGroupDefaultGroup, jsonStr)
}

// IsPureUserGroup 判断 userGroup 是否是「纯用户分组」——即只作为用户身份标签存在、
// 本身不对应任何渠道的分组。判定依据是它在 UserGroupDefaultGroup 表里配了默认模型分组。
//
// 这是全局唯一的判定入口：凡是要区分「用户身份」与「模型分组」的地方都应经过它，
// 避免各处各自用名字猜。
func IsPureUserGroup(userGroup string) bool {
	if userGroup == "" {
		return false
	}
	setting := GetGroupRatioSetting()
	target, ok := setting.UserGroupDefaultGroup.Get(userGroup)
	return ok && target != ""
}

// ResolveUsingGroup 把「用户分组」翻译成实际用于选渠道的「模型分组」。
// 纯用户分组返回它配置的默认模型分组；其余原样返回（存量分组名同时充当两者）。
//
// 调用点必须是那些要拿 user.Group 去选渠道/算倍率的地方；纯粹表示用户身份的地方
// （ContextKeyUserGroup、充值倍率、OAuth claims 等）不要经过这里。
func ResolveUsingGroup(userGroup string) string {
	if userGroup == "" {
		return userGroup
	}
	setting := GetGroupRatioSetting()
	if target, ok := setting.UserGroupDefaultGroup.Get(userGroup); ok && target != "" {
		return target
	}
	return userGroup
}

func GetGroupRatioCopy() map[string]float64 {
	return groupRatioMap.ReadAll()
}

func ContainsGroupRatio(name string) bool {
	_, ok := groupRatioMap.Get(name)
	return ok
}

func GroupRatio2JSONString() string {
	return groupRatioMap.MarshalJSONString()
}

func UpdateGroupRatioByJSONString(jsonStr string) error {
	return types.LoadFromJsonString(groupRatioMap, jsonStr)
}

func GetGroupRatio(name string) float64 {
	ratio, ok := groupRatioMap.Get(name)
	if !ok {
		common.SysLog("group ratio not found: " + name)
		return 1
	}
	return ratio
}

func GetGroupGroupRatio(userGroup, usingGroup string) (float64, bool) {
	gp, ok := groupGroupRatioMap.Get(userGroup)
	if !ok {
		return -1, false
	}
	ratio, ok := gp[usingGroup]
	if !ok {
		return -1, false
	}
	return ratio, true
}

func GroupGroupRatio2JSONString() string {
	return groupGroupRatioMap.MarshalJSONString()
}

func UpdateGroupGroupRatioByJSONString(jsonStr string) error {
	return types.LoadFromJsonString(groupGroupRatioMap, jsonStr)
}

func CheckGroupRatio(jsonStr string) error {
	checkGroupRatio := make(map[string]float64)
	err := json.Unmarshal([]byte(jsonStr), &checkGroupRatio)
	if err != nil {
		return err
	}
	for name, ratio := range checkGroupRatio {
		if ratio < 0 {
			return errors.New("group ratio must be not less than 0: " + name)
		}
	}
	return nil
}
