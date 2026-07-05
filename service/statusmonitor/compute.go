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
	"crypto/rand"
	"encoding/hex"
	"sort"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
)

// ---------- SSE hub ----------
var (
	sseClients   = map[chan string]struct{}{}
	sseClientsMu sync.Mutex
)

func addSSEClient() chan string {
	ch := make(chan string, 8)
	sseClientsMu.Lock()
	sseClients[ch] = struct{}{}
	sseClientsMu.Unlock()
	return ch
}
func removeSSEClient(ch chan string) {
	sseClientsMu.Lock()
	delete(sseClients, ch)
	sseClientsMu.Unlock()
}
func broadcast(payload string) {
	sseClientsMu.Lock()
	defer sseClientsMu.Unlock()
	for ch := range sseClients {
		select {
		case ch <- payload:
		default: // 丢掉最旧的过期快照，塞入最新
			select {
			case <-ch:
			default:
			}
			select {
			case ch <- payload:
			default:
			}
		}
	}
}

// ---------- 状态点等级 ----------
var rankMap = map[string]int{"operational": 0, "degraded": 1, "maintenance": 0, "down": 2, "nodata": 0}

func randHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// ---------- 自动事件去抖记录 ----------
// 用 options 表存 last_status / pending（内存态即可，但为跨重启一致放内存 + meta annotations）。
var (
	lastStatus = map[string]string{}
	pending    = map[string]map[string]interface{}{}
	incidentMu sync.Mutex
)

func autoIncidents(curStatus, displayMap map[string]string) {
	incidentMu.Lock()
	defer incidentMu.Unlock()
	type ev struct{ typ, title, body string }
	var events []ev
	for k, nowSt := range curStatus {
		if nowSt == "nodata" || nowSt == "skip" {
			continue
		}
		confirmed, seen := lastStatus[k]
		if !seen {
			lastStatus[k] = nowSt
			delete(pending, k)
			continue
		}
		if nowSt == confirmed {
			delete(pending, k)
			continue
		}
		p := pending[k]
		if p != nil && p["status"] == nowSt {
			p["count"] = p["count"].(int) + 1
		} else {
			p = map[string]interface{}{"status": nowSt, "count": 1}
			pending[k] = p
		}
		if p["count"].(int) >= confirmN {
			downNow := nowSt == "down"
			downPrev := confirmed == "down"
			disp := displayMap[k]
			if disp == "" {
				disp = k
			}
			if downNow && !downPrev {
				events = append(events, ev{"incident", disp + " 服务异常", "检测到该线路连续不可用，系统已自动记录。"})
			} else if downPrev && !downNow {
				events = append(events, ev{"resolved", disp + " 已恢复", "该线路已恢复正常。"})
			}
			lastStatus[k] = nowSt
			delete(pending, k)
		}
	}
	if len(events) > 0 {
		metaMu.Lock()
		m := LoadMeta()
		now := common.GetTimestamp()
		for _, e := range events {
			ann := map[string]interface{}{
				"id": randHex(6), "ts": now, "date": time.Now().Format("2006-01-02"),
				"type": e.typ, "title": truncate(e.title, 160), "body": truncate(e.body, 2000),
			}
			m.Annotations = append([]map[string]interface{}{ann}, m.Annotations...)
		}
		if len(m.Annotations) > 50 {
			m.Annotations = m.Annotations[:50]
		}
		_ = SaveMeta(m)
		metaMu.Unlock()
	}
}

func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) > n {
		return string(r[:n])
	}
	return s
}

// ---------- compute：一次完整状态汇总 ----------
func compute() map[string]interface{} {
	now := common.GetTimestamp()
	gwUp, gwMs := probeGateway()
	gw := "operational"
	if gwUp == 0 {
		gw = "down"
	} else if gwMs > slowMs {
		gw = "degraded"
	}
	eff := effectiveGroups()

	type gs struct {
		status string
		ms     int
		info   *effGroup
	}
	gstat := map[string]*gs{}

	// 采样：网关 + 各启用分组
	insertSample("gateway", now, boolToInt(gwUp == 1), msOr(gwUp == 1, gwMs))
	for grp, info := range eff {
		if !info.Enabled {
			continue
		}
		st, ms, sample := probeGroup(grp, info.Model)
		if st == "skip" {
			continue
		}
		gstat[grp] = &gs{status: st, ms: ms, info: info}
		_ = sample
		up := 0
		if st != "down" {
			up = 1
		}
		insertSample(grp, now, up, ms)
	}
	before := now - retainDays*86400
	_ = purgeSamples(before)

	build := func(comp string) (map[string]interface{}, map[string]interface{}) {
		bars := map[string]interface{}{}
		uptime := map[string]interface{}{}
		for _, w := range windows {
			s, u := series(comp, now, w.span, w.slots)
			bars[w.key] = s
			uptime[w.key] = u
		}
		return bars, uptime
	}

	gb, gu := build("gateway")
	var gwLat interface{}
	if gwUp == 1 {
		gwLat = gwMs
	}
	comps := []map[string]interface{}{{
		"key": "gateway", "group": "core", "category": "网关", "name": "API 网关",
		"desc": "统一接口与智能路由", "status": gw, "latency_ms": gwLat,
		"bars": gb, "uptime": gu, "latency_60m": lat60("gateway", now),
	}}
	worst := gw

	// 确定性公开顺序：category, display, key
	order := make([]string, 0, len(gstat))
	for k := range gstat {
		order = append(order, k)
	}
	sort.Slice(order, func(i, j int) bool {
		a, b := gstat[order[i]].info, gstat[order[j]].info
		if a.Category != b.Category {
			return a.Category < b.Category
		}
		if a.Display != b.Display {
			return a.Display < b.Display
		}
		return order[i] < order[j]
	})

	curStatus := map[string]string{"gateway": gw}
	displayMap := map[string]string{"gateway": "API 网关"}
	for _, grp := range order {
		g := gstat[grp]
		info := g.info
		bb, uu := build(grp)
		curStatus[grp] = g.status
		displayMap[grp] = info.Display
		if rankMap[g.status] > rankMap[worst] {
			worst = g.status
		}
		comps = append(comps, map[string]interface{}{
			"key": grp, "group": "provider", "category": info.Category, "name": info.Display,
			"desc": "检测模型 " + info.Model, "status": g.status, "latency_ms": g.ms, "model": info.Model,
			"bars": bb, "uptime": uu, "latency_60m": lat60(grp, now),
		})
	}

	// 附加公开流量指标
	pub, _ := getMetrics(now)
	if pg, ok := pub["groups"].(map[string]interface{}); ok {
		if ov, ok := pub["overall"].(map[string]interface{}); ok {
			comps[0]["metrics"] = ov
		}
		for i := 1; i < len(comps); i++ {
			if m, ok := pg[comps[i]["key"].(string)]; ok {
				comps[i]["metrics"] = m
			}
		}
	}

	autoIncidents(curStatus, displayMap)

	overallMetrics := map[string]interface{}{}
	if ov, ok := pub["overall"].(map[string]interface{}); ok {
		overallMetrics = ov
	}
	wkeys := make([]string, len(windows))
	for i, w := range windows {
		wkeys[i] = w.key
	}
	return map[string]interface{}{
		"updated":     now,
		"updated_iso": time.Unix(now, 0).UTC().Format("2006-01-02T15:04:05Z"),
		"overall":     worst,
		"windows":     wkeys,
		"metrics":     overallMetrics,
		"components":  comps,
	}
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
func msOr(ok bool, ms int) int {
	if ok {
		return ms
	}
	return -1
}

// ---------- 探测循环 ----------
func probeLoop() {
	for {
		func() {
			defer func() { recover() }()
			st := compute()
			current.set(st)
			if payload, err := marshal(st); err == nil {
				broadcast(payload)
			}
		}()
		time.Sleep(interval * time.Second)
	}
}
