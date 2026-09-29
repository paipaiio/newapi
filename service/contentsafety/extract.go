package contentsafety

import (
	"strings"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
)

// 多轮对话全文提取（输入侧扫描用）。
// 独立的提取实现，不改动 model/session_log.go，降低与 upstream 的合并冲突面。

const (
	// scanWindowRunes 与 Evaluate 内部对 scanText 的截断上限保持一致：
	// 窗口文本必须整体低于该上限，否则末尾的最新消息会被 Evaluate 从头部截断。
	scanWindowRunes = 8000
	// fullTextMaxRunes 限制红线扫描的完整对话长度，控制正则扫描成本。
	fullTextMaxRunes = 24000
)

// ExtractConversationText 提取请求中的全部对话消息（含角色标注），按顺序拼接。
// 支持 OpenAI chat / Claude 的 messages、OpenAI Responses 的 input、Gemini 的 contents。
// 提取不到任何文本时返回空串，调用方应回退到单条消息提取。
func ExtractConversationText(requestRaw []byte) string {
	if len(requestRaw) == 0 {
		return ""
	}
	var req map[string]any
	if common.Unmarshal(requestRaw, &req) != nil {
		return ""
	}
	if msgs, ok := req["messages"].([]any); ok {
		return joinRoleMessages(msgs)
	}
	if input, ok := req["input"].([]any); ok {
		return joinRoleMessages(input)
	}
	if contents, ok := req["contents"].([]any); ok {
		return joinGeminiContents(contents)
	}
	return ""
}

// joinRoleMessages 拼接 [{role, content}] 结构的消息数组（OpenAI / Claude / Responses）。
func joinRoleMessages(msgs []any) string {
	var sb strings.Builder
	for _, m := range msgs {
		msg, ok := m.(map[string]any)
		if !ok {
			continue
		}
		text := extractMsgText(msg["content"])
		if strings.TrimSpace(text) == "" {
			continue
		}
		role, _ := msg["role"].(string)
		if role == "" {
			role = "message"
		}
		writeRoleMessage(&sb, role, text)
	}
	return sb.String()
}

// joinGeminiContents 拼接 Gemini [{role, parts:[{text}]}] 结构。
func joinGeminiContents(contents []any) string {
	var sb strings.Builder
	for _, m := range contents {
		msg, ok := m.(map[string]any)
		if !ok {
			continue
		}
		var text string
		if parts, ok := msg["parts"].([]any); ok {
			for _, p := range parts {
				text += extractMsgText(p)
			}
		}
		if strings.TrimSpace(text) == "" {
			continue
		}
		role, _ := msg["role"].(string)
		if role == "" {
			role = "message"
		}
		writeRoleMessage(&sb, role, text)
	}
	return sb.String()
}

func writeRoleMessage(sb *strings.Builder, role, text string) {
	if sb.Len() > 0 {
		sb.WriteString("\n")
	}
	sb.WriteString("[" + role + "] ")
	sb.WriteString(strings.TrimSpace(text))
}

// extractMsgText 从 content 字段取值：字符串直接返回；
// 数组/对象形式（OpenAI parts、Claude blocks、Gemini parts）收集其中的 text 字段。
func extractMsgText(content any) string {
	switch v := content.(type) {
	case string:
		return v
	case []any:
		var sb strings.Builder
		for _, item := range v {
			sb.WriteString(extractMsgText(item))
		}
		return sb.String()
	case map[string]any:
		if text, ok := v["text"].(string); ok {
			return text
		}
	}
	return ""
}

// windowScanText 把完整对话压缩进扫描窗口：短对话原样返回；
// 超长对话保留头部一段（早期越狱设定）和尾部一段（最新消息），中段用标记占位。
func windowScanText(full string) string {
	if utf8.RuneCountInString(full) <= scanWindowRunes {
		return full
	}
	half := scanWindowRunes/2 - 40
	runes := []rune(full)
	tail := string(runes[len(runes)-half:])
	return truncateRunes(full, half) + "\n...[truncated]...\n" + tail
}
