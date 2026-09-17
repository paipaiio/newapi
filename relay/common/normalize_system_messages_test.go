package common

import (
	"testing"

	"github.com/QuantumNous/new-api/relaykit/dto"

	"github.com/stretchr/testify/assert"
)

func TestShouldNormalizeSystemMessages(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		info     *RelayInfo
		expected bool
	}{
		{
			name:     "nil info",
			info:     nil,
			expected: false,
		},
		{
			name: "disabled",
			info: &RelayInfo{
				OriginModelName: "qwen3.8-27b-uncensored",
				ChannelMeta: &ChannelMeta{
					UpstreamModelName: "qwen3.8-27b-uncensored",
					ChannelSetting: dto.ChannelSettings{
						NormalizeSystemMessages: false,
					},
				},
			},
			expected: false,
		},
		{
			name: "enabled for all models",
			info: &RelayInfo{
				OriginModelName: "qwen3.8-27b-uncensored",
				ChannelMeta: &ChannelMeta{
					UpstreamModelName: "Qwen/Qwen3",
					ChannelSetting: dto.ChannelSettings{
						NormalizeSystemMessages: true,
					},
				},
			},
			expected: true,
		},
		{
			name: "enabled for matching origin model",
			info: &RelayInfo{
				OriginModelName: "qwen3.8-27b-uncensored",
				ChannelMeta: &ChannelMeta{
					UpstreamModelName: "Qwen/Qwen3",
					ChannelSetting: dto.ChannelSettings{
						NormalizeSystemMessages:       true,
						NormalizeSystemMessagesModels: []string{"qwen3.8-27b-uncensored"},
					},
				},
			},
			expected: true,
		},
		{
			name: "enabled for matching upstream model",
			info: &RelayInfo{
				OriginModelName: "alias-qwen",
				ChannelMeta: &ChannelMeta{
					UpstreamModelName: "qwen3.8-27b-uncensored",
					ChannelSetting: dto.ChannelSettings{
						NormalizeSystemMessages:       true,
						NormalizeSystemMessagesModels: []string{"qwen3.8-27b-uncensored"},
					},
				},
			},
			expected: true,
		},
		{
			name: "skips other models",
			info: &RelayInfo{
				OriginModelName: "gpt-4.1",
				ChannelMeta: &ChannelMeta{
					UpstreamModelName: "gpt-4.1",
					ChannelSetting: dto.ChannelSettings{
						NormalizeSystemMessages:       true,
						NormalizeSystemMessagesModels: []string{"qwen3.8-27b-uncensored"},
					},
				},
			},
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			assert.Equal(t, tt.expected, ShouldNormalizeSystemMessages(tt.info))
		})
	}
}
