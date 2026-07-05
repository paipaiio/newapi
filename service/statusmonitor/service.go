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

package statusmonitor

import (
	"encoding/json"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

func marshal(v interface{}) (string, error) {
	b, err := json.Marshal(v)
	return string(b), err
}

func purgeSamples(before int64) error {
	return model.PurgeMonitorSamples(before)
}

// Start 启动探测循环（仅 master 节点，只启一次）。在 main.go 中 InitLogDB 之后调用。
func Start() {
	startOnce.Do(func() {
		if !common.IsMasterNode {
			return
		}
		go probeLoop()
	})
}

// ---------- 供 controller 使用的访问器 ----------

// CurrentStatus 返回最新状态快照（可能为空 map）。
func CurrentStatus() map[string]interface{} {
	d := current.get()
	if d == nil {
		return map[string]interface{}{}
	}
	return d
}

// SubscribeSSE 注册一个 SSE 客户端 channel，返回 channel 和注销函数。
func SubscribeSSE() (chan string, func()) {
	ch := addSSEClient()
	return ch, func() { removeSSEClient(ch) }
}

// CurrentStatusPayload 返回当前状态的 JSON 字符串（用于 SSE 首帧）。
func CurrentStatusPayload() (string, bool) {
	d := current.get()
	if d == nil {
		return "", false
	}
	s, err := marshal(d)
	if err != nil {
		return "", false
	}
	return s, true
}

// AdminMetrics 返回管理员流量指标（含 RPM/tokens/花费）。
func AdminMetrics() map[string]interface{} {
	_, adm := getMetrics(common.GetTimestamp())
	return adm
}

// GroupsForAdmin 返回分组配置列表（管理页用）。
func GroupsForAdmin() []map[string]interface{} {
	eff := effectiveGroups()
	keys := make([]string, 0, len(eff))
	for k := range eff {
		keys = append(keys, k)
	}
	sortGroups(keys, eff)
	out := make([]map[string]interface{}, 0, len(eff))
	for _, g := range keys {
		i := eff[g]
		out = append(out, map[string]interface{}{
			"key": g, "display": i.Display, "category": i.Category,
			"enabled": i.Enabled, "model": i.Model, "models": i.Models,
		})
	}
	return out
}

func sortGroups(keys []string, eff map[string]*effGroup) {
	for i := 0; i < len(keys); i++ {
		for j := i + 1; j < len(keys); j++ {
			a, b := eff[keys[i]], eff[keys[j]]
			less := false
			if a.Category != b.Category {
				less = a.Category < b.Category
			} else if a.Display != b.Display {
				less = a.Display < b.Display
			} else {
				less = keys[i] < keys[j]
			}
			if !less {
				keys[i], keys[j] = keys[j], keys[i]
			}
		}
	}
}

// AddAnnotation 添加一条公告，返回最新列表。
func AddAnnotation(typ, title, date, body string) []map[string]interface{} {
	metaMu.Lock()
	defer metaMu.Unlock()
	m := LoadMeta()
	if typ == "" {
		typ = "info"
	}
	if date == "" {
		date = timeNowDate()
	}
	ann := map[string]interface{}{
		"id": randHex(6), "ts": common.GetTimestamp(), "date": date,
		"type": typ, "title": truncate(title, 160), "body": truncate(body, 2000),
	}
	m.Annotations = append([]map[string]interface{}{ann}, m.Annotations...)
	if len(m.Annotations) > 50 {
		m.Annotations = m.Annotations[:50]
	}
	_ = SaveMeta(m)
	return m.Annotations
}

// DeleteAnnotation 删除指定 id 的公告，返回最新列表。
func DeleteAnnotation(id string) []map[string]interface{} {
	metaMu.Lock()
	defer metaMu.Unlock()
	m := LoadMeta()
	kept := m.Annotations[:0]
	for _, a := range m.Annotations {
		if a["id"] != id {
			kept = append(kept, a)
		}
	}
	m.Annotations = kept
	_ = SaveMeta(m)
	return m.Annotations
}

// UpdateGroupConfig 更新分组配置（enabled/model/display），返回最新 config。
func UpdateGroupConfig(patch map[string]map[string]interface{}, titleSub map[string]string) MetaConfig {
	metaMu.Lock()
	defer metaMu.Unlock()
	m := LoadMeta()
	if m.Config.Groups == nil {
		m.Config.Groups = map[string]map[string]interface{}{}
	}
	for k, v := range titleSub {
		switch k {
		case "title":
			m.Config.Title = v
		case "subtitle":
			m.Config.Subtitle = v
		case "lang":
			m.Config.Lang = v
		}
	}
	for gk, gv := range patch {
		gk = safeKey(gk)
		if gk == "" {
			continue
		}
		slot := m.Config.Groups[gk]
		if slot == nil {
			slot = map[string]interface{}{}
		}
		if v, ok := gv["enabled"]; ok {
			slot["enabled"] = toBool(v)
		}
		if v, ok := gv["model"].(string); ok && v != "" {
			slot["model"] = truncate(v, 191)
		}
		if v, ok := gv["display"].(string); ok {
			slot["display"] = truncate(v, 80)
		}
		m.Config.Groups[gk] = slot
	}
	_ = SaveMeta(m)
	return m.Config
}

func toBool(v interface{}) bool {
	switch x := v.(type) {
	case bool:
		return x
	case string:
		return x == "true" || x == "1"
	default:
		return false
	}
}

func timeNowDate() string {
	return time.Now().Format("2006-01-02")
}
