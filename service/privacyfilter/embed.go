package privacyfilter

import (
	"bytes"
	"encoding/json"
	_ "embed"
	"strconv"
	"sync"

	"github.com/QuantumNous/new-api/common"
)

// gitleaksRules 是随二进制编译进来的 gitleaks 规则集(222 条规则)。
// 来源 packyme/privacy-filter 的 rules/gitleaks.toml,通过 scripts/fetch_rules.sh 更新。
//
//go:embed gitleaks.toml
var gitleaksRules []byte

var (
	sharedOnce   sync.Once
	sharedFilter *Filter
)

// Shared 返回进程级共享的 Filter 单例(只读、并发安全)。
// 首次调用时用内嵌的 gitleaks 规则集构建;构建失败则回退到内置兜底规则,
// 任何情况下都返回一个可用的 Filter,绝不返回 nil。
func Shared() *Filter {
	sharedOnce.Do(func() {
		f, err := NewFromTOML(gitleaksRules)
		if err != nil {
			common.SysError("privacyfilter: load embedded gitleaks rules failed, fallback to builtin: " + err.Error())
			f, _ = NewFromTOML(nil) // 兜底规则,不会出错
		}
		if rules, skipped := f.Stats(); skipped > 0 {
			common.SysLog("privacyfilter: loaded " + strconv.Itoa(rules) + " rules, " + strconv.Itoa(skipped) + " skipped")
		}
		sharedFilter = f
	})
	return sharedFilter
}

// RedactString 用共享 Filter 脱敏一段纯文本,返回脱敏后的文本。
// 文本为空时原样返回。
func RedactString(text string) string {
	if text == "" {
		return text
	}
	return Shared().Redact(text).Redacted
}

// RedactJSONBytes 脱敏一段 JSON 字节中的所有字符串值(递归遍历对象/数组),
// 保持 JSON 结构不变,只替换字符串叶子节点里的 PII/密钥。
//
// 适用于会话记录请求正文:既能命中 messages[].content 这类正文,也能命中散落在
// 任意字段里的密钥。无法解析为 JSON 时,退化为对整段字节做纯文本脱敏。
// 返回的字节始终是合法 JSON(解析成功时)或脱敏后的原文(解析失败时)。
//
// 数字用 json.Number 保留(避免大整数 ID/时间戳被转成 float64 丢精度),
// 且关闭 HTML 转义(避免 <>& 被写成 &lt; 等,保持正文可读)。
func RedactJSONBytes(raw []byte) []byte {
	if len(raw) == 0 {
		return raw
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber()
	var v any
	if err := dec.Decode(&v); err != nil {
		// 非 JSON:按纯文本脱敏
		return []byte(RedactString(string(raw)))
	}
	redacted := redactJSONValue(v)

	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(redacted); err != nil {
		return raw // 理论上不会发生;保守起见返回原文
	}
	// Encoder.Encode 会追加一个换行,去掉以保持紧凑。
	return bytes.TrimRight(buf.Bytes(), "\n")
}

// redactJSONValue 递归脱敏 JSON 值:对象/数组下钻,字符串叶子做脱敏,其余原样。
func redactJSONValue(v any) any {
	switch t := v.(type) {
	case string:
		return RedactString(t)
	case map[string]any:
		for k, val := range t {
			t[k] = redactJSONValue(val)
		}
		return t
	case []any:
		for i, val := range t {
			t[i] = redactJSONValue(val)
		}
		return t
	default:
		return v
	}
}
