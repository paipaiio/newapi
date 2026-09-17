package common

import (
	"os"
	"strings"
)

func MaskForumDeskSecret(secret string) string {
	secret = strings.TrimSpace(secret)
	if secret == "" {
		return ""
	}
	if len(secret) <= 8 {
		return "********"
	}
	return secret[:4] + "********" + secret[len(secret)-4:]
}

var ForumDeskAPIBase = os.Getenv("FORUMDESK_API_BASE")
var ForumDeskAPIKey = os.Getenv("FORUMDESK_API_KEY")
