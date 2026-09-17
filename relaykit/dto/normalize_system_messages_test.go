package dto

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNormalizeSystemMessagesLeadingSingleSystemUnchanged(t *testing.T) {
	req := &GeneralOpenAIRequest{
		Model:  "qwen3.8-27b-uncensored",
		Stream: boolPtr(true),
		Messages: []Message{
			{Role: "system", Content: "A"},
			{Role: "user", Content: "1"},
		},
	}

	changed, systemCount, err := req.NormalizeSystemMessages()
	require.NoError(t, err)
	assert.False(t, changed)
	assert.Equal(t, 1, systemCount)
	require.Len(t, req.Messages, 2)
	assert.Equal(t, "system", req.Messages[0].Role)
	assert.Equal(t, "A", req.Messages[0].Content)
	assert.Equal(t, "user", req.Messages[1].Role)
	assert.True(t, *req.Stream)
}

func TestNormalizeSystemMessagesNoSystemUnchanged(t *testing.T) {
	req := &GeneralOpenAIRequest{
		Messages: []Message{
			{Role: "user", Content: "1"},
			{Role: "assistant", Content: "2"},
		},
	}

	changed, systemCount, err := req.NormalizeSystemMessages()
	require.NoError(t, err)
	assert.False(t, changed)
	assert.Equal(t, 0, systemCount)
	require.Len(t, req.Messages, 2)
	assert.Equal(t, "user", req.Messages[0].Role)
	assert.Equal(t, "assistant", req.Messages[1].Role)
}

func TestNormalizeSystemMessagesSingleSystemInMiddle(t *testing.T) {
	req := &GeneralOpenAIRequest{
		Messages: []Message{
			{Role: "user", Content: "1"},
			{Role: "system", Content: "A"},
			{Role: "user", Content: "2"},
		},
	}

	changed, systemCount, err := req.NormalizeSystemMessages()
	require.NoError(t, err)
	assert.True(t, changed)
	assert.Equal(t, 1, systemCount)
	require.Equal(t, []Message{
		{Role: "system", Content: "A"},
		{Role: "user", Content: "1"},
		{Role: "user", Content: "2"},
	}, req.Messages)
}

func TestNormalizeSystemMessagesMultipleSystemsMergedInOrder(t *testing.T) {
	name := "keep-me"
	req := &GeneralOpenAIRequest{
		Messages: []Message{
			{Role: "system", Name: &name, Content: "A"},
			{Role: "user", Content: "1"},
			{Role: "assistant", Content: "2"},
			{Role: "system", Content: "B"},
			{Role: "user", Content: "3"},
		},
	}

	changed, systemCount, err := req.NormalizeSystemMessages()
	require.NoError(t, err)
	assert.True(t, changed)
	assert.Equal(t, 2, systemCount)
	require.Len(t, req.Messages, 4)
	assert.Equal(t, "system", req.Messages[0].Role)
	assert.Equal(t, "A\n\nB", req.Messages[0].Content)
	require.NotNil(t, req.Messages[0].Name)
	assert.Equal(t, "keep-me", *req.Messages[0].Name)
	assert.Equal(t, "user", req.Messages[1].Role)
	assert.Equal(t, "1", req.Messages[1].Content)
	assert.Equal(t, "assistant", req.Messages[2].Role)
	assert.Equal(t, "2", req.Messages[2].Content)
	assert.Equal(t, "user", req.Messages[3].Role)
	assert.Equal(t, "3", req.Messages[3].Content)
}

func TestNormalizeSystemMessagesLeadingSystemsUnchanged(t *testing.T) {
	req := &GeneralOpenAIRequest{
		Messages: []Message{
			{Role: "system", Content: "A"},
			{Role: "system", Content: "B"},
			{Role: "user", Content: "1"},
		},
	}

	changed, systemCount, err := req.NormalizeSystemMessages()
	require.NoError(t, err)
	assert.False(t, changed)
	assert.Equal(t, 2, systemCount)
	require.Len(t, req.Messages, 3)
	assert.Equal(t, "A", req.Messages[0].Content)
	assert.Equal(t, "B", req.Messages[1].Content)
}

func TestNormalizeSystemMessagesContentPartsArray(t *testing.T) {
	req := &GeneralOpenAIRequest{
		Messages: []Message{
			{Role: "user", Content: "1"},
			{
				Role: "system",
				Content: []any{
					map[string]any{"type": "text", "text": "A"},
					map[string]any{"type": "text", "text": "part-2", "cache_control": map[string]any{"type": "ephemeral"}},
				},
			},
			{Role: "user", Content: "2"},
		},
	}

	changed, systemCount, err := req.NormalizeSystemMessages()
	require.NoError(t, err)
	assert.True(t, changed)
	assert.Equal(t, 1, systemCount)
	require.Len(t, req.Messages, 3)
	assert.Equal(t, "system", req.Messages[0].Role)
	parts, ok := req.Messages[0].Content.([]any)
	require.True(t, ok)
	require.Len(t, parts, 2)
	first, ok := parts[0].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, "A", first["text"])
	second, ok := parts[1].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, "part-2", second["text"])
	assert.Equal(t, map[string]any{"type": "ephemeral"}, second["cache_control"])
}

func TestNormalizeSystemMessagesMixedStringAndParts(t *testing.T) {
	req := &GeneralOpenAIRequest{
		Messages: []Message{
			{Role: "system", Content: "A"},
			{Role: "user", Content: "1"},
			{
				Role: "system",
				Content: []any{
					map[string]any{"type": "text", "text": "B"},
				},
			},
		},
	}

	changed, systemCount, err := req.NormalizeSystemMessages()
	require.NoError(t, err)
	assert.True(t, changed)
	assert.Equal(t, 2, systemCount)
	parts, ok := req.Messages[0].Content.([]any)
	require.True(t, ok)
	require.Len(t, parts, 3)
	assert.Equal(t, map[string]any{"type": "text", "text": "A"}, parts[0])
	assert.Equal(t, map[string]any{"type": "text", "text": "\n\n"}, parts[1])
	assert.Equal(t, map[string]any{"type": "text", "text": "B"}, parts[2])
	assert.Equal(t, "user", req.Messages[1].Role)
}

func TestNormalizeSystemMessagesPreservesToolRoundtrip(t *testing.T) {
	toolCalls := json.RawMessage(`[{"id":"call_1","type":"function","function":{"name":"lookup","arguments":"{}"}}]`)
	req := &GeneralOpenAIRequest{
		Stream:     boolPtr(true),
		Tools:      []ToolCallRequest{{Type: "function", Function: FunctionRequest{Name: "lookup"}}},
		ToolChoice: "auto",
		Messages: []Message{
			{Role: "system", Content: "A"},
			{Role: "user", Content: "1"},
			{Role: "assistant", Content: nil, ToolCalls: toolCalls},
			{Role: "tool", Content: `{"ok":true}`, ToolCallId: "call_1"},
			{Role: "system", Content: "B"},
			{Role: "user", Content: "2"},
		},
	}

	changed, systemCount, err := req.NormalizeSystemMessages()
	require.NoError(t, err)
	assert.True(t, changed)
	assert.Equal(t, 2, systemCount)
	require.Len(t, req.Messages, 5)
	assert.Equal(t, "system", req.Messages[0].Role)
	assert.Equal(t, "A\n\nB", req.Messages[0].Content)
	assert.Equal(t, "user", req.Messages[1].Role)
	assert.Equal(t, "assistant", req.Messages[2].Role)
	assert.JSONEq(t, string(toolCalls), string(req.Messages[2].ToolCalls))
	assert.Equal(t, "tool", req.Messages[3].Role)
	assert.Equal(t, "call_1", req.Messages[3].ToolCallId)
	assert.Equal(t, "user", req.Messages[4].Role)
	assert.True(t, *req.Stream)
	require.Len(t, req.Tools, 1)
	assert.Equal(t, "lookup", req.Tools[0].Function.Name)
	assert.Equal(t, "auto", req.ToolChoice)
}

func TestNormalizeSystemMessagesUnsupportedContentKeepsOriginal(t *testing.T) {
	original := []Message{
		{Role: "user", Content: "1"},
		{Role: "system", Content: map[string]any{"unexpected": true}},
		{Role: "user", Content: "2"},
	}
	req := &GeneralOpenAIRequest{Messages: append([]Message(nil), original...)}

	changed, systemCount, err := req.NormalizeSystemMessages()
	require.Error(t, err)
	assert.False(t, changed)
	assert.Equal(t, 1, systemCount)
	assert.Equal(t, original, req.Messages)
}

func TestNormalizeSystemMessagesMixedContentMarshals(t *testing.T) {
	req := &GeneralOpenAIRequest{
		Model: "qwen3.8-27b-uncensored",
		Messages: []Message{
			{Role: "system", Content: "A"},
			{Role: "user", Content: "1"},
			{
				Role: "system",
				Content: []any{
					map[string]any{"type": "text", "text": "B"},
				},
			},
		},
	}

	changed, _, err := req.NormalizeSystemMessages()
	require.NoError(t, err)
	assert.True(t, changed)

	raw, err := json.Marshal(req)
	require.NoError(t, err)
	var decoded map[string]any
	require.NoError(t, json.Unmarshal(raw, &decoded))
	messages, ok := decoded["messages"].([]any)
	require.True(t, ok)
	require.Len(t, messages, 2)
	first, ok := messages[0].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, "system", first["role"])
	content, ok := first["content"].([]any)
	require.True(t, ok)
	require.Len(t, content, 3)
}

func TestNormalizeSystemMessagesIgnoresDeveloperRole(t *testing.T) {
	req := &GeneralOpenAIRequest{
		Messages: []Message{
			{Role: "user", Content: "1"},
			{Role: "developer", Content: "not-system"},
			{Role: "user", Content: "2"},
		},
	}

	changed, systemCount, err := req.NormalizeSystemMessages()
	require.NoError(t, err)
	assert.False(t, changed)
	assert.Equal(t, 0, systemCount)
	require.Len(t, req.Messages, 3)
	assert.Equal(t, "developer", req.Messages[1].Role)
}

func boolPtr(v bool) *bool {
	return &v
}
