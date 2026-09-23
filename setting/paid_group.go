package setting

import (
	"encoding/json"
	"slices"
	"strings"
	"sync"

	"github.com/QuantumNous/new-api/common"
)

// paidGroups 付费分组名单：命中名单的分组仅对「充值过的用户」开放。
// 免费用户（没有任何成功充值记录）在 UI 上看不到这些分组，
// 已有令牌/请求在鉴权层被硬拦截（见 middleware/auth.go）。
// 存为 JSON 数组的 option（key: PaidGroups）。
var paidGroups = []string{}
var paidGroupsMutex sync.RWMutex

func PaidGroups2JSONString() string {
	paidGroupsMutex.RLock()
	defer paidGroupsMutex.RUnlock()

	jsonBytes, err := json.Marshal(paidGroups)
	if err != nil {
		common.SysLog("error marshalling paid groups: " + err.Error())
	}
	return string(jsonBytes)
}

func UpdatePaidGroupsByJSONString(jsonStr string) error {
	paidGroupsMutex.Lock()
	defer paidGroupsMutex.Unlock()

	list := make([]string, 0)
	if err := json.Unmarshal([]byte(jsonStr), &list); err != nil {
		return err
	}
	normalized := make([]string, 0, len(list))
	for _, g := range list {
		if g = strings.TrimSpace(g); g != "" {
			normalized = append(normalized, g)
		}
	}
	paidGroups = normalized
	return nil
}

// IsPaidGroup 判断分组是否在付费分组名单中。
func IsPaidGroup(groupName string) bool {
	paidGroupsMutex.RLock()
	defer paidGroupsMutex.RUnlock()
	return slices.Contains(paidGroups, groupName)
}

// GetPaidGroupsCopy 返回付费分组名单副本。
func GetPaidGroupsCopy() []string {
	paidGroupsMutex.RLock()
	defer paidGroupsMutex.RUnlock()
	return append(make([]string, 0, len(paidGroups)), paidGroups...)
}
