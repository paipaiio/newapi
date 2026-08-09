package controller

import (
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
)

type apiSaleItem struct {
	Username    string   `json:"username"`
	Password    string   `json:"password"`
	CustomKey   string   `json:"custom_key"`
	Group       string   `json:"group"`
	ExtraGroups []string `json:"extra_groups"` // token 额外路由分组（逗号拼接后写入 token.Group），账户分组仍为单值 Group
	Quota       float64  `json:"quota"`
	Unlimited   bool     `json:"unlimited"`
	Exclusive   bool     `json:"exclusive"` // 是否把新账户加入该分组的独享授权名单
	BatchId     string   `json:"batch_id"`  // 批次标识，写入 token.batch_id，用于反查整批
}

type ApiSaleResult struct {
	Username string  `json:"username"`
	Password string  `json:"password"`
	ApiKey   string  `json:"api_key"`
	Group    string  `json:"group"`
	Quota    float64 `json:"quota"`
	Error    string  `json:"error,omitempty"`
	userId   int     // 内部用，不序列化：用于独享授权聚合
}

func BatchCreateApiSale(c *gin.Context) {
	var items []apiSaleItem
	if err := c.ShouldBindJSON(&items); err != nil || len(items) == 0 || len(items) > 500 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "参数错误，items 须为 1-500 条"})
		return
	}
	results := make([]ApiSaleResult, len(items))
	// 收集需要加入独享授权的用户：分组名 -> 新建用户ID列表
	exclusiveGrants := make(map[string][]int)
	for i, item := range items {
		results[i] = createOneSaleItem(item)
		if item.Exclusive && results[i].Error == "" && results[i].userId > 0 {
			g := results[i].Group
			if g == "" {
				g = "default"
			}
			exclusiveGrants[g] = append(exclusiveGrants[g], results[i].userId)
		}
	}
	// 批量把新账户加入对应分组的独享授权（增量，不覆盖已有授权）
	for g, uids := range exclusiveGrants {
		if err := model.AddUsersToExclusiveGroup(g, uids); err != nil {
			common.SysError("api-sale 加入独享授权失败 group=" + g + ": " + err.Error())
		}
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": results})
}

func createOneSaleItem(item apiSaleItem) ApiSaleResult {
	res := ApiSaleResult{Group: item.Group, Quota: item.Quota}

	username := strings.TrimSpace(item.Username)
	if username == "" {
		username = "user_" + common.GetRandomString(8)
	}
	password := item.Password
	if password == "" {
		password = common.GetRandomString(12)
	}
	res.Username, res.Password = username, password

	group := item.Group
	if group == "" {
		group = "default"
	}

	user := model.User{
		Username:    username,
		Password:    password,
		DisplayName: username,
		Role:        1,
		Group:       group,
	}
	if err := user.Insert(0); err != nil {
		res.Error = "创建用户失败: " + err.Error()
		return res
	}
	res.userId = user.Id
	// Update group explicitly (Insert may not save non-zero custom group)
	model.DB.Model(&model.User{}).Where("id = ?", user.Id).Update("group", group)

	// 直接设置用户额度为指定值（覆盖 Insert 写入的注册赠送额度，避免叠加）
	internalQuota := displayQuotaToInternal(item.Quota)
	if item.Unlimited {
		internalQuota = 0
	}
	if internalQuota < 0 {
		internalQuota = 0
	}
	model.DB.Model(&model.User{}).Where("id = ?", user.Id).Update("quota", internalQuota)
	_ = model.InvalidateUserCache(user.Id)

	key := strings.TrimPrefix(strings.TrimSpace(item.CustomKey), "sk-")
	if key == "" {
		var err error
		key, err = common.GenerateKey()
		if err != nil {
			res.Error = "生成密钥失败: " + err.Error()
			return res
		}
	}

	// 账户分组保持单值（group），token 分组可包含额外路由分组。
	// 同时把 token.RemainQuota 设为与账户同等额度，方便买家通过 key 直接查询余额。
	allGroups := make([]string, 0, 1+len(item.ExtraGroups))
	allGroups = append(allGroups, group)
	for _, eg := range item.ExtraGroups {
		eg = strings.TrimSpace(eg)
		if eg != "" {
			allGroups = append(allGroups, eg)
		}
	}
	tokenGroup, _ := validateTokenGroups(strings.Join(allGroups, ","))
	if tokenGroup == "" {
		tokenGroup = group
	}

	tokenName := "sale"
	if item.BatchId != "" {
		tokenName = item.BatchId
	}
	token := model.Token{
		UserId:         user.Id,
		Name:           tokenName,
		Key:            key,
		CreatedTime:    common.GetTimestamp(),
		AccessedTime:   common.GetTimestamp(),
		ExpiredTime:    -1,
		UnlimitedQuota: item.Unlimited,
		RemainQuota:    internalQuota,
		Group:          tokenGroup,
		BatchId:        item.BatchId,
		Status:         common.TokenStatusEnabled,
	}
	if err := token.Insert(); err != nil {
		res.Error = "创建密钥失败: " + err.Error()
		return res
	}

	res.ApiKey = "sk-" + key
	return res
}

func displayQuotaToInternal(display float64) int {
	switch operation_setting.GetQuotaDisplayType() {
	case operation_setting.QuotaDisplayTypeCNY:
		if operation_setting.USDExchangeRate > 0 {
			return int(display / operation_setting.USDExchangeRate * common.QuotaPerUnit)
		}
		return int(display * common.QuotaPerUnit)
	case operation_setting.QuotaDisplayTypeTokens:
		return int(display)
	default: // USD
		return int(display * common.QuotaPerUnit)
	}
}
