package openai

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSkipHollowChatStreamChunk(t *testing.T) {
	t.Run("zero value is skipped and choices become empty array", func(t *testing.T) {
		chunk := dto.ChatCompletionsStreamResponse{}
		require.True(t, skipHollowChatStreamChunk(&chunk))
		require.NotNil(t, chunk.Choices)
		require.Empty(t, chunk.Choices)
	})

	t.Run("null choices with id is kept as empty array", func(t *testing.T) {
		chunk := dto.ChatCompletionsStreamResponse{
			Id:      "chatcmpl-1",
			Object:  "chat.completion.chunk",
			Created: 1710000000,
			Model:   "k3",
		}
		require.False(t, skipHollowChatStreamChunk(&chunk))
		require.NotNil(t, chunk.Choices)
		require.Empty(t, chunk.Choices)
	})

	t.Run("usage-only chunk is kept", func(t *testing.T) {
		chunk := dto.ChatCompletionsStreamResponse{
			Id:    "chatcmpl-1",
			Usage: &dto.Usage{PromptTokens: 10, CompletionTokens: 0, TotalTokens: 10},
		}
		require.False(t, skipHollowChatStreamChunk(&chunk))
	})
}

func TestSendStreamDataSkipsHollowPayloads(t *testing.T) {
	oldMode := gin.Mode()
	gin.SetMode(gin.TestMode)
	t.Cleanup(func() { gin.SetMode(oldMode) })

	info := &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: "k3"},
		RelayFormat: types.RelayFormatOpenAI,
		DisablePing: true,
		ThinkingContentInfo: relaycommon.ThinkingContentInfo{
			IsFirstThinkingContent: true,
		},
	}

	cases := []struct {
		name string
		data string
	}{
		{name: "empty object", data: `{}`},
		{name: "json null", data: `null`},
		{name: "zero completion", data: `{"id":"","object":"","created":0,"model":"","system_fingerprint":null,"choices":null,"usage":null}`},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(recorder)
			c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)

			err := sendStreamData(c, info, tc.data, false, true)
			require.NoError(t, err)
			assert.NotContains(t, recorder.Body.String(), `"choices":null`)
			assert.NotContains(t, recorder.Body.String(), `"id":""`)
		})
	}
}

func TestSendStreamDataNormalizesNullChoicesOnRealChunk(t *testing.T) {
	oldMode := gin.Mode()
	gin.SetMode(gin.TestMode)
	t.Cleanup(func() { gin.SetMode(oldMode) })

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	info := &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: "k3"},
		RelayFormat: types.RelayFormatOpenAI,
	}

	err := sendStreamData(c, info, `{"id":"chatcmpl-1","object":"chat.completion.chunk","created":1,"model":"k3","choices":null}`, false, true)
	require.NoError(t, err)
	got := recorder.Body.String()
	assert.Contains(t, got, `"choices":[]`)
	assert.NotContains(t, got, `"choices":null`)
}

func TestOaiStreamHandlerRejectsEmptyStream(t *testing.T) {
	oldMode := gin.Mode()
	gin.SetMode(gin.TestMode)
	t.Cleanup(func() { gin.SetMode(oldMode) })

	oldTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	t.Cleanup(func() { constant.StreamingTimeout = oldTimeout })

	body := strings.Join([]string{
		`data: {"id":"","object":"","created":0,"model":"","system_fingerprint":null,"choices":null,"usage":null}`,
		`data: {}`,
		`data: [DONE]`,
		``,
	}, "\n")

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	c.Set(common.RequestIdKey, "empty-stream-test")

	resp := &http.Response{
		StatusCode: http.StatusOK,
		Body:       io.NopCloser(strings.NewReader(body)),
		Header:     http.Header{"Content-Type": []string{"text/event-stream"}},
	}
	info := &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: "kimi-k3"},
		IsStream:    true,
		RelayFormat: types.RelayFormatOpenAI,
		DisablePing: true,
		RelayMode:   relayconstant.RelayModeChatCompletions,
	}

	usage, err := OaiStreamHandler(c, info, resp)
	require.Nil(t, usage)
	require.NotNil(t, err)
	assert.Equal(t, types.ErrorCodeEmptyResponse, err.GetErrorCode())
	assert.NotContains(t, recorder.Body.String(), `"choices":null`)
}

func TestOpenaiHandlerRejectsEmptyCompletion(t *testing.T) {
	oldMode := gin.Mode()
	gin.SetMode(gin.TestMode)
	t.Cleanup(func() { gin.SetMode(oldMode) })

	body := `{"id":"","object":"","created":0,"model":"","system_fingerprint":null,"choices":null,"usage":null}`
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)

	resp := &http.Response{
		StatusCode: http.StatusOK,
		Body:       io.NopCloser(strings.NewReader(body)),
		Header:     http.Header{"Content-Type": []string{"application/json"}},
	}
	info := &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: "kimi-k3"},
		RelayFormat: types.RelayFormatOpenAI,
	}

	usage, err := OpenaiHandler(c, info, resp)
	require.Nil(t, usage)
	require.NotNil(t, err)
	assert.Equal(t, types.ErrorCodeEmptyResponse, err.GetErrorCode())
	assert.Empty(t, recorder.Body.String())
}
