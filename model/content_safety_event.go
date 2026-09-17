package model

import (
	"strings"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
)

type ContentSafetyEvent struct {
	Id           int64   `json:"id" gorm:"primaryKey;autoIncrement"`
	CreatedAt    int64   `json:"created_at" gorm:"bigint;index:idx_cse_created"`
	UserId       int     `json:"user_id" gorm:"index:idx_cse_user_created,priority:1"`
	Username     string  `json:"username" gorm:"type:varchar(64);index;default:''"`
	TokenName    string  `json:"token_name" gorm:"type:varchar(64);default:''"`
	ModelName    string  `json:"model_name" gorm:"type:varchar(128);index;default:''"`
	Group        string  `json:"group" gorm:"type:varchar(64);default:''"`
	RequestId    string  `json:"request_id" gorm:"type:varchar(64);index;default:''"`
	ChannelId    int     `json:"channel_id" gorm:"default:0"`
	Policy       string  `json:"policy" gorm:"type:varchar(32);index;default:''"`
	Phase        string  `json:"phase" gorm:"type:varchar(16);default:''"`
	Mode         string  `json:"mode" gorm:"type:varchar(16);default:''"`
	Action       string  `json:"action" gorm:"type:varchar(16);index;default:''"`
	Source       string  `json:"source" gorm:"type:varchar(32);default:''"`
	Category     string  `json:"category" gorm:"type:varchar(32);index;default:''"`
	Categories   string  `json:"categories" gorm:"type:varchar(255);default:''"`
	Safety       string  `json:"safety" gorm:"type:varchar(32);default:''"`
	Score        float64 `json:"score" gorm:"default:0"`
	Matched      string  `json:"matched" gorm:"type:varchar(255);default:''"`
	Snippet      string  `json:"snippet" gorm:"type:varchar(512);default:''"`
	ReviewStatus string  `json:"review_status" gorm:"type:varchar(16);index;default:'pending'"`
	ReviewNote   string  `json:"review_note" gorm:"type:varchar(512);default:''"`
	ReviewedBy   int     `json:"reviewed_by" gorm:"default:0"`
	ReviewedAt   int64   `json:"reviewed_at" gorm:"default:0"`
}

func (ContentSafetyEvent) TableName() string {
	return "content_safety_events"
}

func contentSafetyDB() *gorm.DB {
	if common.UsingLogDatabase(common.DatabaseTypeClickHouse) {
		return DB
	}
	if LOG_DB != nil {
		return LOG_DB
	}
	return DB
}

func InsertContentSafetyEvent(evt *ContentSafetyEvent) error {
	db := contentSafetyDB()
	if db == nil {
		return nil
	}
	return db.Create(evt).Error
}

type GetContentSafetyEventsParams struct {
	UserId       int
	Username     string
	ModelName    string
	RequestId    string
	Policy       string
	Action       string
	Category     string
	ReviewStatus string
	StartTs      int64
	EndTs        int64
	Page         int
	PageSize     int
}

func GetContentSafetyEvents(p GetContentSafetyEventsParams) (events []*ContentSafetyEvent, total int64, err error) {
	tx := contentSafetyDB().Model(&ContentSafetyEvent{})
	if p.UserId > 0 {
		tx = tx.Where("user_id = ?", p.UserId)
	}
	if p.Username != "" {
		tx = tx.Where("username = ?", p.Username)
	}
	if p.ModelName != "" {
		tx = tx.Where("model_name = ?", p.ModelName)
	}
	if p.RequestId != "" {
		tx = tx.Where("request_id = ?", p.RequestId)
	}
	if p.Policy != "" {
		tx = tx.Where("policy = ?", p.Policy)
	}
	if p.Action != "" {
		tx = tx.Where("action = ?", p.Action)
	}
	if p.Category != "" {
		tx = tx.Where("category = ?", p.Category)
	}
	if p.ReviewStatus != "" {
		tx = tx.Where("review_status = ?", p.ReviewStatus)
	}
	if p.StartTs > 0 {
		tx = tx.Where("created_at >= ?", p.StartTs)
	}
	if p.EndTs > 0 {
		tx = tx.Where("created_at <= ?", p.EndTs)
	}
	if err = tx.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	page := p.Page
	if page < 1 {
		page = 1
	}
	pageSize := p.PageSize
	if pageSize <= 0 || pageSize > 100 {
		pageSize = 20
	}
	err = tx.Order("id desc").Offset((page - 1) * pageSize).Limit(pageSize).Find(&events).Error
	return events, total, err
}

func GetContentSafetyEventById(id int64) (*ContentSafetyEvent, error) {
	var evt ContentSafetyEvent
	if err := contentSafetyDB().First(&evt, id).Error; err != nil {
		return nil, err
	}
	return &evt, nil
}

func ReviewContentSafetyEvent(id int64, status, note string, reviewerId int) (*ContentSafetyEvent, error) {
	status = strings.TrimSpace(status)
	evt, err := GetContentSafetyEventById(id)
	if err != nil {
		return nil, err
	}
	updates := map[string]interface{}{
		"review_status": status,
		"review_note":   note,
		"reviewed_by":   reviewerId,
		"reviewed_at":   common.GetTimestamp(),
	}
	if err := contentSafetyDB().Model(evt).Updates(updates).Error; err != nil {
		return nil, err
	}
	evt.ReviewStatus = status
	evt.ReviewNote = note
	evt.ReviewedBy = reviewerId
	evt.ReviewedAt = updates["reviewed_at"].(int64)
	return evt, nil
}

type ContentSafetyStats struct {
	Pending int64 `json:"pending"`
	Blocked int64 `json:"blocked"`
	Review  int64 `json:"review"`
}

func GetContentSafetyStats() (ContentSafetyStats, error) {
	var stats ContentSafetyStats
	db := contentSafetyDB()
	if err := db.Model(&ContentSafetyEvent{}).Where("review_status = ?", "pending").Count(&stats.Pending).Error; err != nil {
		return stats, err
	}
	if err := db.Model(&ContentSafetyEvent{}).Where("action = ?", "block").Count(&stats.Blocked).Error; err != nil {
		return stats, err
	}
	if err := db.Model(&ContentSafetyEvent{}).Where("action = ?", "review").Count(&stats.Review).Error; err != nil {
		return stats, err
	}
	return stats, nil
}

// DisableUserForPolicy sets a user's status to disabled as a content-safety policy action.
func DisableUserForPolicy(userId int) error {
	return DB.Model(&User{}).Where("id = ?", userId).Update("status", common.UserStatusDisabled).Error
}
