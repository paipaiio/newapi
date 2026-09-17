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

// BatchExportRow is one row returned by GetBatchExportRows.
type BatchExportRow struct {
	UserId        int      `json:"-"`
	Username      string   `json:"username"`
	Password      string   `json:"password"` // 售卖明文密码（users.sale_password）
	ApiKey        string   `json:"api_key"`
	Group         string   `json:"group"`
	BatchId       string   `json:"batch_id"`
	VisibleGroups []string `json:"visible_groups"`
}

// GetBatchExportRows returns username/password/key/group/visible_groups for all
// accounts whose token bears the given batch_id. VisibleGroups 从 users.setting
// JSON 中在 Go 侧水合，避免依赖数据库特定的 JSON 函数。
func GetBatchExportRows(batchId string) ([]BatchExportRow, error) {
	var rows []BatchExportRow
	err := DB.Table("tokens").
		Select("users.id AS user_id, users.username, users.sale_password AS password, tokens.`key` AS api_key, tokens.`group`, tokens.batch_id").
		Joins("JOIN users ON users.id = tokens.user_id").
		Where("tokens.batch_id = ? AND tokens.deleted_at IS NULL", batchId).
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return rows, nil
	}
	ids := make([]int, 0, len(rows))
	for i := range rows {
		ids = append(ids, rows[i].UserId)
		rows[i].ApiKey = "sk-" + rows[i].ApiKey
	}
	var users []User
	if err := DB.Select("id", "setting").Where("id IN ?", ids).Find(&users).Error; err != nil {
		return rows, nil // 设置读取失败不阻塞导出主体
	}
	settings := make(map[int][]string, len(users))
	for _, u := range users {
		settings[u.Id] = u.GetSetting().VisibleGroups
	}
	for i := range rows {
		rows[i].VisibleGroups = settings[rows[i].UserId]
	}
	return rows, nil
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
