package model

// fork_stats.go — fork-only aggregate query helpers referenced by controller.

// ChannelGroupStatRow is one row from GetChannelGroupStats: quota/token/request
// counts broken down by channel and billing group.
type ChannelGroupStatRow struct {
	ChannelId int    `json:"channel_id"`
	Group     string `json:"group"`
	Quota     int64  `json:"quota"`
	Tokens    int64  `json:"tokens"`
	Count     int64  `json:"count"`
}

// DailyChannelGroupStatRow is one row from GetDailyChannelGroupStats: same
// dimensions as ChannelGroupStatRow but with a day bucket (Unix day = ts/86400).
type DailyChannelGroupStatRow struct {
	Day       int64  `json:"day"`
	ChannelId int    `json:"channel_id"`
	Group     string `json:"group"`
	Quota     int64  `json:"quota"`
	Tokens    int64  `json:"tokens"`
	Count     int64  `json:"count"`
}

// GetChannelGroupStats aggregates log quota/tokens/requests per channel+group.
func GetChannelGroupStats(start, end int64) ([]ChannelGroupStatRow, error) {
	tx := LOG_DB.Table("logs").
		Select("channel AS channel_id, `group`, COALESCE(SUM(quota),0) AS quota, COALESCE(SUM(prompt_tokens+completion_tokens),0) AS tokens, COUNT(*) AS count").
		Group("channel, `group`")
	if start != 0 {
		tx = tx.Where("created_at >= ?", start)
	}
	if end != 0 {
		tx = tx.Where("created_at <= ?", end)
	}
	var rows []ChannelGroupStatRow
	err := tx.Scan(&rows).Error
	return rows, err
}

// GetDailyChannelGroupStats aggregates log quota/tokens/requests per day+channel+group.
func GetDailyChannelGroupStats(start, end int64) ([]DailyChannelGroupStatRow, error) {
	tx := LOG_DB.Table("logs").
		Select("(created_at / 86400) AS day, channel AS channel_id, `group`, COALESCE(SUM(quota),0) AS quota, COALESCE(SUM(prompt_tokens+completion_tokens),0) AS tokens, COUNT(*) AS count").
		Group("(created_at / 86400), channel, `group`")
	if start != 0 {
		tx = tx.Where("created_at >= ?", start)
	}
	if end != 0 {
		tx = tx.Where("created_at <= ?", end)
	}
	var rows []DailyChannelGroupStatRow
	err := tx.Scan(&rows).Error
	return rows, err
}

// ModelUsageStatRow is one row from GetModelUsageStats.
type ModelUsageStatRow struct {
	ModelName string `json:"model_name"`
	Quota     int64  `json:"quota"`
	Count     int64  `json:"count"`
	Tokens    int64  `json:"tokens"`
}

// GetModelUsageStats returns per-model quota/count/token totals for a given
// user or token. Pass userId>0 or tokenId>0; if both are zero it returns empty.
func GetModelUsageStats(userId, tokenId int) ([]ModelUsageStatRow, error) {
	if userId == 0 && tokenId == 0 {
		return nil, nil
	}
	tx := LOG_DB.Table("logs").
		Select("model_name, COALESCE(SUM(quota),0) AS quota, COUNT(*) AS count, COALESCE(SUM(prompt_tokens+completion_tokens),0) AS tokens").
		Group("model_name").
		Order("quota DESC")
	if userId != 0 {
		tx = tx.Where("user_id = ?", userId)
	} else {
		tx = tx.Where("token_id = ?", tokenId)
	}
	var rows []ModelUsageStatRow
	err := tx.Scan(&rows).Error
	return rows, err
}

// AdminSearchTokenRow extends Token with a FullKey field for admin lookup.
type AdminSearchTokenRow struct {
	Token
	FullKey string `json:"full_key" gorm:"-"`
}

// AdminSearchTokens searches tokens across all users by keyword (matches key,
// name, or batch_id) and returns paginated results.
func AdminSearchTokens(keyword string, offset, limit int) ([]*AdminSearchTokenRow, int64, error) {
	var rows []*AdminSearchTokenRow
	var total int64

	tx := DB.Model(&Token{}).Unscoped()
	if keyword != "" {
		like := "%" + keyword + "%"
		tx = tx.Where("key LIKE ? OR name LIKE ? OR batch_id LIKE ?", like, like, like)
	}
	if err := tx.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := tx.Order("id DESC").Offset(offset).Limit(limit).Find(&rows).Error
	return rows, total, err
}

// BatchStatRow summarises one sale batch.
type BatchStatRow struct {
	BatchId      string  `json:"batch_id"`
	UserCount    int64   `json:"user_count"`
	TotalQuota   int64   `json:"total_quota"`
	TotalUsed    int64   `json:"total_used"`
}

// GetBatchStats returns aggregate stats for every distinct batch_id in tokens.
func GetBatchStats() ([]BatchStatRow, error) {
	var rows []BatchStatRow
	err := DB.Table("tokens").
		Select("batch_id, COUNT(DISTINCT user_id) AS user_count, COALESCE(SUM(remain_quota),0) AS total_quota, COALESCE(SUM(used_quota),0) AS total_used").
		Where("batch_id != ''").
		Group("batch_id").
		Order("batch_id ASC").
		Scan(&rows).Error
	return rows, err
}

// BatchExportRow is one row returned by GetBatchExportRows.
type BatchExportRow struct {
	Username     string `json:"username"`
	SalePassword string `json:"sale_password"`
	ApiKey       string `json:"api_key"`
	Group        string `json:"group"`
	BatchId      string `json:"batch_id"`
}

// GetBatchExportRows returns username/password/key/group for all accounts whose
// token bears the given batch_id.
func GetBatchExportRows(batchId string) ([]BatchExportRow, error) {
	var rows []BatchExportRow
	err := DB.Table("tokens").
		Select("users.username, users.sale_password, tokens.key AS api_key, tokens.group, tokens.batch_id").
		Joins("JOIN users ON users.id = tokens.user_id").
		Where("tokens.batch_id = ? AND tokens.deleted_at IS NULL", batchId).
		Scan(&rows).Error
	return rows, err
}

// GetBatchUserIDs returns the distinct user IDs for all accounts with the given batch_id.
func GetBatchUserIDs(batchId string) ([]int, error) {
	var ids []int
	err := DB.Table("tokens").
		Select("DISTINCT user_id").
		Where("batch_id = ? AND deleted_at IS NULL", batchId).
		Pluck("user_id", &ids).Error
	return ids, err
}
