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
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

// gatewayBase 是回环访问自身网关的地址（同进程，走本地端口）。
func gatewayBase() string {
	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}
	return "http://127.0.0.1:" + port
}

var httpClient = &http.Client{Timeout: timeoutSec * time.Second}

// ---------- 监控 token 自建 ----------
func genKey() string {
	b := make([]byte, 36)
	_, _ = rand.Read(b)
	s := base64.StdEncoding.EncodeToString(b)
	s = strings.NewReplacer("+", "", "/", "", "=", "").Replace(s)
	if len(s) > 45 {
		s = s[:45]
	}
	return "mon" + s
}

func monitorToken(group string) string {
	grp := safeKey(group)
	if grp == "" {
		return ""
	}
	tokenMu.Lock()
	if k, ok := tokenCache[grp]; ok {
		tokenMu.Unlock()
		return k
	}
	tokenMu.Unlock()

	name := "__mon_" + grp + "__"
	var existing model.Token
	if err := model.DB.Where("name = ? AND deleted_at IS NULL", name).First(&existing).Error; err == nil && existing.Key != "" {
		tokenMu.Lock()
		tokenCache[grp] = existing.Key
		tokenMu.Unlock()
		return existing.Key
	}
	now := common.GetTimestamp()
	t := model.Token{
		UserId:          monUser,
		Key:             genKey(),
		Status:          1,
		Name:            name,
		CreatedTime:     now,
		AccessedTime:    now,
		ExpiredTime:     -1,
		RemainQuota:     0,
		UnlimitedQuota:  true,
		UsedQuota:       0,
		Group:           group,
		CrossGroupRetry: false,
	}
	if err := model.DB.Create(&t).Error; err != nil {
		return "" // 未确认落库 -> 不缓存，下周期重试
	}
	tokenMu.Lock()
	tokenCache[grp] = t.Key
	tokenMu.Unlock()
	return t.Key
}

// ---------- 探测 ----------
func probeGateway() (up int, ms int) {
	t0 := time.Now()
	req, _ := http.NewRequest("GET", gatewayBase()+"/api/status", nil)
	req.Header.Set("User-Agent", "tt")
	resp, err := httpClient.Do(req)
	el := int(time.Since(t0).Milliseconds())
	if err != nil {
		return 0, el
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(resp.Body, 20000))
	compact := strings.ReplaceAll(string(b), " ", "")
	if resp.StatusCode == 200 && strings.Contains(compact, `"success":true`) {
		return 1, el
	}
	return 0, el
}

// probeGroup 调 /v1/models，验证该分组是否提供指定检测模型。
// 返回 status（operational/degraded/down/skip）、ms、是否可采样。
func probeGroup(group, mdl string) (status string, ms int, sample bool) {
	key := monitorToken(group)
	if key == "" {
		return "skip", 0, false // token 未就绪 -> 本周期不采样
	}
	t0 := time.Now()
	req, _ := http.NewRequest("GET", gatewayBase()+"/v1/models", nil)
	req.Header.Set("Authorization", "Bearer "+key)
	req.Header.Set("User-Agent", "tt")
	resp, err := httpClient.Do(req)
	el := int(time.Since(t0).Milliseconds())
	if err != nil {
		return "down", el, false
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var d struct {
		Data []struct {
			Id string `json:"id"`
		} `json:"data"`
	}
	if json.Unmarshal(body, &d) != nil {
		return "down", el, true
	}
	for _, m := range d.Data {
		if m.Id == mdl {
			if el <= slowMs {
				return "operational", el, true
			}
			return "degraded", el, true
		}
	}
	return "down", el, true // 未提供该模型 -> 不可用
}

// ---------- 样本窗口 ----------
func insertSample(component string, ts int64, up, ms int) {
	if common.UsingSQLite {
		_ = model.InsertMonitorSampleSQLite(component, ts, up, ms)
	} else {
		_ = model.InsertMonitorSample(component, ts, up, ms)
	}
}

func pct(u, t int) interface{} {
	if t == 0 {
		return nil
	}
	return round(100.0*float64(u)/float64(t), 3)
}

func round(f float64, dp int) float64 {
	p := 1.0
	for i := 0; i < dp; i++ {
		p *= 10
	}
	return float64(int64(f*p+0.5)) / p
}

// series 构建某组件某窗口的 bars + 总可用率。
func series(comp string, now, span int64, slots int) ([]map[string]interface{}, interface{}) {
	start := now - span
	binw := float64(span) / float64(slots)
	rows, _ := model.GetMonitorSamples(comp, start)
	type bin struct{ count, up, msSum, msCnt int }
	bins := make([]bin, slots)
	for _, r := range rows {
		i := int(float64(r.Ts-start) / binw)
		if i < 0 {
			i = 0
		}
		if i >= slots {
			i = slots - 1
		}
		bins[i].count++
		bins[i].up += r.Up
		if r.Ms >= 0 {
			bins[i].msSum += r.Ms
			bins[i].msCnt++
		}
	}
	out := make([]map[string]interface{}, 0, slots)
	tot, totup := 0, 0
	for i, b := range bins {
		t0 := start + int64(float64(i)*binw)
		if b.count == 0 {
			out = append(out, map[string]interface{}{"t": t0, "pct": nil, "status": "nodata"})
			continue
		}
		tot += b.count
		totup += b.up
		ratio := float64(b.up) / float64(b.count)
		var avg interface{}
		if b.msCnt > 0 {
			avg = b.msSum / b.msCnt
		}
		st := "operational"
		if ratio < 0.5 {
			st = "down"
		} else if ratio < 0.999 {
			st = "degraded"
		}
		out = append(out, map[string]interface{}{"t": t0, "pct": round(100*ratio, 2), "status": st, "ms": avg})
	}
	return out, pct(totup, tot)
}

func lat60(comp string, now int64) []map[string]interface{} {
	rows, _ := model.GetMonitorSamples(comp, now-3600)
	out := []map[string]interface{}{}
	for _, r := range rows {
		if r.Ms >= 0 {
			out = append(out, map[string]interface{}{"t": r.Ts, "ms": r.Ms})
		}
	}
	return out
}

