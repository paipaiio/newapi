/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

package model

// MonitorSample 存储状态监控的探测样本（网关 + 各分组），用于渲染 uptime bars。
// 每次探测（默认 60s 一次）对每个组件写入一条：up=1 表示可用，ms 为响应耗时。
// 存在 LOG_DB（与 logs 表同库），保留窗口由服务侧定期清理。
type MonitorSample struct {
	Component string `gorm:"type:varchar(64);primaryKey;autoIncrement:false;index:idx_ms_comp_ts,priority:1"`
	Ts        int64  `gorm:"primaryKey;autoIncrement:false;index:idx_ms_comp_ts,priority:2"`
	Up        int    `gorm:"default:0"`
	Ms        int    `gorm:"default:0"` // -1 表示无有效耗时（探测失败）
}

func (MonitorSample) TableName() string { return "monitor_samples" }

// InsertMonitorSample 写入/覆盖一条样本（同 component+ts 覆盖）。
func InsertMonitorSample(component string, ts int64, up int, ms int) error {
	return LOG_DB.Exec(
		"INSERT INTO monitor_samples (component, ts, up, ms) VALUES (?, ?, ?, ?) "+
			"ON DUPLICATE KEY UPDATE up=VALUES(up), ms=VALUES(ms)",
		component, ts, up, ms).Error
}

// InsertMonitorSampleSQLite SQLite 版本的 upsert（本地开发用）。
func InsertMonitorSampleSQLite(component string, ts int64, up int, ms int) error {
	return LOG_DB.Exec(
		"INSERT OR REPLACE INTO monitor_samples (component, ts, up, ms) VALUES (?, ?, ?, ?)",
		component, ts, up, ms).Error
}

// MonitorSampleRow 是查询结果行。
type MonitorSampleRow struct {
	Ts int64
	Up int
	Ms int
}

// GetMonitorSamples 返回某组件在 [since, now] 内的样本，按 ts 升序。
func GetMonitorSamples(component string, since int64) ([]MonitorSampleRow, error) {
	var rows []MonitorSampleRow
	err := LOG_DB.Model(&MonitorSample{}).
		Select("ts, up, ms").
		Where("component = ? AND ts >= ?", component, since).
		Order("ts asc").
		Scan(&rows).Error
	return rows, err
}

// PurgeMonitorSamples 删除早于 before 的样本。
func PurgeMonitorSamples(before int64) error {
	return LOG_DB.Where("ts < ?", before).Delete(&MonitorSample{}).Error
}
