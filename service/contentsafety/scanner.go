package contentsafety

import (
	"regexp"
	"strings"
	"sync"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/setting/operation_setting"
)

// Built-in hard-block terms. These are high-precision illegal-content markers,
// not a general topic filter. Admins can extend them via RedlineWords.
var builtinRedline = []string{
	"child pornography",
	"child porn",
	"child sexual",
	"sexual content involving a minor",
	"csam",
	"儿童色情",
	"幼女色情",
}

var (
	jailbreakOnce     sync.Once
	jailbreakPatterns []*regexp.Regexp
)

func jailbreakRegexes() []*regexp.Regexp {
	jailbreakOnce.Do(func() {
		raw := []string{
			`(?i)ignore (all )?(the )?(previous|prior|above|earlier) (instructions|prompts|rules|guidelines)`,
			`(?i)do anything now`,
			`(?i)\bdan mode\b`,
			`(?i)developer mode (enabled|on)`,
			`(?i)\bjailbreak( mode| prompt)?\b`,
			`(?i)disable (the |your )?(safety|content) (filter|filters|guidelines|policy)`,
			`(?i)you (are|will be) (now )?(unrestricted|uncensored|unfiltered)`,
			`(?i)pretend (you have |there are )?no (restrictions|limits|guidelines)`,
			`忽略(你的|之前的|以上的|所有的)?(所有)?(指令|指示|规则|限制)`,
			`开发者模式`,
			`越狱模式`,
			`无限制模式`,
			`你现在是\s*DAN`,
			`取消(你的)?(道德|安全|内容)?(限制|审查|过滤)`,
			`不要遵守(你的)?(安全|内容)?(规则|政策|限制)`,
		}
		for _, p := range raw {
			re, err := regexp.Compile(p)
			if err != nil {
				continue
			}
			jailbreakPatterns = append(jailbreakPatterns, re)
		}
	})
	return jailbreakPatterns
}

func ScanRedline(text string) Finding {
	if strings.TrimSpace(text) == "" {
		return Finding{}
	}
	words := append([]string{}, builtinRedline...)
	extra := operation_setting.GetContentSafetySetting().RedlineWords
	for _, w := range strings.Split(extra, "\n") {
		w = strings.TrimSpace(w)
		if w != "" {
			words = append(words, w)
		}
	}
	ok, matched := containsAnyFold(text, words)
	if !ok {
		return Finding{}
	}
	return Finding{
		Hit:        true,
		Source:     SourceRedline,
		Category:   CategoryRedline,
		Categories: []string{CategoryRedline},
		Safety:     SafetyUnsafe,
		Score:      1,
		Matched:    matched,
	}
}

func ScanJailbreak(text string) Finding {
	if !operation_setting.GetContentSafetySetting().JailbreakScanEnabled {
		return Finding{}
	}
	if strings.TrimSpace(text) == "" {
		return Finding{}
	}
	for _, re := range jailbreakRegexes() {
		if loc := re.FindStringIndex(text); loc != nil {
			matched := text[loc[0]:loc[1]]
			return Finding{
				Hit:        true,
				Source:     SourceJailbreak,
				Category:   CategoryJailbreak,
				Categories: []string{CategoryJailbreak},
				Safety:     SafetyUnsafe,
				Score:      0.9,
				Matched:    truncateRunes(matched, 80),
			}
		}
	}
	return Finding{}
}

func containsAnyFold(text string, words []string) (bool, string) {
	lower := strings.ToLower(text)
	for _, w := range words {
		w = strings.ToLower(strings.TrimSpace(w))
		if w == "" {
			continue
		}
		if strings.Contains(lower, w) {
			return true, w
		}
	}
	return false, ""
}

func truncateRunes(s string, max int) string {
	if max <= 0 || s == "" {
		return s
	}
	if utf8.RuneCountInString(s) <= max {
		return s
	}
	return string([]rune(s)[:max])
}

func snippetOf(s string) string {
	s = strings.TrimSpace(s)
	s = strings.ReplaceAll(s, "\n", " ")
	return truncateRunes(s, 240)
}
