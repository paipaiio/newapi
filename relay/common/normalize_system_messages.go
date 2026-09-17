package common

import (
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/relaykit/dto"

	"github.com/gin-gonic/gin"
)

// ShouldNormalizeSystemMessages reports whether this request should rewrite
// Chat Completions system message order. The channel switch is off by default.
// When NormalizeSystemMessagesModels is empty, every model on the channel is
// included; otherwise OriginModelName or UpstreamModelName must match exactly.
func ShouldNormalizeSystemMessages(info *RelayInfo) bool {
	if info == nil || info.ChannelMeta == nil || !info.ChannelSetting.NormalizeSystemMessages {
		return false
	}
	allowed := normalizeSystemMessageModelList(info.ChannelSetting.NormalizeSystemMessagesModels)
	if len(allowed) == 0 {
		return true
	}
	origin := strings.TrimSpace(info.OriginModelName)
	upstream := strings.TrimSpace(info.UpstreamModelName)
	for _, model := range allowed {
		if model == origin || model == upstream {
			return true
		}
	}
	return false
}

// ApplyNormalizeSystemMessagesIfNeeded rewrites request.Messages when the
// channel setting is enabled for this model. It returns true only when the
// messages slice actually changed, so callers can skip request-body pass-through.
// Unsafe content is left unchanged and logged without the system prompt text.
func ApplyNormalizeSystemMessagesIfNeeded(c *gin.Context, info *RelayInfo, request *dto.GeneralOpenAIRequest) bool {
	if request == nil || !ShouldNormalizeSystemMessages(info) {
		return false
	}
	changed, systemCount, err := request.NormalizeSystemMessages()
	if err != nil {
		logger.LogWarn(c, fmt.Sprintf("failed to normalize system messages, keeping original request: %s", err.Error()))
		return false
	}
	if !changed {
		return false
	}
	logger.LogDebug(c, "normalized_system_messages=true system_count=%d", systemCount)
	return true
}

func normalizeSystemMessageModelList(models []string) []string {
	if len(models) == 0 {
		return nil
	}
	out := make([]string, 0, len(models))
	for _, model := range models {
		model = strings.TrimSpace(model)
		if model != "" {
			out = append(out, model)
		}
	}
	return out
}
