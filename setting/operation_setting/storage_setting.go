package operation_setting

import "github.com/QuantumNous/new-api/setting/config"

// StorageSetting 会话记录的对象存储配置。
// 正文(请求/响应原文)经 gzip 压缩后写入 S3 兼容对象存储(默认面向 Cloudflare R2),
// 元数据与对象 key 写入独立的 session_logs 索引表。凭据存于 DB options,可在管理面板配置。
type StorageSetting struct {
	// 总开关:关闭时完全不捕获、不上传,零额外开销。
	Enabled bool `json:"enabled"`
	// 是否记录失败请求(鉴权失败、余额不足、限流、上游报错等)的会话正文。
	CaptureFailed bool `json:"capture_failed"`

	// S3 兼容对象存储连接参数。
	// R2 的 Endpoint 形如 https://<accountid>.r2.cloudflarestorage.com
	Endpoint  string `json:"endpoint"`
	Region    string `json:"region"`
	Bucket    string `json:"bucket"`
	AccessKey string `json:"access_key"`
	SecretKey string `json:"secret_key"`

	// 对象 key 前缀,便于在同一 bucket 内归类(可留空)。
	KeyPrefix string `json:"key_prefix"`

	// 保留天数:索引表中超过该天数的记录由后台任务清理(0 表示不自动清理)。
	// 对象本身建议另配 R2 生命周期规则,这里的清理仅作兜底并移除索引。
	RetentionDays int `json:"retention_days"`

	// 单条正文最大捕获字节数(压缩前),超出截断,防止超大上下文撑爆内存与存储。
	MaxBodyBytes int `json:"max_body_bytes"`

	// RedactStored: 开启后,新产生的会话记录在写入对象存储/索引前,
	// 会脱敏请求正文/响应/错误信息里的 PII(邮箱/电话/身份证/银行卡/IP)与密钥。
	// 默认关闭。仅影响开启之后新产生的记录,已存的旧记录不受影响。
	// 注意:脱敏不可逆,存储的就是脱敏后的内容。
	RedactStored bool `json:"redact_stored"`
}

var storageSetting = StorageSetting{
	Enabled:       false,
	CaptureFailed: false,
	Endpoint:      "",
	Region:        "auto", // R2 使用 "auto"
	Bucket:        "",
	AccessKey:     "",
	SecretKey:     "",
	KeyPrefix:     "conv",
	RetentionDays: 0,
	MaxBodyBytes:  1024 * 1024, // 1 MiB
	RedactStored:  false,
}

func init() {
	config.GlobalConfig.Register("storage_setting", &storageSetting)
}

func GetStorageSetting() *StorageSetting {
	return &storageSetting
}

// IsSessionLoggingEnabled 仅当总开关开启且连接参数齐备时才视为可用。
func IsSessionLoggingEnabled() bool {
	s := &storageSetting
	return s.Enabled && s.Endpoint != "" && s.Bucket != "" && s.AccessKey != "" && s.SecretKey != ""
}
