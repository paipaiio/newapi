/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

package controller

import (
	"fmt"
	"net/http"
	"time"

	"github.com/QuantumNous/new-api/service/statusmonitor"

	"github.com/gin-gonic/gin"
)

// 状态监控相关接口（迁移自旧 python 服务 tt-monitor）。
// public：status/meta/events（只暴露非敏感可用性 + 公开指标，与旧 status.json 公开口径一致）。
// user：usercache/whoami。admin：groups/metrics/config/annotation。

func StatusMonitorStatus(c *gin.Context) {
	c.JSON(http.StatusOK, statusmonitor.CurrentStatus())
}

func StatusMonitorMeta(c *gin.Context) {
	c.JSON(http.StatusOK, statusmonitor.LoadMeta())
}

// StatusMonitorWhoami 返回当前会话是否管理员（未登录返回 false，不报错）。
func StatusMonitorWhoami(c *gin.Context) {
	role := c.GetInt("role")
	c.JSON(http.StatusOK, gin.H{"admin": role >= 10})
}

// StatusMonitorUserCache 每用户缓存命中指标（登录用户，只看自己）。
func StatusMonitorUserCache(c *gin.Context) {
	uid := c.GetInt("id")
	if uid <= 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	d := statusmonitor.UserCacheMetrics(uid)
	d["username"] = c.GetString("username")
	c.JSON(http.StatusOK, d)
}

func StatusMonitorGroups(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"groups": statusmonitor.GroupsForAdmin()})
}

func StatusMonitorMetrics(c *gin.Context) {
	c.JSON(http.StatusOK, statusmonitor.AdminMetrics())
}

// StatusMonitorConfig 更新分组配置 + 标题/副标题。
func StatusMonitorConfig(c *gin.Context) {
	var body struct {
		Config struct {
			Title    string                            `json:"title"`
			Subtitle string                            `json:"subtitle"`
			Lang     string                            `json:"lang"`
			Groups   map[string]map[string]interface{} `json:"groups"`
		} `json:"config"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bad body"})
		return
	}
	titleSub := map[string]string{}
	if body.Config.Title != "" {
		titleSub["title"] = body.Config.Title
	}
	if body.Config.Subtitle != "" {
		titleSub["subtitle"] = body.Config.Subtitle
	}
	if body.Config.Lang != "" {
		titleSub["lang"] = body.Config.Lang
	}
	cfg := statusmonitor.UpdateGroupConfig(body.Config.Groups, titleSub)
	c.JSON(http.StatusOK, gin.H{"ok": true, "config": cfg})
}

// StatusMonitorAnnotation 添加公告。
func StatusMonitorAnnotation(c *gin.Context) {
	var body struct {
		Type  string `json:"type"`
		Title string `json:"title"`
		Date  string `json:"date"`
		Body  string `json:"body"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Title == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "title required"})
		return
	}
	anns := statusmonitor.AddAnnotation(body.Type, body.Title, body.Date, body.Body)
	c.JSON(http.StatusOK, gin.H{"ok": true, "annotations": anns})
}

// StatusMonitorAnnotationDelete 删除公告。
func StatusMonitorAnnotationDelete(c *gin.Context) {
	var body struct {
		Id string `json:"id"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bad body"})
		return
	}
	anns := statusmonitor.DeleteAnnotation(body.Id)
	c.JSON(http.StatusOK, gin.H{"ok": true, "annotations": anns})
}

// StatusMonitorEvents SSE 推流：状态一变就推。
func StatusMonitorEvents(c *gin.Context) {
	c.Header("Content-Type", "text/event-stream; charset=utf-8")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	ch, unsub := statusmonitor.SubscribeSSE()
	defer unsub()

	// 首帧：当前快照
	if payload, ok := statusmonitor.CurrentStatusPayload(); ok {
		fmt.Fprintf(c.Writer, "data: %s\n\n", payload)
		c.Writer.Flush()
	}

	notify := c.Request.Context().Done()
	ticker := time.NewTicker(18 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-notify:
			return
		case payload := <-ch:
			fmt.Fprintf(c.Writer, "data: %s\n\n", payload)
			c.Writer.Flush()
		case <-ticker.C:
			fmt.Fprint(c.Writer, ": ping\n\n")
			c.Writer.Flush()
		}
	}
}
