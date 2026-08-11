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

// Package statusmonitor 是从旧的独立 python 服务 tt-monitor/api.py 迁移进 new-api
// 二进制内的服务状态监控。它：
//   - 发现启用的分组及其模型；
//   - 探测网关 + 每个受监控分组（调 /v1/models 验证检测模型在不在，不消耗额度）；
//   - 自建每分组一个监控 token；
//   - 保存每组件的样本历史（monitor_samples 表），渲染多窗口 uptime bars；
//   - 自动去抖记录事件（连续 CONFIRM_N 个周期才确认翻转）；
//   - 通过 SSE 向状态页推送实时更新；
//   - 从 logs 表聚合流量指标（缓存命中/成功率/TTFT/花费）；
//   - 提供每用户缓存命中指标（每人只看自己的）。
//
// 直接复用 new-api 的 DB 连接与鉴权中间件，不再 docker exec mysql，也不再 replay session。
package statusmonitor

import (
	"encoding/json"
	"sort"
	"strings"
	"sync"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

const (
	metaOptionKey = "tt_monitor.meta" // config + annotations 存 options 表的这个键（整块 JSON）
	interval      = 60                // 探测周期（秒）
	slowMs        = 1500              // 超过则判为 degraded
	retainDays    = 32                // 样本保留天数
	timeoutSec    = 10                // 单次探测超时
	confirmN      = 3                 // 连续 N 个周期才确认状态翻转（去抖）
	monUser       = 1                 // 自建监控 token 的归属用户
	metricsTTL    = 300               // 流量指标缓存秒数
	quotaPerUnit  = 500000.0          // 500000 额度 == $1
)

// window: key, span 秒, bar 数
type window struct {
	key   string
	span  int64
	slots int
}

var windows = []window{
	{"90m", 90 * 60, 90},
	{"24h", 24 * 3600, 96},
	{"7d", 7 * 86400, 84},
	{"30d", 30 * 86400, 90},
}

// channel type -> 展示分类
var catFull = map[int]string{1: "OpenAI 兼容", 3: "OpenAI (Azure)", 14: "Claude (Anthropic)", 24: "Gemini (Google)", 25: "Gemini (Google)"}

func category(t int) string {
	if c, ok := catFull[t]; ok {
		return c
	}
	return "其他线路"
}

// ---------- 全局状态 ----------
var (
	current     atomicStatus          // 最新状态快照
	tokenCache  = map[string]string{} // group -> 监控 token key
	tokenMu     sync.Mutex
	metricsMu   sync.Mutex
	metricsAt   int64
	metricsPub  = map[string]interface{}{"overall": map[string]interface{}{}, "groups": map[string]interface{}{}}
	metricsAdm  = map[string]interface{}{}
	userCache   = map[int]userCacheEntry{}
	userCacheMu sync.Mutex
	startOnce   sync.Once
)

type atomicStatus struct {
	mu   sync.RWMutex
	data map[string]interface{}
}

func (a *atomicStatus) get() map[string]interface{} {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.data
}
func (a *atomicStatus) set(d map[string]interface{}) {
	a.mu.Lock()
	a.data = d
	a.mu.Unlock()
}

type userCacheEntry struct {
	ts   int64
	data map[string]interface{}
}

// ---------- meta（config + annotations）存 options 表 ----------
type Meta struct {
	Config      MetaConfig               `json:"config"`
	Annotations []map[string]interface{} `json:"annotations"`
}
type MetaConfig struct {
	Title    string                            `json:"title"`
	Subtitle string                            `json:"subtitle"`
	Lang     string                            `json:"lang"`
	Groups   map[string]map[string]interface{} `json:"groups"`
}

func defaultMeta() Meta {
	return Meta{
		Config: MetaConfig{
			Title:    "服务状态",
			Subtitle: "TUFTech AI 网关 · 服务可用性实时监控",
			Lang:     "zh",
			Groups:   map[string]map[string]interface{}{},
		},
		Annotations: []map[string]interface{}{},
	}
}

var metaMu sync.Mutex

// LoadMeta 从 options 表读取整块 meta JSON。
func LoadMeta() Meta {
	raw := common.OptionMap[metaOptionKey]
	if raw == "" {
		return defaultMeta()
	}
	var m Meta
	if err := json.Unmarshal([]byte(raw), &m); err != nil {
		return defaultMeta()
	}
	if m.Config.Groups == nil {
		m.Config.Groups = map[string]map[string]interface{}{}
	}
	if m.Annotations == nil {
		m.Annotations = []map[string]interface{}{}
	}
	return m
}

// SaveMeta 把整块 meta 写回 options 表（热加载）。
func SaveMeta(m Meta) error {
	b, err := json.Marshal(m)
	if err != nil {
		return err
	}
	return model.UpdateOption(metaOptionKey, string(b))
}

func safeKey(s string) string {
	var b strings.Builder
	for _, ch := range s {
		if (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch == '_' || ch == '-' {
			b.WriteRune(ch)
		}
	}
	return b.String()
}

// ---------- 分组发现 ----------
type groupInfo struct {
	Models   []string
	Type     int
	Category string
}

// discoverGroups 从 abilities+channels 联表得到启用分组及其模型/类型。
func discoverGroups() map[string]*groupInfo {
	type row struct {
		Group string
		Model string
		Type  int
	}
	var rows []row
	model.DB.Table("abilities a").
		Select("a.`group` as `group`, a.model as model, c.type as type").
		Joins("JOIN channels c ON c.id = a.channel_id").
		Where("a.enabled = ? AND c.status = ?", true, 1).
		Scan(&rows)
	type acc struct {
		models map[string]struct{}
		types  map[int]int
	}
	tmp := map[string]*acc{}
	for _, r := range rows {
		a := tmp[r.Group]
		if a == nil {
			a = &acc{models: map[string]struct{}{}, types: map[int]int{}}
			tmp[r.Group] = a
		}
		a.models[r.Model] = struct{}{}
		a.types[r.Type]++
	}
	out := map[string]*groupInfo{}
	for grp, a := range tmp {
		var ms []string
		for m := range a.models {
			ms = append(ms, m)
		}
		sort.Strings(ms)
		bestType, bestN := 0, -1
		for t, n := range a.types {
			if n > bestN {
				bestType, bestN = t, n
			}
		}
		out[grp] = &groupInfo{Models: ms, Type: bestType, Category: category(bestType)}
	}
	return out
}

func pickDefaultModel(models []string) string {
	if len(models) == 0 {
		return ""
	}
	pref := []string{"haiku", "mini", "flash-lite", "lite", "flash", "fast", "8b"}
	for _, p := range pref {
		for _, m := range models {
			if strings.Contains(strings.ToLower(m), p) {
				return m
			}
		}
	}
	return models[0]
}

// effGroup 是合并发现结果 + 保存的 per-group 配置后的有效分组。
type effGroup struct {
	Enabled  bool
	Model    string
	Models   []string
	Type     int
	Category string
	Display  string
}

func effectiveGroups() map[string]*effGroup {
	disc := discoverGroups()
	cfg := LoadMeta().Config.Groups
	out := map[string]*effGroup{}
	for grp, d := range disc {
		c := cfg[grp]
		mdl := ""
		if c != nil {
			if v, ok := c["model"].(string); ok {
				mdl = v
			}
		}
		if mdl == "" {
			mdl = pickDefaultModel(d.Models)
		}
		// stale model fallback
		found := false
		for _, m := range d.Models {
			if m == mdl {
				found = true
				break
			}
		}
		if !found {
			mdl = pickDefaultModel(d.Models)
		}
		enabled := true
		display := grp
		if c != nil {
			if v, ok := c["enabled"].(bool); ok {
				enabled = v
			}
			if v, ok := c["display"].(string); ok && strings.TrimSpace(v) != "" {
				display = strings.TrimSpace(v)
			}
		}
		out[grp] = &effGroup{Enabled: enabled, Model: mdl, Models: d.Models, Type: d.Type, Category: d.Category, Display: display}
	}
	return out
}
