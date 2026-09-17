package dto

import (
	"encoding/json"
	"fmt"
	"strings"
)

const systemMessageJoinSeparator = "\n\n"

// NormalizeSystemMessages moves non-leading role=system messages to the front
// of the Chat Completions messages list and merges them in original order.
//
// If every system message is already a prefix of messages, or there is no
// system message, the request is left unchanged. user/assistant/tool/function
// relative order is preserved. On unsupported content, the original messages
// are kept and an error is returned so callers can fail open.
func (r *GeneralOpenAIRequest) NormalizeSystemMessages() (changed bool, systemCount int, err error) {
	if r == nil {
		return false, 0, nil
	}
	normalized, changed, systemCount, err := NormalizeSystemMessageOrder(r.Messages)
	if err != nil || !changed {
		return false, systemCount, err
	}
	r.Messages = normalized
	return true, systemCount, nil
}

// NormalizeSystemMessageOrder returns a messages slice whose system messages
// are a single leading message. changed is false when no rewrite is needed.
func NormalizeSystemMessageOrder(messages []Message) (result []Message, changed bool, systemCount int, err error) {
	if len(messages) == 0 {
		return messages, false, 0, nil
	}

	systemIndexes := make([]int, 0)
	firstNonSystem := -1
	for i, message := range messages {
		if isSystemRole(message.Role) {
			systemIndexes = append(systemIndexes, i)
			continue
		}
		if firstNonSystem < 0 {
			firstNonSystem = i
		}
	}
	systemCount = len(systemIndexes)
	if systemCount == 0 {
		return messages, false, 0, nil
	}
	if firstNonSystem < 0 {
		return messages, false, systemCount, nil
	}
	alreadyLeading := true
	for _, idx := range systemIndexes {
		if idx > firstNonSystem {
			alreadyLeading = false
			break
		}
	}
	if alreadyLeading {
		return messages, false, systemCount, nil
	}

	systems := make([]Message, 0, systemCount)
	others := make([]Message, 0, len(messages)-systemCount)
	for _, message := range messages {
		if isSystemRole(message.Role) {
			systems = append(systems, message)
			continue
		}
		others = append(others, message)
	}

	mergedContent, err := mergeSystemContents(systems)
	if err != nil {
		return messages, false, systemCount, err
	}

	merged := systems[0]
	merged.parsedContent = nil
	merged.Content = mergedContent
	result = make([]Message, 0, 1+len(others))
	result = append(result, merged)
	result = append(result, others...)
	return result, true, systemCount, nil
}

func isSystemRole(role string) bool {
	return role == "system"
}

func mergeSystemContents(messages []Message) (any, error) {
	contents := make([]any, 0, len(messages))
	allString := true
	for _, message := range messages {
		if message.Content == nil {
			contents = append(contents, "")
			continue
		}
		if _, ok := message.Content.(string); !ok {
			allString = false
		}
		contents = append(contents, message.Content)
	}
	if allString {
		parts := make([]string, len(contents))
		for i, content := range contents {
			parts[i] = content.(string)
		}
		return strings.Join(parts, systemMessageJoinSeparator), nil
	}

	merged := make([]any, 0)
	for i, content := range contents {
		if i > 0 {
			merged = append(merged, textContentPart(systemMessageJoinSeparator))
		}
		parts, err := systemContentToParts(content)
		if err != nil {
			return nil, err
		}
		merged = append(merged, parts...)
	}
	return merged, nil
}

func systemContentToParts(content any) ([]any, error) {
	switch value := content.(type) {
	case nil:
		return []any{textContentPart("")}, nil
	case string:
		return []any{textContentPart(value)}, nil
	case []any:
		return value, nil
	case []MediaContent:
		parts := make([]any, len(value))
		for i := range value {
			parts[i] = value[i]
		}
		return parts, nil
	case json.RawMessage:
		if len(value) == 0 {
			return []any{textContentPart("")}, nil
		}
		var decoded any
		if err := json.Unmarshal(value, &decoded); err != nil {
			return nil, fmt.Errorf("unsupported system content: %w", err)
		}
		return systemContentToParts(decoded)
	default:
		return nil, fmt.Errorf("unsupported system content type %T", content)
	}
}

func textContentPart(text string) map[string]any {
	return map[string]any{
		"type": ContentTypeText,
		"text": text,
	}
}
