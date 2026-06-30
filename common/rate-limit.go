package common

import (
	"sync"
	"time"
)

type InMemoryRateLimiter struct {
	store              map[string]*[]int64
	mutex              sync.Mutex
	expirationDuration time.Duration
	tpmStore           map[string]*tpmEntry
}

type tpmEntry struct {
	tokens   int
	expireAt int64
}

func (l *InMemoryRateLimiter) Init(expirationDuration time.Duration) {
	if l.store == nil {
		l.mutex.Lock()
		if l.store == nil {
			l.store = make(map[string]*[]int64)
			l.expirationDuration = expirationDuration
			if expirationDuration > 0 {
				go l.clearExpiredItems()
			}
		}
		l.mutex.Unlock()
	}
}

func (l *InMemoryRateLimiter) clearExpiredItems() {
	for {
		time.Sleep(l.expirationDuration)
		l.mutex.Lock()
		now := time.Now().Unix()
		for key := range l.store {
			queue := l.store[key]
			size := len(*queue)
			if size == 0 || now-(*queue)[size-1] > int64(l.expirationDuration.Seconds()) {
				delete(l.store, key)
			}
		}
		l.mutex.Unlock()
	}
}

// Request parameter duration's unit is seconds
func (l *InMemoryRateLimiter) Request(key string, maxRequestNum int, duration int64) bool {
	l.mutex.Lock()
	defer l.mutex.Unlock()
	// [old <-- new]
	queue, ok := l.store[key]
	now := time.Now().Unix()
	if ok {
		if len(*queue) < maxRequestNum {
			*queue = append(*queue, now)
			return true
		} else {
			if now-(*queue)[0] >= duration {
				*queue = (*queue)[1:]
				*queue = append(*queue, now)
				return true
			} else {
				return false
			}
		}
	} else {
		s := make([]int64, 0, maxRequestNum)
		l.store[key] = &s
		*(l.store[key]) = append(*(l.store[key]), now)
	}
	return true
}

// AddTokens 累加 TPM token 计数（固定窗口，duration 秒）。
func (l *InMemoryRateLimiter) AddTokens(key string, tokens int, duration int64) {
	l.mutex.Lock()
	defer l.mutex.Unlock()
	if l.tpmStore == nil {
		l.tpmStore = make(map[string]*tpmEntry)
	}
	now := time.Now().Unix()
	e, ok := l.tpmStore[key]
	if !ok || now >= e.expireAt {
		l.tpmStore[key] = &tpmEntry{tokens: tokens, expireAt: now + duration}
		return
	}
	e.tokens += tokens
}

// GetTokens 返回当前窗口已累计的 token 数（窗口过期则为 0）。
func (l *InMemoryRateLimiter) GetTokens(key string) int {
	l.mutex.Lock()
	defer l.mutex.Unlock()
	if l.tpmStore == nil {
		return 0
	}
	e, ok := l.tpmStore[key]
	if !ok || time.Now().Unix() >= e.expireAt {
		return 0
	}
	return e.tokens
}
