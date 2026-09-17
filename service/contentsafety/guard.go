package contentsafety

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/setting/operation_setting"
)

type chatCompletionRequest struct {
	Model       string              `json:"model"`
	Messages    []map[string]string `json:"messages"`
	MaxTokens   int                 `json:"max_tokens,omitempty"`
	Temperature float64             `json:"temperature,omitempty"`
}

type chatCompletionResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
}

const guardSystemPrompt = `You are a content safety classifier. Classify the user text only.
Reply with exactly two lines:
Safety: Safe|Controversial|Unsafe
Categories: one or more of Violent, Non-violent Illegal Acts, Sexual Content or Sexual Acts, PII, Suicide & Self-Harm, Unethical Acts, Politically Sensitive Topics, Copyright Violation, Jailbreak
If the text is ordinary coding, chat, or creative writing without a policy violation, use Safety: Safe and Categories: None.`

func ScanGuard(ctx context.Context, text string) (Finding, error) {
	s := operation_setting.GetContentSafetySetting()
	if !s.GuardEnabled || strings.TrimSpace(s.GuardBaseURL) == "" {
		return Finding{}, nil
	}
	timeout := time.Duration(s.GuardTimeoutMs) * time.Millisecond
	if timeout <= 0 {
		timeout = 800 * time.Millisecond
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	payload := chatCompletionRequest{
		Model: s.GuardModel,
		Messages: []map[string]string{
			{"role": "system", "content": guardSystemPrompt},
			{"role": "user", "content": truncateRunes(text, 4000)},
		},
		MaxTokens:   64,
		Temperature: 0,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return Finding{}, err
	}

	endpoint := strings.TrimRight(s.GuardBaseURL, "/") + "/v1/chat/completions"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return Finding{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	if s.GuardAPIKey != "" {
		req.Header.Set("Authorization", "Bearer "+s.GuardAPIKey)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return Finding{}, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 256*1024))
	if err != nil {
		return Finding{}, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return Finding{}, fmt.Errorf("guard http %d", resp.StatusCode)
	}
	var parsed chatCompletionResponse
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return Finding{}, err
	}
	if len(parsed.Choices) == 0 {
		return Finding{}, fmt.Errorf("guard empty choices")
	}
	return parseGuardOutput(parsed.Choices[0].Message.Content), nil
}

func parseGuardOutput(content string) Finding {
	content = strings.TrimSpace(content)
	if content == "" {
		return Finding{}
	}
	safety := SafetySafe
	var categories []string
	for _, line := range strings.Split(content, "\n") {
		line = strings.TrimSpace(line)
		lower := strings.ToLower(line)
		switch {
		case strings.HasPrefix(lower, "safety:"):
			val := strings.TrimSpace(line[len("safety:"):])
			safety = normalizeSafety(val)
		case strings.HasPrefix(lower, "categories:"):
			val := strings.TrimSpace(line[len("categories:"):])
			categories = normalizeCategories(val)
		}
	}
	if safety == SafetySafe && len(categories) == 0 {
		return Finding{}
	}
	primary := CategoryUnknown
	if len(categories) > 0 {
		primary = categories[0]
	} else if safety != SafetySafe {
		primary = CategoryUnknown
		categories = []string{primary}
	}
	score := 0.5
	if safety == SafetyUnsafe {
		score = 0.9
	}
	if safety == SafetySafe {
		return Finding{}
	}
	return Finding{
		Hit:        true,
		Source:     SourceGuard,
		Category:   primary,
		Categories: categories,
		Safety:     safety,
		Score:      score,
		Matched:    truncateRunes(strings.Join(strings.Fields(content), " "), 120),
	}
}

func normalizeSafety(val string) string {
	switch strings.ToLower(strings.TrimSpace(val)) {
	case "unsafe":
		return SafetyUnsafe
	case "controversial":
		return SafetyControversial
	default:
		return SafetySafe
	}
}

func normalizeCategories(val string) []string {
	if val == "" || strings.EqualFold(val, "none") || strings.EqualFold(val, "n/a") {
		return nil
	}
	parts := strings.FieldsFunc(val, func(r rune) bool {
		return r == ',' || r == ';' || r == '/' || r == '|'
	})
	out := make([]string, 0, len(parts))
	seen := map[string]bool{}
	for _, p := range parts {
		cat := mapGuardCategory(p)
		if cat == "" || seen[cat] {
			continue
		}
		seen[cat] = true
		out = append(out, cat)
	}
	return out
}

func mapGuardCategory(raw string) string {
	s := strings.ToLower(strings.TrimSpace(raw))
	s = strings.ReplaceAll(s, "_", " ")
	s = strings.ReplaceAll(s, "-", " ")
	switch {
	case s == "" || s == "none":
		return ""
	case strings.Contains(s, "jailbreak"):
		return CategoryJailbreak
	case strings.Contains(s, "minor") || strings.Contains(s, "csam"):
		return CategoryRedline
	case strings.Contains(s, "sexual"):
		return CategorySexual
	case strings.Contains(s, "violent"):
		return CategoryViolent
	case strings.Contains(s, "illegal"):
		return CategoryIllegal
	case strings.Contains(s, "pii"):
		return CategoryPII
	case strings.Contains(s, "suicide") || strings.Contains(s, "self harm"):
		return CategorySuicide
	case strings.Contains(s, "unethical"):
		return CategoryUnethical
	case strings.Contains(s, "politic"):
		return CategoryPolitical
	case strings.Contains(s, "copyright"):
		return CategoryCopyright
	default:
		if utf8.RuneCountInString(s) > 32 {
			return CategoryUnknown
		}
		return CategoryUnknown
	}
}
