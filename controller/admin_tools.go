/*
Copyright (C) 2023-2026 QuantumNous

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
package controller

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

// ─────────────────────────────────────────────
//  Monitor SSE
// ─────────────────────────────────────────────

type MonitorTopModel struct {
	Model string  `json:"model"`
	Count int64   `json:"count"`
	Quota float64 `json:"quota"`
}

type MonitorStats struct {
	TS          int64             `json:"ts"`
	TotalUSD    float64           `json:"total_usd"`
	UsedUSD     float64           `json:"used_usd"`
	RemainUSD   float64           `json:"remain_usd"`
	ReqLast5Min int64             `json:"req_last_5min"`
	ReqLast1H   int64             `json:"req_last_1h"`
	ActiveUsers int64             `json:"active_users_24h"`
	TopModels   []MonitorTopModel `json:"top_models"`
}

func collectMonitorStats() MonitorStats {
	now := time.Now().Unix()
	s := MonitorStats{TS: now}

	type quotaRow struct {
		Remain int64
		Used   int64
	}
	var qr quotaRow
	model.DB.Model(&model.User{}).
		Select("COALESCE(SUM(quota),0) as remain, COALESCE(SUM(used_quota),0) as used").
		Where("status = ?", common.UserStatusEnabled).
		Row().Scan(&qr.Remain, &qr.Used)

	unit := float64(common.QuotaPerUnit)
	s.RemainUSD = float64(qr.Remain) / unit
	s.UsedUSD = float64(qr.Used) / unit
	s.TotalUSD = s.RemainUSD + s.UsedUSD

	model.DB.Model(&model.Log{}).
		Where("created_at > ? AND type = ?", now-300, model.LogTypeConsume).
		Count(&s.ReqLast5Min)
	model.DB.Model(&model.Log{}).
		Where("created_at > ? AND type = ?", now-3600, model.LogTypeConsume).
		Count(&s.ReqLast1H)

	model.DB.Model(&model.Log{}).
		Where("created_at > ? AND type = ?", now-86400, model.LogTypeConsume).
		Distinct("user_id").Count(&s.ActiveUsers)

	var rows []struct {
		ModelName string
		Cnt       int64
		Quota     int64
	}
	model.DB.Model(&model.Log{}).
		Select("model_name, COUNT(*) as cnt, COALESCE(SUM(quota),0) as quota").
		Where("created_at > ? AND type = ?", now-86400, model.LogTypeConsume).
		Group("model_name").Order("cnt DESC").Limit(10).
		Scan(&rows)
	for _, r := range rows {
		s.TopModels = append(s.TopModels, MonitorTopModel{
			Model: r.ModelName,
			Count: r.Cnt,
			Quota: float64(r.Quota) / unit,
		})
	}
	return s
}

func AdminMonitorSSE(c *gin.Context) {
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")
	c.Writer.WriteHeader(200)

	sendEvent := func(v interface{}) bool {
		b, _ := json.Marshal(v)
		if _, err := fmt.Fprintf(c.Writer, "data: %s\n\n", b); err != nil {
			return false
		}
		c.Writer.Flush()
		return true
	}

	if !sendEvent(collectMonitorStats()) {
		return
	}

	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	ctx := c.Request.Context()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if !sendEvent(collectMonitorStats()) {
				return
			}
		}
	}
}

// ─────────────────────────────────────────────
//  First Token Stability SSE
// ─────────────────────────────────────────────

type FirstTokenConfig struct {
	Key         string   `json:"key"`
	BaseURL     string   `json:"base_url"`
	Model       string   `json:"model"`
	API         string   `json:"api"`
	MaxTokens   int      `json:"max_tokens"`
	Concurrency int      `json:"concurrency"`
	Requests    int      `json:"requests"`
	Temperature float64  `json:"temperature"`
	Prompts     []string `json:"prompts"`
}

type FirstTokenEvent struct {
	Type        string  `json:"type"`
	Index       int     `json:"index,omitempty"`
	Status      string  `json:"status,omitempty"`
	Sent        int64   `json:"sent"`
	OK          int64   `json:"ok"`
	Fail        int64   `json:"fail"`
	FirstMs     int64   `json:"first_ms,omitempty"`
	TotalMs     int64   `json:"total_ms,omitempty"`
	FirstToken  string  `json:"first_token,omitempty"`
	Error       string  `json:"error,omitempty"`
	AvgMs       float64 `json:"avg_ms,omitempty"`
	P50Ms       int64   `json:"p50_ms,omitempty"`
	P95Ms       int64   `json:"p95_ms,omitempty"`
	MinMs       int64   `json:"min_ms,omitempty"`
	MaxMs       int64   `json:"max_ms,omitempty"`
	StddevMs    float64 `json:"stddev_ms,omitempty"`
	Elapsed     float64 `json:"elapsed"`
	Concurrency int     `json:"concurrency,omitempty"`
	Message     string  `json:"msg,omitempty"`
}

type firstTokenResult struct {
	index      int
	ok         bool
	firstMs    int64
	totalMs    int64
	firstToken string
	errSumm    string
}

func firstTokenEndpoint(cfg FirstTokenConfig) string {
	base := strings.TrimRight(cfg.BaseURL, "/")
	if cfg.API == "messages" {
		return base + "/v1/messages"
	}
	return base + "/v1/chat/completions"
}

func firstTokenPayload(cfg FirstTokenConfig, prompt string) []byte {
	if cfg.API == "messages" {
		body := map[string]interface{}{
			"model":       cfg.Model,
			"max_tokens":  cfg.MaxTokens,
			"temperature": cfg.Temperature,
			"stream":      true,
			"messages": []interface{}{
				map[string]interface{}{"role": "user", "content": prompt},
			},
		}
		b, _ := json.Marshal(body)
		return b
	}
	body := map[string]interface{}{
		"model":       cfg.Model,
		"max_tokens":  cfg.MaxTokens,
		"temperature": cfg.Temperature,
		"stream":      true,
		"messages": []interface{}{
			map[string]interface{}{"role": "user", "content": prompt},
		},
	}
	b, _ := json.Marshal(body)
	return b
}

func firstTokenExtractText(api string, data []byte) string {
	var m map[string]interface{}
	if json.Unmarshal(data, &m) != nil {
		return ""
	}
	if api == "messages" {
		if delta, ok := m["delta"].(map[string]interface{}); ok {
			if text, ok := delta["text"].(string); ok {
				return text
			}
		}
		return ""
	}
	choices, _ := m["choices"].([]interface{})
	if len(choices) == 0 {
		return ""
	}
	choice, _ := choices[0].(map[string]interface{})
	delta, _ := choice["delta"].(map[string]interface{})
	if text, ok := delta["content"].(string); ok {
		return text
	}
	if text, ok := delta["reasoning_content"].(string); ok {
		return text
	}
	return ""
}

func firstTokenOne(ctx context.Context, cfg FirstTokenConfig, endpoint string, index int, prompt string) firstTokenResult {
	started := time.Now()
	req, err := http.NewRequestWithContext(ctx, "POST", endpoint, bytes.NewReader(firstTokenPayload(cfg, prompt)))
	if err != nil {
		return firstTokenResult{index: index, ok: false, errSumm: err.Error()}
	}
	req.Header.Set("Authorization", "Bearer "+cfg.Key)
	req.Header.Set("Content-Type", "application/json")
	if cfg.API == "messages" {
		req.Header.Set("anthropic-version", "2023-06-01")
	}
	client := &http.Client{Timeout: 90 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return firstTokenResult{index: index, ok: false, totalMs: time.Since(started).Milliseconds(), errSumm: "[conn] " + truncate(err.Error(), 120)}
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		return firstTokenResult{index: index, ok: false, totalMs: time.Since(started).Milliseconds(), errSumm: burnExtractErrSummary(resp.StatusCode, body)}
	}

	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(line, "data: "))
		if data == "" || data == "[DONE]" {
			continue
		}
		text := firstTokenExtractText(cfg.API, []byte(data))
		if text == "" {
			continue
		}
		ms := time.Since(started).Milliseconds()
		return firstTokenResult{index: index, ok: true, firstMs: ms, totalMs: ms, firstToken: text}
	}
	if err := scanner.Err(); err != nil && ctx.Err() == nil {
		return firstTokenResult{index: index, ok: false, totalMs: time.Since(started).Milliseconds(), errSumm: truncate(err.Error(), 120)}
	}
	return firstTokenResult{index: index, ok: false, totalMs: time.Since(started).Milliseconds(), errSumm: "no non-empty token received"}
}

func firstTokenStats(values []int64) (avg float64, p50, p95, minV, maxV int64, stddev float64) {
	if len(values) == 0 {
		return
	}
	sorted := append([]int64(nil), values...)
	for i := 0; i < len(sorted); i++ {
		for j := i + 1; j < len(sorted); j++ {
			if sorted[j] < sorted[i] {
				sorted[i], sorted[j] = sorted[j], sorted[i]
			}
		}
	}
	minV, maxV = sorted[0], sorted[len(sorted)-1]
	var sum int64
	for _, v := range sorted {
		sum += v
	}
	avg = float64(sum) / float64(len(sorted))
	idx := func(p int) int {
		i := (len(sorted)*p + 99) / 100
		if i <= 0 {
			return 0
		}
		if i > len(sorted) {
			return len(sorted) - 1
		}
		return i - 1
	}
	p50, p95 = sorted[idx(50)], sorted[idx(95)]
	var variance float64
	for _, v := range sorted {
		d := float64(v) - avg
		variance += d * d
	}
	stddev = variance / float64(len(sorted))
	// avoid importing math just for sqrt precision? Newton iteration is enough.
	if stddev > 0 {
		x := stddev
		for i := 0; i < 8; i++ {
			x = 0.5 * (x + stddev/x)
		}
		stddev = x
	}
	return
}

func AdminFirstTokenSSE(c *gin.Context) {
	var cfg FirstTokenConfig
	if err := c.ShouldBindJSON(&cfg); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	if cfg.BaseURL == "" {
		cfg.BaseURL = "http://127.0.0.1:3000"
	}
	if cfg.API == "" {
		cfg.API = "chat"
	}
	if cfg.MaxTokens <= 0 {
		cfg.MaxTokens = 128
	}
	if cfg.Requests <= 0 || cfg.Requests > 200 {
		cfg.Requests = 30
	}
	if cfg.Concurrency <= 0 || cfg.Concurrency > 50 {
		cfg.Concurrency = 5
	}
	if len(cfg.Prompts) == 0 {
		cfg.Prompts = []string{"请用一句话回答：今天适合做什么？"}
	}

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")
	c.Writer.WriteHeader(200)

	sendEvt := func(evt FirstTokenEvent) bool {
		b, _ := json.Marshal(evt)
		_, err := fmt.Fprintf(c.Writer, "data: %s\n\n", b)
		c.Writer.Flush()
		return err == nil
	}

	if cfg.Key == "" || cfg.Model == "" {
		sendEvt(FirstTokenEvent{Type: "error", Message: "请填写 API Key 和模型名"})
		return
	}

	endpoint := firstTokenEndpoint(cfg)
	ctx, cancel := context.WithCancel(c.Request.Context())
	defer cancel()
	results := make(chan firstTokenResult, cfg.Concurrency)
	jobs := make(chan int)
	var sent, okCount, failCount atomic.Int64
	latencies := make([]int64, 0, cfg.Requests)
	var latMu sync.Mutex
	t0 := time.Now()

	sendEvt(FirstTokenEvent{Type: "probe", Message: "开始批量首字测试…", Concurrency: cfg.Concurrency})

	for i := 0; i < cfg.Concurrency; i++ {
		go func() {
			for idx := range jobs {
				prompt := cfg.Prompts[idx%len(cfg.Prompts)]
				results <- firstTokenOne(ctx, cfg, endpoint, idx+1, prompt)
			}
		}()
	}
	go func() {
		defer close(jobs)
		for i := 0; i < cfg.Requests; i++ {
			select {
			case jobs <- i:
			case <-ctx.Done():
				return
			}
		}
	}()

	for i := 0; i < cfg.Requests; i++ {
		select {
		case <-ctx.Done():
			return
		case r := <-results:
			sent.Add(1)
			evt := FirstTokenEvent{Type: "result", Index: r.index, Sent: sent.Load(), Elapsed: time.Since(t0).Seconds()}
			if r.ok {
				okCount.Add(1)
				latMu.Lock()
				latencies = append(latencies, r.firstMs)
				avg, p50, p95, minV, maxV, stddev := firstTokenStats(latencies)
				latMu.Unlock()
				evt.Status = "success"
				evt.OK = okCount.Load()
				evt.Fail = failCount.Load()
				evt.FirstMs = r.firstMs
				evt.TotalMs = r.totalMs
				evt.FirstToken = r.firstToken
				evt.AvgMs = avg
				evt.P50Ms = p50
				evt.P95Ms = p95
				evt.MinMs = minV
				evt.MaxMs = maxV
				evt.StddevMs = stddev
			} else {
				failCount.Add(1)
				evt.Status = "error"
				evt.OK = okCount.Load()
				evt.Fail = failCount.Load()
				evt.TotalMs = r.totalMs
				evt.Error = r.errSumm
			}
			if !sendEvt(evt) {
				return
			}
		}
	}
	latMu.Lock()
	avg, p50, p95, minV, maxV, stddev := firstTokenStats(latencies)
	latMu.Unlock()
	sendEvt(FirstTokenEvent{Type: "done", Sent: sent.Load(), OK: okCount.Load(), Fail: failCount.Load(), AvgMs: avg, P50Ms: p50, P95Ms: p95, MinMs: minV, MaxMs: maxV, StddevMs: stddev, Elapsed: time.Since(t0).Seconds()})
}

// ─────────────────────────────────────────────
//  Burn Tool SSE
// ─────────────────────────────────────────────

type BurnConfig struct {
	Key         string  `json:"key"`
	BaseURL     string  `json:"base_url"`
	Model       string  `json:"model"`
	MaxTokens   int     `json:"max_tokens"`
	Concurrency int     `json:"concurrency"`
	API         string  `json:"api"`
	StopType    string  `json:"stop_type"`
	StopValue   float64 `json:"stop_value"`
	Prompt      string  `json:"prompt"`
}

type BurnEvent struct {
	Type      string           `json:"type"`
	Sent      int64            `json:"sent"`
	OK        int64            `json:"ok"`
	Fail      int64            `json:"fail"`
	Tokens    int64            `json:"tokens"`
	Rate      float64          `json:"rate"`
	SpentUSD  float64          `json:"spent_usd"`
	RemainUSD float64          `json:"remain_usd"`
	StartUSD  float64          `json:"start_usd"`
	Elapsed   float64          `json:"elapsed"`
	Message   string           `json:"msg,omitempty"`
	Errors    map[string]int64 `json:"errors,omitempty"`
}

type reqResult struct {
	ok        bool
	tokens    int64
	errSumm   string
	exhausted bool
}

func burnBuildPayload(cfg BurnConfig) []byte {
	prompt := cfg.Prompt
	if prompt == "" {
		prompt = "Write a detailed technical explanation of how large language models work."
	}
	body := map[string]interface{}{
		"model":      cfg.Model,
		"max_tokens": cfg.MaxTokens,
		"stream":     false,
		"messages": []interface{}{
			map[string]interface{}{"role": "user", "content": prompt},
		},
	}
	b, _ := json.Marshal(body)
	return b
}

func burnEndpoint(cfg BurnConfig) string {
	base := strings.TrimRight(cfg.BaseURL, "/")
	if cfg.API == "messages" {
		return base + "/v1/messages"
	}
	return base + "/v1/chat/completions"
}

func burnGetBalance(cfg BurnConfig) (remain float64, ok bool) {
	client := &http.Client{Timeout: 15 * time.Second}
	doGet := func(url string) (map[string]interface{}, error) {
		req, _ := http.NewRequest("GET", url, nil)
		req.Header.Set("Authorization", "Bearer "+cfg.Key)
		resp, err := client.Do(req)
		if err != nil {
			return nil, err
		}
		defer resp.Body.Close()
		var m map[string]interface{}
		json.NewDecoder(resp.Body).Decode(&m)
		return m, nil
	}
	base := strings.TrimRight(cfg.BaseURL, "/")
	sub, err1 := doGet(base + "/dashboard/billing/subscription")
	usage, err2 := doGet(base + "/dashboard/billing/usage")
	if err1 != nil || err2 != nil {
		return 0, false
	}
	hard, _ := sub["hard_limit_usd"].(float64)
	usedCents, _ := usage["total_usage"].(float64)
	if hard == 0 {
		return 0, false
	}
	return hard - usedCents/100.0, true
}

func burnWorker(ctx context.Context, cfg BurnConfig, endpoint string, payload []byte, out chan<- reqResult) {
	client := &http.Client{Timeout: 120 * time.Second}
	for {
		if ctx.Err() != nil {
			return
		}
		req, err := http.NewRequestWithContext(ctx, "POST", endpoint, bytes.NewReader(payload))
		if err != nil {
			return
		}
		req.Header.Set("Authorization", "Bearer "+cfg.Key)
		req.Header.Set("Content-Type", "application/json")
		if cfg.API == "messages" {
			req.Header.Set("anthropic-version", "2023-06-01")
		}

		resp, err := client.Do(req)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			select {
			case out <- reqResult{ok: false, errSumm: fmt.Sprintf("[conn] %s", truncate(err.Error(), 80))}:
			case <-ctx.Done():
				return
			}
			continue
		}
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		if resp.StatusCode == 200 {
			var parsed struct {
				Usage struct {
					TotalTokens int64 `json:"total_tokens"`
				} `json:"usage"`
			}
			json.Unmarshal(body, &parsed)
			select {
			case out <- reqResult{ok: true, tokens: parsed.Usage.TotalTokens}:
			case <-ctx.Done():
				return
			}
		} else {
			exhausted := burnLooksExhausted(resp.StatusCode, body)
			select {
			case out <- reqResult{ok: false, errSumm: burnExtractErrSummary(resp.StatusCode, body), exhausted: exhausted}:
			case <-ctx.Done():
				return
			}
			if exhausted {
				return
			}
		}
	}
}

func burnLooksExhausted(code int, body []byte) bool {
	if code == 402 || code == 403 {
		low := strings.ToLower(string(body))
		for _, h := range []string{"insufficient", "quota", "额度", "余额", "balance", "exceeded", "not enough"} {
			if strings.Contains(low, h) {
				return true
			}
		}
	}
	return false
}

func burnExtractErrSummary(code int, body []byte) string {
	var m map[string]interface{}
	if json.Unmarshal(body, &m) == nil {
		if e, ok2 := m["error"]; ok2 {
			switch v := e.(type) {
			case string:
				return fmt.Sprintf("[%d] %s", code, truncate(v, 100))
			case map[string]interface{}:
				msg, _ := v["message"].(string)
				if msg == "" {
					msg, _ = v["type"].(string)
				}
				return fmt.Sprintf("[%d] %s", code, truncate(msg, 100))
			}
		}
		if msg, ok2 := m["message"].(string); ok2 {
			return fmt.Sprintf("[%d] %s", code, truncate(msg, 100))
		}
	}
	return fmt.Sprintf("[%d] %s", code, truncate(string(body), 100))
}

func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) > n {
		return string(r[:n]) + "…"
	}
	return s
}

func AdminBurnSSE(c *gin.Context) {
	var cfg BurnConfig
	if err := c.ShouldBindJSON(&cfg); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	if cfg.BaseURL == "" {
		cfg.BaseURL = "http://127.0.0.1:3000"
	}
	if cfg.MaxTokens <= 0 {
		cfg.MaxTokens = 512
	}
	if cfg.Concurrency <= 0 || cfg.Concurrency > 32 {
		cfg.Concurrency = 4
	}
	if cfg.API == "" {
		cfg.API = "chat"
	}

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")
	c.Writer.WriteHeader(200)

	sendEvt := func(evt BurnEvent) bool {
		b, _ := json.Marshal(evt)
		_, err := fmt.Fprintf(c.Writer, "data: %s\n\n", b)
		c.Writer.Flush()
		return err == nil
	}

	endpoint := burnEndpoint(cfg)
	payload := burnBuildPayload(cfg)

	// Probe
	probeClient := &http.Client{Timeout: 60 * time.Second}
	probeReq, _ := http.NewRequest("POST", endpoint, bytes.NewReader(payload))
	probeReq.Header.Set("Authorization", "Bearer "+cfg.Key)
	probeReq.Header.Set("Content-Type", "application/json")
	if cfg.API == "messages" {
		probeReq.Header.Set("anthropic-version", "2023-06-01")
	}
	probeResp, probeErr := probeClient.Do(probeReq)
	if probeErr != nil {
		sendEvt(BurnEvent{Type: "error", Message: "探针失败: " + probeErr.Error()})
		return
	}
	probeBody, _ := io.ReadAll(probeResp.Body)
	probeResp.Body.Close()
	if probeResp.StatusCode != 200 {
		sendEvt(BurnEvent{Type: "error", Message: burnExtractErrSummary(probeResp.StatusCode, probeBody)})
		return
	}
	sendEvt(BurnEvent{Type: "probe", Message: "探针成功 ✓  开始消耗…"})

	startUSD, _ := burnGetBalance(cfg)
	lastBalCheck := time.Now()
	currentRemain := startUSD
	var spentUSD float64

	var sent, okCount, failCount, tokens atomic.Int64
	errCounts := make(map[string]int64)
	var errMu sync.Mutex

	results := make(chan reqResult, cfg.Concurrency*8)
	ctx, cancel := context.WithCancel(c.Request.Context())
	defer cancel()

	for i := 0; i < cfg.Concurrency; i++ {
		go burnWorker(ctx, cfg, endpoint, payload, results)
	}

	t0 := time.Now()
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	running := true
	for running {
		select {
		case <-ctx.Done():
			running = false

		case r, more := <-results:
			if !more {
				running = false
				break
			}
			sent.Add(1)
			if r.ok {
				okCount.Add(1)
				tokens.Add(r.tokens)
			} else {
				failCount.Add(1)
				if r.errSumm != "" {
					errMu.Lock()
					errCounts[r.errSumm]++
					errMu.Unlock()
				}
				if r.exhausted {
					cancel()
				}
			}

		case <-ticker.C:
			elapsed := time.Since(t0).Seconds()
			s := sent.Load()
			rate := 0.0
			if elapsed > 0 {
				rate = float64(s) / elapsed
			}

			if time.Since(lastBalCheck) >= 3*time.Second {
				if bal, ok2 := burnGetBalance(cfg); ok2 {
					spentUSD = startUSD - bal
					currentRemain = bal
				}
				lastBalCheck = time.Now()
			}

			errMu.Lock()
			errs := make(map[string]int64, len(errCounts))
			for k, v := range errCounts {
				errs[k] = v
			}
			errMu.Unlock()

			if !sendEvt(BurnEvent{
				Type: "progress", Sent: s, OK: okCount.Load(),
				Fail: failCount.Load(), Tokens: tokens.Load(),
				Rate: rate, SpentUSD: spentUSD, RemainUSD: currentRemain,
				StartUSD: startUSD, Elapsed: elapsed, Errors: errs,
			}) {
				running = false
				break
			}

			switch cfg.StopType {
			case "requests":
				if s >= int64(cfg.StopValue) {
					cancel()
				}
			case "spend":
				if spentUSD >= cfg.StopValue {
					cancel()
				}
			case "duration":
				if elapsed >= cfg.StopValue {
					cancel()
				}
			}
		}
	}

	// Drain
	drain:
	for {
		select {
		case r := <-results:
			sent.Add(1)
			if r.ok {
				okCount.Add(1)
				tokens.Add(r.tokens)
			} else {
				failCount.Add(1)
			}
		default:
			break drain
		}
	}

	elapsed := time.Since(t0).Seconds()
	if bal, ok2 := burnGetBalance(cfg); ok2 {
		spentUSD = startUSD - bal
		currentRemain = bal
	}
	errMu.Lock()
	errs := make(map[string]int64, len(errCounts))
	for k, v := range errCounts {
		errs[k] = v
	}
	errMu.Unlock()
	s := sent.Load()
	rate := 0.0
	if elapsed > 0 {
		rate = float64(s) / elapsed
	}
	sendEvt(BurnEvent{
		Type: "done", Sent: s, OK: okCount.Load(),
		Fail: failCount.Load(), Tokens: tokens.Load(),
		Rate: rate, SpentUSD: spentUSD, RemainUSD: currentRemain,
		StartUSD: startUSD, Elapsed: elapsed, Errors: errs,
		Message: "消耗完成",
	})
}
