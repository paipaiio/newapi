package model

import (
	"sync"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// GroupExclusive 独享分组授权表。
// 一个分组一旦在此表中出现（至少一行），即被视为「独享分组」：
// 默认对所有用户隐藏/禁用，只有出现在授权名单中的 UserId 才能使用。
// 一个分组可授权给多个用户（多行）。
type GroupExclusive struct {
	Id        int    `json:"id" gorm:"primaryKey;autoIncrement"`
	GroupName string `json:"group_name" gorm:"type:varchar(64);index:idx_ge_group_user,priority:1;uniqueIndex:uniq_ge_group_user,priority:1"`
	UserId    int    `json:"user_id" gorm:"index:idx_ge_group_user,priority:2;uniqueIndex:uniq_ge_group_user,priority:2"`
	CreatedAt int64  `json:"created_at" gorm:"bigint"`
}

// 内存缓存：分组名 -> 授权用户ID集合。
// 由于独享分组数量与授权关系都很少且读多写少，全量缓存 + 写时重建最简单可靠。
var (
	exclusiveMu    sync.RWMutex
	exclusiveCache map[string]map[int]struct{}
	exclusiveInit  bool
)

// InitGroupExclusiveCache 从数据库加载全部独享授权到内存。
func InitGroupExclusiveCache() error {
	var rows []GroupExclusive
	if err := DB.Find(&rows).Error; err != nil {
		return err
	}
	cache := make(map[string]map[int]struct{})
	for _, r := range rows {
		if cache[r.GroupName] == nil {
			cache[r.GroupName] = make(map[int]struct{})
		}
		cache[r.GroupName][r.UserId] = struct{}{}
	}
	exclusiveMu.Lock()
	exclusiveCache = cache
	exclusiveInit = true
	exclusiveMu.Unlock()
	return nil
}

func ensureExclusiveCache() {
	exclusiveMu.RLock()
	ok := exclusiveInit
	exclusiveMu.RUnlock()
	if !ok {
		_ = InitGroupExclusiveCache()
	}
}

// IsExclusiveGroup 判断某分组是否为独享分组（在授权表中存在至少一行）。
func IsExclusiveGroup(groupName string) bool {
	ensureExclusiveCache()
	exclusiveMu.RLock()
	defer exclusiveMu.RUnlock()
	users, ok := exclusiveCache[groupName]
	return ok && len(users) > 0
}

// IsUserAllowedExclusive 判断某用户是否被授权使用某独享分组。
func IsUserAllowedExclusive(userId int, groupName string) bool {
	ensureExclusiveCache()
	exclusiveMu.RLock()
	defer exclusiveMu.RUnlock()
	users, ok := exclusiveCache[groupName]
	if !ok {
		return false
	}
	_, allowed := users[userId]
	return allowed
}

// GetExclusiveGroupNames 返回所有独享分组名。
func GetExclusiveGroupNames() []string {
	ensureExclusiveCache()
	exclusiveMu.RLock()
	defer exclusiveMu.RUnlock()
	names := make([]string, 0, len(exclusiveCache))
	for name, users := range exclusiveCache {
		if len(users) > 0 {
			names = append(names, name)
		}
	}
	return names
}

// GetGroupAuthorizedUsers 返回某分组的授权用户ID列表。
func GetGroupAuthorizedUsers(groupName string) []int {
	ensureExclusiveCache()
	exclusiveMu.RLock()
	defer exclusiveMu.RUnlock()
	users, ok := exclusiveCache[groupName]
	if !ok {
		return []int{}
	}
	ids := make([]int, 0, len(users))
	for id := range users {
		ids = append(ids, id)
	}
	return ids
}

// AddUsersToExclusiveGroup 增量把若干用户加入某分组的独享授权名单（已存在的跳过）。
// 与 SetGroupExclusiveUsers 的全量覆盖不同，适合批量逐个追加的场景（如 API 售卖）。
func AddUsersToExclusiveGroup(groupName string, userIds []int) error {
	if groupName == "" || len(userIds) == 0 {
		return nil
	}
	now := common.GetTimestamp()
	rows := make([]GroupExclusive, 0, len(userIds))
	seen := make(map[int]struct{})
	for _, uid := range userIds {
		if _, dup := seen[uid]; dup {
			continue
		}
		seen[uid] = struct{}{}
		rows = append(rows, GroupExclusive{GroupName: groupName, UserId: uid, CreatedAt: now})
	}
	// 依赖 (group_name,user_id) 唯一索引去重，冲突则忽略
	if err := DB.Clauses(clause.OnConflict{DoNothing: true}).Create(&rows).Error; err != nil {
		return err
	}
	return InitGroupExclusiveCache()
}

// SetGroupExclusiveUsers 全量设置某分组的独享授权用户名单。
// 传入空名单 = 取消该分组的独享（删除全部行）。
func SetGroupExclusiveUsers(groupName string, userIds []int) error {
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("group_name = ?", groupName).Delete(&GroupExclusive{}).Error; err != nil {
			return err
		}
		if len(userIds) > 0 {
			now := common.GetTimestamp()
			seen := make(map[int]struct{})
			rows := make([]GroupExclusive, 0, len(userIds))
			for _, uid := range userIds {
				if _, dup := seen[uid]; dup {
					continue
				}
				seen[uid] = struct{}{}
				rows = append(rows, GroupExclusive{GroupName: groupName, UserId: uid, CreatedAt: now})
			}
			if err := tx.Create(&rows).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	return InitGroupExclusiveCache()
}
