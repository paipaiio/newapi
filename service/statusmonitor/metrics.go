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
	"sort"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

// 缓存的输入 token 占比等指标从 logs 表聚合。JSON_VALID 保护 other 为空/非法的行
// （否则 JSON_EXTRACT 报错会中断整个聚合）。type 2 == consume，type 5 == error。

func rate(a, b int) interface{} {
	if b == 0 {
		return nil
	}
	return round(100.0*float64(a)/float64(b), 2)
}

func pctile(vals []int, p float64) interface{} {
	if len(vals) == 0 {
		return nil
	}
	sort.Ints(vals)
	k := float64(len(vals)-1) * p
	f := int(k)
	if f+1 < len(vals) {
		return int(float64(vals[f]) + (float64(vals[f+1])-float64(vals[f]))*(k-float64(f)) + 0.5)
	}
	return vals[f]
}

type aggRow struct {
	G      string
	Reqs   int
	Errs   int
	Pt     int
	Cot    int
	Cread  int
	Cwrite int
	Quota  int
}

func aggRows(since int64) []aggRow {
	var rows []aggRow
	sql := "SELECT IFNULL(NULLIF(`group`,''),'(default)') g," +
		"SUM(`type`=2) reqs,SUM(`type`=5) errs," +
		"SUM(IF(`type`=2,prompt_tokens,0)) pt,SUM(IF(`type`=2,completion_tokens,0)) cot," +
		"SUM(IF(`type`=2 AND JSON_VALID(other),CAST(JSON_UNQUOTE(JSON_EXTRACT(other,'$.cache_tokens')) AS SIGNED),0)) cread," +
		"SUM(IF(`type`=2 AND JSON_VALID(other),CAST(JSON_UNQUOTE(JSON_EXTRACT(other,'$.cache_creation_tokens')) AS SIGNED),0)) cwrite," +
		"SUM(IF(`type`=2,quota,0)) quota " +
		"FROM logs WHERE `type` IN (2,5) AND created_at>=? GROUP BY g"
	model.LOG_DB.Raw(sql, since).Scan(&rows)
	return rows
}

func frtVals(since int64) map[string][]int {
	type r struct {
		G   string
		Frt int
	}
	var rows []r
	sql := "SELECT IFNULL(NULLIF(`group`,''),'(default)') g," +
		"CAST(JSON_UNQUOTE(JSON_EXTRACT(other,'$.frt')) AS SIGNED) frt " +
		"FROM logs WHERE `type`=2 AND created_at>=? AND JSON_VALID(other) AND JSON_EXTRACT(other,'$.frt') IS NOT NULL"
	model.LOG_DB.Raw(sql, since).Scan(&rows)
	out := map[string][]int{}
	for _, x := range rows {
		if x.Frt < 0 {
			continue
		}
		out[x.G] = append(out[x.G], x.Frt)
	}
	return out
}

func shape(a aggRow, mins float64) map[string]interface{} {
	tokens := a.Pt + a.Cot
	var rpm, tpm interface{}
	if mins > 0 {
		rpm = round(float64(a.Reqs)/mins, 2)
		tpm = int(float64(tokens)/mins + 0.5)
	}
	return map[string]interface{}{
		"reqs": a.Reqs, "errors": a.Errs, "rpm": rpm,
		"prompt_tokens": a.Pt, "completion_tokens": a.Cot, "tokens": tokens, "tpm": tpm,
		"cache_read": a.Cread, "cache_write": a.Cwrite,
		"cache_hit": rate(a.Cread, a.Pt), "success": rate(a.Reqs, a.Reqs+a.Errs),
		"spend_usd": round(float64(a.Quota)/quotaPerUnit, 4),
	}
}

// buildMetrics 单趟扫 logs 表 -> per-group + overall 的 1h/24h 指标。
func buildMetrics(now int64) (pub map[string]interface{}, adm map[string]interface{}) {
	wins := map[string]int64{"1h": 3600, "24h": 86400}
	type winData struct {
		groups map[string]aggRow
		total  aggRow
		mins   float64
	}
	W := map[string]*winData{}
	for wk, ws := range wins {
		wd := &winData{groups: map[string]aggRow{}, mins: float64(ws) / 60.0}
		for _, r := range aggRows(now - ws) {
			wd.groups[r.G] = r
			wd.total.Reqs += r.Reqs
			wd.total.Errs += r.Errs
			wd.total.Pt += r.Pt
			wd.total.Cot += r.Cot
			wd.total.Cread += r.Cread
			wd.total.Cwrite += r.Cwrite
			wd.total.Quota += r.Quota
		}
		W[wk] = wd
	}
	// TTFT 分位（最近一小时）
	lat := frtVals(now - 3600)
	var allv []int
	for _, vs := range lat {
		allv = append(allv, vs...)
	}
	ttft := func(g string) (interface{}, interface{}) {
		if vs, ok := lat[g]; ok {
			return pctile(vs, 0.5), pctile(vs, 0.95)
		}
		return nil, nil
	}

	adm = map[string]interface{}{"updated": now, "windows": map[string]interface{}{}}
	admWins := adm["windows"].(map[string]interface{})
	for wk := range wins {
		g := map[string]interface{}{}
		for k, v := range W[wk].groups {
			g[k] = shape(v, W[wk].mins)
		}
		admWins[wk] = map[string]interface{}{"overall": shape(W[wk].total, W[wk].mins), "groups": g}
	}

	// public: 24h cache_hit + success, 1h TTFT
	p50, p95 := pctile(allv, 0.5), pctile(allv, 0.95)
	a24 := admWins["24h"].(map[string]interface{})
	pubGroups := map[string]interface{}{}
	for g, mv := range a24["groups"].(map[string]interface{}) {
		m := mv.(map[string]interface{})
		t50, t95 := ttft(g)
		pubGroups[g] = map[string]interface{}{"cache_hit": m["cache_hit"], "success": m["success"], "ttft_p50": t50, "ttft_p95": t95}
	}
	o := a24["overall"].(map[string]interface{})
	pubOverall := map[string]interface{}{"cache_hit": o["cache_hit"], "success": o["success"], "ttft_p50": p50, "ttft_p95": p95}
	pub = map[string]interface{}{"overall": pubOverall, "groups": pubGroups}
	return pub, adm
}

func getMetrics(now int64) (pub map[string]interface{}, adm map[string]interface{}) {
	metricsMu.Lock()
	defer metricsMu.Unlock()
	if now-metricsAt >= metricsTTL {
		func() {
			defer func() { recover() }() // 保留上一份好快照
			p, a := buildMetrics(now)
			metricsPub, metricsAdm, metricsAt = p, a, now
		}()
	}
	return metricsPub, metricsAdm
}

// UserCacheMetrics 返回某用户自己的缓存命中指标（24h/7d/30d），带短 TTL。
func UserCacheMetrics(uid int) map[string]interface{} {
	now := common.GetTimestamp()
	userCacheMu.Lock()
	if e, ok := userCache[uid]; ok && now-e.ts < 60 {
		userCacheMu.Unlock()
		return e.data
	}
	userCacheMu.Unlock()

	out := map[string]interface{}{"updated": now, "windows": map[string]interface{}{}}
	wins := []struct {
		k string
		s int64
	}{{"24h", 86400}, {"7d", 7 * 86400}, {"30d", 30 * 86400}}
	ws := out["windows"].(map[string]interface{})
	for _, w := range wins {
		var r struct {
			Reqs   int
			Pt     int
			Cot    int
			Cread  int
			Cwrite int
		}
		sql := "SELECT SUM(`type`=2) reqs," +
			"SUM(IF(`type`=2,prompt_tokens,0)) pt,SUM(IF(`type`=2,completion_tokens,0)) cot," +
			"SUM(IF(`type`=2 AND JSON_VALID(other),CAST(JSON_UNQUOTE(JSON_EXTRACT(other,'$.cache_tokens')) AS SIGNED),0)) cread," +
			"SUM(IF(`type`=2 AND JSON_VALID(other),CAST(JSON_UNQUOTE(JSON_EXTRACT(other,'$.cache_creation_tokens')) AS SIGNED),0)) cwrite " +
			"FROM logs WHERE user_id=? AND `type`=2 AND created_at>=?"
		model.LOG_DB.Raw(sql, uid, now-w.s).Scan(&r)
		ws[w.k] = map[string]interface{}{
			"reqs": r.Reqs, "prompt_tokens": r.Pt, "completion_tokens": r.Cot,
			"cache_read": r.Cread, "cache_write": r.Cwrite, "cache_hit": rate(r.Cread, r.Pt),
		}
	}
	userCacheMu.Lock()
	if len(userCache) > 5000 {
		userCache = map[int]userCacheEntry{}
	}
	userCache[uid] = userCacheEntry{ts: now, data: out}
	userCacheMu.Unlock()
	return out
}
