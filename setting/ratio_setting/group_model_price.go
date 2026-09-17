package ratio_setting

import (
	"github.com/QuantumNous/new-api/types"
)

// GroupTokenPrice 某模型在某分组上的美元价（按量：每百万 token）。
// 字段均可选：只填缓存创建时，输入/输出仍走该模型的全局价。
type GroupTokenPrice struct {
	Input       *float64 `json:"input,omitempty"`
	Output      *float64 `json:"output,omitempty"`
	Cache       *float64 `json:"cache,omitempty"`
	CreateCache *float64 `json:"create_cache,omitempty"`
	Image       *float64 `json:"image,omitempty"`
	AudioInput  *float64 `json:"audio_input,omitempty"`
	AudioOutput *float64 `json:"audio_output,omitempty"`
}

// GroupModelPrice: model → group → 固定单价（按次，美元/次）。
// GroupModelRatio: 旧版「分组倍率」兼容读取。
// GroupModelTokenPrice: model → group → 输入/输出美元价（按量）。
var groupModelPriceMap = types.NewRWMap[string, map[string]float64]()
var groupModelRatioMap = types.NewRWMap[string, map[string]float64]()
var groupModelTokenPriceMap = types.NewRWMap[string, map[string]GroupTokenPrice]()

func GroupModelPrice2JSONString() string {
	return groupModelPriceMap.MarshalJSONString()
}

func UpdateGroupModelPriceByJSONString(jsonStr string) error {
	return types.LoadFromJsonStringWithCallback(groupModelPriceMap, jsonStr, InvalidateExposedDataCache)
}

func GroupModelRatio2JSONString() string {
	return groupModelRatioMap.MarshalJSONString()
}

func UpdateGroupModelRatioByJSONString(jsonStr string) error {
	return types.LoadFromJsonStringWithCallback(groupModelRatioMap, jsonStr, InvalidateExposedDataCache)
}

func GetGroupModelPriceCopy() map[string]map[string]float64 {
	return copyNestedFloatMap(groupModelPriceMap.ReadAll())
}

func GetGroupModelRatioCopy() map[string]map[string]float64 {
	return copyNestedFloatMap(groupModelRatioMap.ReadAll())
}

func GroupModelTokenPrice2JSONString() string {
	return groupModelTokenPriceMap.MarshalJSONString()
}

func UpdateGroupModelTokenPriceByJSONString(jsonStr string) error {
	return types.LoadFromJsonStringWithCallback(groupModelTokenPriceMap, jsonStr, InvalidateExposedDataCache)
}

func GetGroupModelTokenPriceCopy() map[string]map[string]GroupTokenPrice {
	src := groupModelTokenPriceMap.ReadAll()
	out := make(map[string]map[string]GroupTokenPrice, len(src))
	for model, groups := range src {
		copied := make(map[string]GroupTokenPrice, len(groups))
		for group, value := range groups {
			copied[group] = value
		}
		out[model] = copied
	}
	return out
}

func GetGroupTokenPrice(model, group string) (GroupTokenPrice, bool) {
	if group == "" {
		return GroupTokenPrice{}, false
	}
	model = FormatMatchingModelName(model)
	byGroup, ok := groupModelTokenPriceMap.Get(model)
	if !ok || byGroup == nil {
		return GroupTokenPrice{}, false
	}
	value, ok := byGroup[group]
	return value, ok
}

// ResolvedCharge 某模型在 usingGroup 下的基础计费。
type ResolvedCharge struct {
	Price                float64
	Ratio                float64
	CompletionRatio      float64
	CacheRatio           float64
	CreateCacheRatio     float64
	ImageRatio           float64
	AudioRatio           float64
	AudioCompletionRatio float64
	UsePrice             bool
	HasRatio             bool
	HasCompletion        bool
	HasCache             bool
	HasCreateCache       bool
	HasImage             bool
	HasAudio             bool
	HasAudioCompletion   bool
	OK                   bool
}

func (p GroupTokenPrice) hasAny() bool {
	return p.Input != nil || p.Output != nil || p.Cache != nil ||
		p.CreateCache != nil || p.Image != nil || p.AudioInput != nil || p.AudioOutput != nil
}

func ratioFromUSD(usd, inputUSD float64) (float64, bool) {
	if inputUSD <= 0 {
		return 0, false
	}
	return usd / inputUSD, true
}

func copyNestedFloatMap(src map[string]map[string]float64) map[string]map[string]float64 {
	out := make(map[string]map[string]float64, len(src))
	for model, groups := range src {
		copied := make(map[string]float64, len(groups))
		for group, value := range groups {
			copied[group] = value
		}
		out[model] = copied
	}
	return out
}

func lookupNested(src *types.RWMap[string, map[string]float64], model, group string) (float64, bool) {
	if group == "" {
		return 0, false
	}
	model = FormatMatchingModelName(model)
	byGroup, ok := src.Get(model)
	if !ok || byGroup == nil {
		return 0, false
	}
	value, ok := byGroup[group]
	return value, ok
}

// GetGroupModelPrice 返回某模型在指定分组上的独立固定价。
func GetGroupModelPrice(model, group string) (float64, bool) {
	return lookupNested(groupModelPriceMap, model, group)
}

// GetGroupModelRatio 返回某模型在指定分组上的独立倍率。
func GetGroupModelRatio(model, group string) (float64, bool) {
	return lookupNested(groupModelRatioMap, model, group)
}

// ResolveModelCharge 解析某模型在 usingGroup 下的基础价：
// 分组美元价（按次）> 分组美元价（按量）> 旧版分组倍率 > 全局 ModelPrice > 全局 ModelRatio。
func ResolveModelCharge(model, group string) ResolvedCharge {
	if p, found := GetGroupModelPrice(model, group); found {
		return ResolvedCharge{Price: p, UsePrice: true, OK: true}
	}
	if token, found := GetGroupTokenPrice(model, group); found && token.hasAny() {
		charge := ResolvedCharge{Price: -1}
		inputUSD := 0.0
		if token.Input != nil {
			inputUSD = *token.Input
			charge.Ratio = inputUSD / 2
			charge.HasRatio = true
			charge.OK = true
		} else if r, ok, _ := GetModelRatio(model); ok {
			inputUSD = r * 2
		}
		if token.Output != nil {
			if ratio, ok := ratioFromUSD(*token.Output, inputUSD); ok {
				charge.CompletionRatio = ratio
				charge.HasCompletion = true
				charge.OK = true
			}
		}
		if token.Cache != nil {
			if ratio, ok := ratioFromUSD(*token.Cache, inputUSD); ok {
				charge.CacheRatio = ratio
				charge.HasCache = true
				charge.OK = true
			}
		}
		if token.CreateCache != nil {
			if ratio, ok := ratioFromUSD(*token.CreateCache, inputUSD); ok {
				charge.CreateCacheRatio = ratio
				charge.HasCreateCache = true
				charge.OK = true
			}
		}
		if token.Image != nil {
			if ratio, ok := ratioFromUSD(*token.Image, inputUSD); ok {
				charge.ImageRatio = ratio
				charge.HasImage = true
				charge.OK = true
			}
		}
		audioInputUSD := 0.0
		if token.AudioInput != nil {
			if ratio, ok := ratioFromUSD(*token.AudioInput, inputUSD); ok {
				charge.AudioRatio = ratio
				charge.HasAudio = true
				charge.OK = true
				audioInputUSD = *token.AudioInput
			}
		}
		if token.AudioOutput != nil {
			if audioInputUSD <= 0 {
				audioInputUSD = GetAudioRatio(model) * inputUSD
			}
			if ratio, ok := ratioFromUSD(*token.AudioOutput, audioInputUSD); ok {
				charge.AudioCompletionRatio = ratio
				charge.HasAudioCompletion = true
				charge.OK = true
			}
		}
		if charge.OK {
			return charge
		}
	}
	if r, found := GetGroupModelRatio(model, group); found {
		return ResolvedCharge{Price: -1, Ratio: r, OK: true}
	}
	if p, found := GetModelPrice(model, false); found {
		return ResolvedCharge{Price: p, UsePrice: true, OK: true}
	}
	if r, found, _ := GetModelRatio(model); found {
		return ResolvedCharge{Price: -1, Ratio: r, OK: true}
	}
	return ResolvedCharge{}
}
