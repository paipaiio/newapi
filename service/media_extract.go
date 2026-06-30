package service

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/service/storage"
)

// ExtractAndUploadMedia 从请求 JSON 中提取 base64 图片/文件,
// 上传到 R2 的 attachments/ 目录,原位置替换为 r2_ref 引用后返回瘦身后的正文。
// 第二个返回值为附件摘要(文件名/类型),用于追加到 content_text 以支持文件搜索。
func ExtractAndUploadMedia(ctx context.Context, body json.RawMessage, userId int, requestId string, ts int64) (json.RawMessage, string) {
	if len(body) == 0 {
		return body, ""
	}
	var req map[string]interface{}
	if json.Unmarshal(body, &req) != nil {
		return body, ""
	}

	msgs := arrayOf(req["messages"])
	if msgs == nil {
		msgs = arrayOf(req["input"])
	}
	if msgs == nil {
		return body, ""
	}

	prefix := fmt.Sprintf("attachments/%s/%s/%d/%s",
		time.Unix(ts, 0).UTC().Format("2006"),
		time.Unix(ts, 0).UTC().Format("01"),
		userId, requestId)

	idx := 0
	modified := false
	var mediaSummary []string
	for _, rawMsg := range msgs {
		msg, _ := rawMsg.(map[string]interface{})
		if msg == nil {
			continue
		}
		parts := arrayOf(msg["content"])
		if parts == nil {
			continue
		}
		for i, rawPart := range parts {
			p, _ := rawPart.(map[string]interface{})
			if p == nil {
				continue
			}
			var mimeType, b64Data, partType string
			switch p["type"] {
			case "image":
				src, _ := p["source"].(map[string]interface{})
				if src == nil || src["type"] != "base64" {
					continue
				}
				mimeType, _ = src["media_type"].(string)
				b64Data, _ = src["data"].(string)
				partType = "img"
			case "image_url":
				imgUrl, _ := p["image_url"].(map[string]interface{})
				if imgUrl == nil {
					continue
				}
				url, _ := imgUrl["url"].(string)
				if !strings.HasPrefix(url, "data:") {
					continue
				}
				halves := strings.SplitN(url, ",", 2)
				if len(halves) != 2 {
					continue
				}
				header := strings.TrimPrefix(halves[0], "data:")
				parts2 := strings.SplitN(header, ";", 2)
				mimeType = parts2[0]
				b64Data = halves[1]
				partType = "img"
			case "document":
				src, _ := p["source"].(map[string]interface{})
				if src == nil || src["type"] != "base64" {
					continue
				}
				mimeType, _ = src["media_type"].(string)
				b64Data, _ = src["data"].(string)
				partType = "doc"
			default:
				continue
			}
			if b64Data == "" {
				continue
			}

			data, err := base64.StdEncoding.DecodeString(b64Data)
			if err != nil {
				data, err = base64.RawStdEncoding.DecodeString(b64Data)
				if err != nil {
					continue
				}
			}

			ext := mimeToExt(mimeType)
			r2Key := fmt.Sprintf("%s-%d-%s.%s", prefix, idx, partType, ext)
			uploadCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
			uploadErr := storage.PutRaw(uploadCtx, r2Key, data, mimeType)
			cancel()
			if uploadErr != nil {
				continue
			}

			ref := map[string]interface{}{"type": "r2_ref", "r2_key": r2Key, "media_type": mimeType}
			switch p["type"] {
			case "image":
				p["source"] = ref
			case "image_url":
				p["image_url"] = map[string]interface{}{"url": "[r2_ref]", "r2_key": r2Key}
			case "document":
				// 保留文档 title 等字段供检索
				title, _ := p["title"].(string)
				p["source"] = ref
				if title != "" {
					mediaSummary = append(mediaSummary, "[附件:"+title+"]")
				}
			}
			if partType == "img" {
				mediaSummary = append(mediaSummary, "[图片:"+mimeType+"]")
			}
			parts[i] = p
			idx++
			modified = true
		}
		msg["content"] = parts
	}

	if !modified {
		return body, ""
	}
	out, err := json.Marshal(req)
	if err != nil {
		return body, ""
	}
	return out, strings.Join(mediaSummary, " ")
}

func arrayOf(v interface{}) []interface{} {
	a, _ := v.([]interface{})
	return a
}

func mimeToExt(mime string) string {
	switch strings.ToLower(strings.TrimSpace(mime)) {
	case "image/jpeg", "image/jpg":
		return "jpg"
	case "image/png":
		return "png"
	case "image/gif":
		return "gif"
	case "image/webp":
		return "webp"
	case "image/svg+xml":
		return "svg"
	case "application/pdf":
		return "pdf"
	case "text/plain":
		return "txt"
	case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
		return "docx"
	case "application/msword":
		return "doc"
	default:
		return "bin"
	}
}
