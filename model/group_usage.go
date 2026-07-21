package model

import "fmt"

// GroupUsageStats 分组引用统计：多少用户/令牌/渠道仍在引用该分组。
// 用于管理端删除分组前的安全检查与展示。
type GroupUsageStats struct {
	Users    int64 `json:"users"`
	Tokens   int64 `json:"tokens"`
	Channels int64 `json:"channels"`
}

// Total 引用总数（任一非零即删除会影响现有配置）。
func (s *GroupUsageStats) Total() int64 {
	return s.Users + s.Tokens + s.Channels
}

// GetGroupUsageStats 统计分组名在 users.group（单值）与 tokens.group /
// channels.group（逗号分隔多值）中的引用次数。软删除记录不计入。
func GetGroupUsageStats(name string) (*GroupUsageStats, error) {
	stats := &GroupUsageStats{}
	name = NormalizeChannelGroupFilter(name)
	if name == "" {
		return stats, nil
	}
	if err := DB.Model(&User{}).Where(commonGroupCol+" = ?", name).Count(&stats.Users).Error; err != nil {
		return nil, fmt.Errorf("count users by group: %w", err)
	}
	if err := DB.Model(&Token{}).Where(channelGroupFilterCondition(), channelGroupFilterPattern(name)).Count(&stats.Tokens).Error; err != nil {
		return nil, fmt.Errorf("count tokens by group: %w", err)
	}
	if err := ApplyChannelGroupFilter(DB.Model(&Channel{}), name).Count(&stats.Channels).Error; err != nil {
		return nil, fmt.Errorf("count channels by group: %w", err)
	}
	return stats, nil
}
