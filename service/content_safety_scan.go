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
package service

import (
	"context"
	"strings"

	"github.com/bytedance/gopkg/util/gopool"
	"github.com/gin-gonic/gin"

	"github.com/QuantumNous/new-api/common"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service/contentsafety"
	"github.com/QuantumNous/new-api/setting/operation_setting"
)

// ScanContentSafetyOutput 输出侧内容安全扫描：对已成功捕获的响应文本异步扫描。
// 输出阶段永不 HTTP 拦截（decideAction 内部已降级为 review 动作），
// 全程在 gopool 协程内执行，任何失败仅记日志，绝不影响主请求链路。
func ScanContentSafetyOutput(ctx *gin.Context, relayInfo *relaycommon.RelayInfo) {
	s := operation_setting.GetContentSafetySetting()
	if !s.Enabled || !s.ScanOutput {
		return
	}
	responseText := relayInfo.CapturedResponseText
	if strings.TrimSpace(responseText) == "" {
		return
	}

	// 在主协程内取出需要的数据（gin.Context 不可跨协程并发使用）
	// ChannelMeta 在渠道选择阶段才初始化，防御性判空。
	upstreamModel := ""
	if relayInfo.ChannelMeta != nil {
		upstreamModel = relayInfo.UpstreamModelName
	}
	req := contentsafety.Request{
		UserId:        relayInfo.UserId,
		Username:      ctx.GetString("username"),
		TokenName:     ctx.GetString("token_name"),
		ModelName:     relayInfo.OriginModelName,
		UpstreamModel: upstreamModel,
		Group:         relayInfo.UsingGroup,
		TokenGroup:    relayInfo.TokenGroup,
		RequestId:     relayInfo.RequestId,
		ScanText:      responseText,
		FullText:      responseText,
		Phase:         contentsafety.PhaseOutput,
	}

	gopool.Go(func() {
		defer func() {
			if r := recover(); r != nil {
				common.SysError("ScanContentSafetyOutput panic recovered")
			}
		}()
		contentsafety.Evaluate(context.Background(), req)
	})
}
