package model

import (
	"sync"

	"github.com/QuantumNous/new-api/common"
)

// OtherService 「其他服务」条目：管理员维护的对外/自研服务入口，
// 在用户可见侧边栏的「其他服务」页面以卡片形式展示。
type OtherService struct {
	Id           int    `json:"id" gorm:"primaryKey;autoIncrement"`
	Name         string `json:"name" gorm:"type:varchar(128);not null"`
	Description  string `json:"description" gorm:"type:varchar(512)"`
	Url          string `json:"url" gorm:"type:varchar(512);not null"`
	Icon         string `json:"icon" gorm:"type:varchar(512)"`     // emoji 或图片 URL
	Category     string `json:"category" gorm:"type:varchar(64);index"`
	SortOrder    int    `json:"sort_order" gorm:"default:0;index"` // 升序，小的在前
	Enabled      bool   `json:"enabled" gorm:"type:tinyint(1);default:1;index"`
	OpenInNewTab bool   `json:"open_in_new_tab" gorm:"type:tinyint(1);default:1"`
	CreatedAt    int64  `json:"created_at" gorm:"bigint"`
	UpdatedAt    int64  `json:"updated_at" gorm:"bigint"`
}

// 内存缓存：仅缓存「已启用」服务的有序列表，供用户侧高频读取。
// 服务条目数量很少、读多写少，全量缓存 + 写时重建最简单可靠。
var (
	otherServiceMu    sync.RWMutex
	otherServiceCache []OtherService
	otherServiceInit  bool
)

// InitOtherServiceCache 从数据库加载全部已启用服务到内存（按 sort_order, id 排序）。
func InitOtherServiceCache() error {
	var rows []OtherService
	if err := DB.Where("enabled = ?", true).
		Order("sort_order asc, id asc").Find(&rows).Error; err != nil {
		return err
	}
	otherServiceMu.Lock()
	otherServiceCache = rows
	otherServiceInit = true
	otherServiceMu.Unlock()
	return nil
}

func ensureOtherServiceCache() {
	otherServiceMu.RLock()
	ok := otherServiceInit
	otherServiceMu.RUnlock()
	if !ok {
		_ = InitOtherServiceCache()
	}
}

// GetEnabledOtherServices 返回缓存中已启用服务的有序副本（用户侧展示用）。
func GetEnabledOtherServices() []OtherService {
	ensureOtherServiceCache()
	otherServiceMu.RLock()
	defer otherServiceMu.RUnlock()
	out := make([]OtherService, len(otherServiceCache))
	copy(out, otherServiceCache)
	return out
}

// GetAllOtherServices 返回全部服务（含禁用），管理端用，直查 DB。
func GetAllOtherServices() ([]OtherService, error) {
	var rows []OtherService
	err := DB.Order("sort_order asc, id asc").Find(&rows).Error
	return rows, err
}

// CreateOtherService 新建服务条目并重建缓存。
func CreateOtherService(s *OtherService) error {
	now := common.GetTimestamp()
	s.CreatedAt = now
	s.UpdatedAt = now
	if err := DB.Create(s).Error; err != nil {
		return err
	}
	return InitOtherServiceCache()
}

// UpdateOtherService 全量更新服务条目（按 Id）并重建缓存。
// 用 Select 显式列出字段，避免 GORM 对 bool 零值（false）的忽略。
func UpdateOtherService(s *OtherService) error {
	s.UpdatedAt = common.GetTimestamp()
	if err := DB.Model(&OtherService{}).Where("id = ?", s.Id).
		Select("name", "description", "url", "icon", "category",
			"sort_order", "enabled", "open_in_new_tab", "updated_at").
		Updates(s).Error; err != nil {
		return err
	}
	return InitOtherServiceCache()
}

// DeleteOtherService 删除服务条目并重建缓存。
func DeleteOtherService(id int) error {
	if err := DB.Delete(&OtherService{}, id).Error; err != nil {
		return err
	}
	return InitOtherServiceCache()
}
