package service

import (
	"context"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/storage"

	"github.com/bytedance/gopkg/util/gopool"
)

var sessionOrganizeOnce sync.Once

func StartSessionOrganizeTask() {
	sessionOrganizeOnce.Do(func() {
		if !common.IsMasterNode {
			return
		}
		gopool.Go(runSessionOrganizeLoop)
	})
}

func runSessionOrganizeLoop() {
	for {
		now := time.Now().Local()
		next := time.Date(now.Year(), now.Month(), now.Day()+1, 0, 2, 0, 0, now.Location())
		time.Sleep(time.Until(next))

		yesterday := time.Now().AddDate(0, 0, -1)
		loc := time.Local
		dayStart := time.Date(yesterday.Year(), yesterday.Month(), yesterday.Day(), 0, 0, 0, 0, loc)
		date := yesterday.Format("2006-01-02")

		if err := model.OrganizeSessionConversations(date, dayStart.Unix(), dayStart.Unix()+86400, func(ctx context.Context, key string) error {
			return storage.DeleteObject(ctx, key)
		}); err != nil {
			logger.LogWarn(context.Background(), "session organize task failed: "+err.Error())
		}
	}
}
