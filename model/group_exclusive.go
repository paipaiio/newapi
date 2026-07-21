package model

import (
	"sync"
	"time"

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
// 多节点部署时其他节点的缓存不会随写入即时失效，因此加 TTL 定期回源：
// 超过 exclusiveCacheTTL 未刷新则下一次读取时重新全量加载（秒级最终一致）。
var (
	exclusiveMu       sync.RWMutex
	exclusiveCache    map[string]map[int]struct{}
	exclusiveInit     bool
	exclusiveLoadedAt time.Time
)

// exclusiveCacheTTL 缓存最长存活时间；独享授权是低频读写字段，30s 回源一次
// 对 DB 压力可忽略（全表单表查询），换来多节点秒级一致。
const exclusiveCacheTTL = 30 * time.Second

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
	exclusiveLoadedAt = time.Now()
	exclusiveMu.Unlock()
	return nil
}

func ensureExclusiveCache() {
	exclusiveMu.RLock()
	fresh := exclusiveInit && time.Since(exclusiveLoadedAt) < exclusiveCacheTTL
	exclusiveMu.RUnlock()
	if !fresh {
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

// GetUserAuthorizedExclusiveGroups 返回某用户被授权的所有独享分组名。
// 用于在构建用户可用分组列表时直接注入，确保独享分组对授权用户可见，
// 不依赖 user.Group 字段是否恰好等于该独享分组名。
func GetUserAuthorizedExclusiveGroups(userId int) []string {
	ensureExclusiveCache()
	exclusiveMu.RLock()
	defer exclusiveMu.RUnlock()
	var groups []string
	for groupName, users := range exclusiveCache {
		if _, ok := users[userId]; ok {
			groups = append(groups, groupName)
		}
	}
	return groups
}

// ExclusiveUser 独享分组授权用户的最小信息（id + 用户名），用于管理端展示。
type ExclusiveUser struct {
	Id       int    `json:"id"`
	Username string `json:"username"`
}

// GetExclusiveUsersByIds 用一次 IN 查询批量解析用户ID到用户名，
// 避免管理端在前端用"最近100个用户"去匹配授权名单（用户多了会解析不到）。
func GetExclusiveUsersByIds(ids []int) map[int]string {
	result := make(map[int]string, len(ids))
	if len(ids) == 0 {
		return result
	}
	var rows []struct {
		Id       int
		Username string
	}
	if err := DB.Model(&User{}).Select("id, username").Where("id IN ?", ids).Find(&rows).Error; err != nil {
		common.SysLog("GetExclusiveUsersByIds error: " + err.Error())
		return result
	}
	for _, r := range rows {
		result[r.Id] = r.Username
	}
	return result
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
