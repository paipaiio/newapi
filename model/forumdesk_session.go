package model

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

// ForumDeskSession stores the per-user ForumDesk conversation binding.
// VisitorToken is a sensitive credential and must never be serialized to clients.
type ForumDeskSession struct {
	Id             int    `json:"id" gorm:"primaryKey;autoIncrement"`
	UserId         int    `json:"user_id" gorm:"not null;uniqueIndex"`
	ConversationID string `json:"conversation_id" gorm:"type:varchar(64);not null;uniqueIndex"`
	VisitorToken   string `json:"-" gorm:"type:varchar(255);not null"`
	CreatedAt      int64  `json:"created_at" gorm:"autoCreateTime"`
	UpdatedAt      int64  `json:"updated_at" gorm:"autoUpdateTime"`
}

func (ForumDeskSession) TableName() string {
	return "forum_desk_sessions"
}

func (s ForumDeskSession) String() string {
	return fmt.Sprintf("ForumDeskSession{UserId:%d ConversationID:%s VisitorToken:%s}", s.UserId, s.ConversationID, common.MaskForumDeskSecret(s.VisitorToken))
}

func GetForumDeskSessionByUserId(userId int) (*ForumDeskSession, error) {
	if userId <= 0 {
		return nil, errors.New("invalid user id")
	}
	var session ForumDeskSession
	err := DB.Where("user_id = ?", userId).First(&session).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &session, nil
}

func GetForumDeskSessionByUserAndConversation(userId int, conversationID string) (*ForumDeskSession, error) {
	conversationID = strings.TrimSpace(conversationID)
	if userId <= 0 || conversationID == "" {
		return nil, nil
	}
	var session ForumDeskSession
	err := DB.Where("user_id = ? AND conversation_id = ?", userId, conversationID).First(&session).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &session, nil
}

func UpsertForumDeskSession(userId int, conversationID, visitorToken string) (*ForumDeskSession, error) {
	conversationID = strings.TrimSpace(conversationID)
	visitorToken = strings.TrimSpace(visitorToken)
	if userId <= 0 || conversationID == "" || visitorToken == "" {
		return nil, errors.New("invalid forumdesk session")
	}
	now := time.Now().Unix()
	existing, err := GetForumDeskSessionByUserId(userId)
	if err != nil {
		return nil, err
	}
	if existing == nil {
		session := &ForumDeskSession{
			UserId:         userId,
			ConversationID: conversationID,
			VisitorToken:   visitorToken,
			CreatedAt:      now,
			UpdatedAt:      now,
		}
		if err := DB.Create(session).Error; err != nil {
			return nil, err
		}
		return session, nil
	}
	existing.ConversationID = conversationID
	existing.VisitorToken = visitorToken
	existing.UpdatedAt = now
	if err := DB.Save(existing).Error; err != nil {
		return nil, err
	}
	return existing, nil
}

func DeleteForumDeskSession(userId int, conversationID string) error {
	query := DB.Where("user_id = ?", userId)
	if strings.TrimSpace(conversationID) != "" {
		query = query.Where("conversation_id = ?", strings.TrimSpace(conversationID))
	}
	return query.Delete(&ForumDeskSession{}).Error
}
