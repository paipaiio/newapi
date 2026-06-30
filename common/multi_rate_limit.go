package common

import (
	"context"
	"fmt"
	"time"
)

// 多维度限流计数器（用户/token/渠道 × RPM/TPM）。
// 采用固定 1 分钟窗口：key 带当前分钟戳，窗口自然滚动，过期自动清理。
// Redis 可用时用 INCR/INCRBY + EXPIRE；否则回退内存。

var mrlMemRPM InMemoryRateLimiter
var mrlMemTPM InMemoryRateLimiter
var mrlMemInit bool

func ensureMRLMem() {
	if !mrlMemInit {
		mrlMemRPM.Init(2 * time.Minute)
		mrlMemTPM.Init(2 * time.Minute)
		mrlMemInit = true
	}
}

// minuteBucket 返回当前分钟戳（按 60 取整），用作固定窗口 key 后缀。
func minuteBucket() int64 {
	return time.Now().Unix() / 60
}

// CheckRPM 检查并记录一次请求。返回 true=放行，false=超限。limit<=0 表示不限。
func CheckRPM(dimension string, id int, limit int) bool {
	if limit <= 0 || id <= 0 {
		return true
	}
	key := fmt.Sprintf("mrl:rpm:%s:%d:%d", dimension, id, minuteBucket())
	if RedisEnabled && RDB != nil {
		ctx := context.Background()
		cnt, err := RDB.Incr(ctx, key).Result()
		if err != nil {
			return true // Redis 异常放行，不阻断业务
		}
		if cnt == 1 {
			RDB.Expire(ctx, key, 2*time.Minute)
		}
		return cnt <= int64(limit)
	}
	ensureMRLMem()
	return mrlMemRPM.Request(key, limit, 60)
}

// AddTPM 累加本次请求消耗的 token 到当前窗口。
func AddTPM(dimension string, id int, tokens int) {
	if tokens <= 0 || id <= 0 {
		return
	}
	key := fmt.Sprintf("mrl:tpm:%s:%d:%d", dimension, id, minuteBucket())
	if RedisEnabled && RDB != nil {
		ctx := context.Background()
		cnt, err := RDB.IncrBy(ctx, key, int64(tokens)).Result()
		if err != nil {
			return
		}
		if cnt == int64(tokens) {
			RDB.Expire(ctx, key, 2*time.Minute)
		}
		return
	}
	ensureMRLMem()
	mrlMemTPM.AddTokens(key, tokens, 60)
}

// CheckTPM 检查当前窗口已消耗 token 是否已达上限。返回 true=放行，false=超限。limit<=0 不限。
// TPM 为事后累计：本次请求消耗在响应后才计入。
func CheckTPM(dimension string, id int, limit int) bool {
	if limit <= 0 || id <= 0 {
		return true
	}
	key := fmt.Sprintf("mrl:tpm:%s:%d:%d", dimension, id, minuteBucket())
	if RedisEnabled && RDB != nil {
		ctx := context.Background()
		val, err := RDB.Get(ctx, key).Int64()
		if err != nil {
			return true // key 不存在/异常 → 未消耗，放行
		}
		return val < int64(limit)
	}
	ensureMRLMem()
	return mrlMemTPM.GetTokens(key) < limit
}
