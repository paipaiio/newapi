package model

import (
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupAccountKeyRedeemFixture(t *testing.T, sourceQuota int, destQuota int) (source *User, dest *User, key string) {
	t.Helper()
	truncateTables(t)

	n := time.Now().UnixNano()
	source = &User{
		Username: fmt.Sprintf("s%010d", n%1_000_000_000),
		Password: "password12",
		Role:     common.RoleCommonUser,
		Status:   common.UserStatusEnabled,
		Quota:    sourceQuota,
		AffCode:  fmt.Sprintf("s%x", n),
	}
	dest = &User{
		Username: fmt.Sprintf("d%010d", n%1_000_000_000),
		Password: "password12",
		Role:     common.RoleCommonUser,
		Status:   common.UserStatusEnabled,
		Quota:    destQuota,
		AffCode:  fmt.Sprintf("d%x", n),
	}
	require.NoError(t, DB.Create(source).Error)
	require.NoError(t, DB.Create(dest).Error)

	key = "acctkeyredeemtoken001"
	token := &Token{
		UserId:         source.Id,
		Key:            key,
		Status:         common.TokenStatusEnabled,
		Name:           "source-key",
		UnlimitedQuota: true,
	}
	require.NoError(t, DB.Create(token).Error)
	return source, dest, key
}

func TestRedeemAccountByAPIKeyTransfersQuotaAndDisablesSource(t *testing.T) {
	source, dest, key := setupAccountKeyRedeemFixture(t, 400, 300)

	quota, err := RedeemAccountByAPIKey("sk-"+key, dest.Id)
	require.NoError(t, err)
	assert.Equal(t, 400, quota)

	var gotSource, gotDest User
	require.NoError(t, DB.First(&gotSource, source.Id).Error)
	require.NoError(t, DB.First(&gotDest, dest.Id).Error)
	assert.Equal(t, 0, gotSource.Quota)
	assert.Equal(t, common.UserStatusDisabled, gotSource.Status)
	assert.Equal(t, 700, gotDest.Quota)
	assert.Equal(t, common.UserStatusEnabled, gotDest.Status)

	var token Token
	require.NoError(t, DB.First(&token, "user_id = ?", source.Id).Error)
	assert.Equal(t, common.TokenStatusDisabled, token.Status)
}

func TestRedeemAccountByAPIKeyRejectsOwnKeyAdminDisabledAndEmpty(t *testing.T) {
	source, dest, key := setupAccountKeyRedeemFixture(t, 100, 0)

	_, err := RedeemAccountByAPIKey(key, source.Id)
	require.Error(t, err)

	require.NoError(t, DB.Model(source).Update("role", common.RoleAdminUser).Error)
	_, err = RedeemAccountByAPIKey(key, dest.Id)
	require.Error(t, err)
	require.NoError(t, DB.Model(source).Update("role", common.RoleCommonUser).Error)

	require.NoError(t, DB.Model(source).Updates(map[string]interface{}{"quota": 0}).Error)
	_, err = RedeemAccountByAPIKey(key, dest.Id)
	require.Error(t, err)

	require.NoError(t, DB.Model(source).Updates(map[string]interface{}{
		"quota":  50,
		"status": common.UserStatusDisabled,
	}).Error)
	_, err = RedeemAccountByAPIKey(key, dest.Id)
	require.Error(t, err)

	_, err = RedeemAccountByAPIKey("missing-key", dest.Id)
	require.Error(t, err)
}

func TestRedeemAccountByAPIKeyConcurrentSingleSuccess(t *testing.T) {
	_, dest, key := setupAccountKeyRedeemFixture(t, 250, 10)

	const goroutines = 5
	successes := make([]bool, goroutines)
	var wg sync.WaitGroup
	wg.Add(goroutines)
	for i := 0; i < goroutines; i++ {
		go func(idx int) {
			defer wg.Done()
			if _, err := RedeemAccountByAPIKey(key, dest.Id); err == nil {
				successes[idx] = true
			}
		}(i)
	}
	wg.Wait()

	successCount := 0
	for _, ok := range successes {
		if ok {
			successCount++
		}
	}
	assert.Equal(t, 1, successCount)

	var gotDest User
	require.NoError(t, DB.First(&gotDest, dest.Id).Error)
	assert.Equal(t, 260, gotDest.Quota)
}
