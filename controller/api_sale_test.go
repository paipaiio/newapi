package controller

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/dto"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupApiSaleTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	previousDB, previousLogDB := model.DB, model.LOG_DB
	previousRedisEnabled := common.RedisEnabled
	previousMainDatabaseType, previousLogDatabaseType := common.MainDatabaseType(), common.LogDatabaseType()
	common.RedisEnabled = false
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)

	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	model.DB, model.LOG_DB = db, db
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Token{}))

	t.Cleanup(func() {
		model.DB, model.LOG_DB = previousDB, previousLogDB
		common.RedisEnabled = previousRedisEnabled
		common.SetDatabaseTypes(previousMainDatabaseType, previousLogDatabaseType)
		sqlDB, err := db.DB()
		if err == nil {
			_ = sqlDB.Close()
		}
	})
	return db
}

func TestCreateOneSaleItemPersistsPasswordAndVisibleGroups(t *testing.T) {
	setupApiSaleTestDB(t)

	res := createOneSaleItem(apiSaleItem{
		Username:      "saleuser01",
		Password:      "SalePass123",
		Group:         "vip",
		VisibleGroups: []string{"vip", "claude", "vip"},
		Quota:         5,
		BatchId:       "batch-a",
	})
	require.Empty(t, res.Error)
	assert.Equal(t, "saleuser01", res.Username)
	assert.Equal(t, "SalePass123", res.Password)
	assert.True(t, strings.HasPrefix(res.ApiKey, "sk-"))
	assert.Equal(t, []string{"vip", "claude"}, res.VisibleGroups)

	var user model.User
	require.NoError(t, model.DB.Where("username = ?", "saleuser01").First(&user).Error)
	assert.Equal(t, "SalePass123", user.SalePassword)
	assert.Equal(t, "vip", user.Group)
	assert.Equal(t, []string{"vip", "claude"}, user.GetSetting().VisibleGroups)
	assert.NotEqual(t, "SalePass123", user.Password)

	var token model.Token
	require.NoError(t, model.DB.Where("user_id = ?", user.Id).First(&token).Error)
	assert.Equal(t, "batch-a", token.BatchId)
	assert.Equal(t, "sk-"+token.Key, res.ApiKey)
}

func TestExportApiSaleBatchReturnsExistingKeyAndPassword(t *testing.T) {
	setupApiSaleTestDB(t)
	created := createOneSaleItem(apiSaleItem{
		Username:      "exportme",
		Password:      "ExportPass1",
		CustomKey:     "existingkeyabc",
		Group:         "default",
		VisibleGroups: []string{"gpt"},
		BatchId:       "batch-export",
	})
	require.Empty(t, created.Error)

	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/user/batch/export?batch_id=batch-export", nil)
	ExportApiSaleBatch(c)

	assert.Equal(t, http.StatusOK, recorder.Code)
	var body struct {
		Success bool `json:"success"`
		Data    struct {
			Items []model.BatchExportRow `json:"items"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &body))
	require.True(t, body.Success)
	require.Len(t, body.Data.Items, 1)
	assert.Equal(t, "exportme", body.Data.Items[0].Username)
	assert.Equal(t, "ExportPass1", body.Data.Items[0].Password)
	assert.Equal(t, "sk-existingkeyabc", body.Data.Items[0].ApiKey)
	assert.Equal(t, []string{"gpt"}, body.Data.Items[0].VisibleGroups)
}

func TestBatchSetVisibleGroupsByBatchUpdatesAccounts(t *testing.T) {
	setupApiSaleTestDB(t)
	created := createOneSaleItem(apiSaleItem{
		Username: "vguser",
		Password: "VgPass1234",
		Group:    "default",
		BatchId:  "batch-vg",
	})
	require.Empty(t, created.Error)

	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	payload := `{"batch_id":"batch-vg","groups":["claude","gemini"]}`
	c.Request = httptest.NewRequest(http.MethodPost, "/api/user/batch/visible_groups", bytes.NewBufferString(payload))
	c.Request.Header.Set("Content-Type", "application/json")
	BatchSetVisibleGroupsByBatch(c)

	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.Contains(t, recorder.Body.String(), `"success":true`)

	var user model.User
	require.NoError(t, model.DB.Where("username = ?", "vguser").First(&user).Error)
	assert.Equal(t, []string{"claude", "gemini"}, user.GetSetting().VisibleGroups)
}

func TestNormalizeVisibleGroupsDedups(t *testing.T) {
	got := normalizeVisibleGroups([]string{" a ", "", "b", "a", "b"})
	assert.Equal(t, []string{"a", "b"}, got)
}

func TestApplyUserVisibleGroupsKeepsOtherSettings(t *testing.T) {
	setupApiSaleTestDB(t)
	user := model.User{Username: "keepset", Password: "password12", Role: 1, Status: 1}
	user.SetSetting(dto.UserSetting{Language: "zh", NotifyType: "email"})
	require.NoError(t, model.DB.Create(&user).Error)

	require.NoError(t, applyUserVisibleGroups(user.Id, []string{"vip"}))

	reloaded, err := model.GetUserById(user.Id, true)
	require.NoError(t, err)
	setting := reloaded.GetSetting()
	assert.Equal(t, []string{"vip"}, setting.VisibleGroups)
	assert.Equal(t, "zh", setting.Language)
	assert.Equal(t, "email", setting.NotifyType)
}
