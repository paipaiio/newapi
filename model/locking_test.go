package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"gorm.io/gorm/utils/tests"
)

// lockForUpdate must emit FOR UPDATE on databases that support it and skip
// it on SQLite, where the syntax does not exist.
//
// The dummy dialector is used because SQLite drivers strip locking clauses
// from the generated SQL, which would mask what the helper itself does.
//
// NOTE: this fork tracks the main database via common.UsingSQLite rather than
// upstream's DatabaseType enum (which arrived with the ClickHouse feature this
// fork does not carry), so the toggle here drives that flag directly.
func TestLockForUpdateEmitsRowLock(t *testing.T) {
	dummyDB, err := gorm.Open(tests.DummyDialector{}, &gorm.Config{DryRun: true})
	require.NoError(t, err)
	buildSQL := func() string {
		var rows []Redemption
		return lockForUpdate(dummyDB).Where("id = ?", 1).Find(&rows).Statement.SQL.String()
	}

	original := common.UsingSQLite
	t.Cleanup(func() {
		common.UsingSQLite = original
	})

	common.UsingSQLite = false
	assert.Contains(t, buildSQL(), "FOR UPDATE")

	common.UsingSQLite = true
	assert.NotContains(t, buildSQL(), "FOR UPDATE")
}
