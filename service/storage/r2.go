package storage

import (
	"bytes"
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// 会话正文对象存储客户端(S3 兼容,面向 Cloudflare R2)。
// 客户端按当前配置惰性构建并缓存;配置变更时通过 Reset() 失效重建。

var (
	mu           sync.RWMutex
	cachedClient *s3.Client
	cachedSig    string // 反映构建客户端时所用配置的指纹,用于检测变更
)

func configSignature(s *operation_setting.StorageSetting) string {
	return fmt.Sprintf("%s|%s|%s|%s", s.Endpoint, s.Region, s.Bucket, s.AccessKey)
}

// Reset 使缓存的客户端失效,下次使用时按最新配置重建。配置保存后调用。
func Reset() {
	mu.Lock()
	cachedClient = nil
	cachedSig = ""
	mu.Unlock()
}

func getClient() (*s3.Client, *operation_setting.StorageSetting, error) {
	s := operation_setting.GetStorageSetting()
	if s.Endpoint == "" || s.Bucket == "" || s.AccessKey == "" || s.SecretKey == "" {
		return nil, nil, fmt.Errorf("storage not fully configured")
	}
	sig := configSignature(s)

	mu.RLock()
	if cachedClient != nil && cachedSig == sig {
		c := cachedClient
		mu.RUnlock()
		return c, s, nil
	}
	mu.RUnlock()

	mu.Lock()
	defer mu.Unlock()
	if cachedClient != nil && cachedSig == sig {
		return cachedClient, s, nil
	}

	region := s.Region
	if region == "" {
		region = "auto"
	}
	client := s3.New(s3.Options{
		Region:       region,
		BaseEndpoint: aws.String(s.Endpoint),
		Credentials: credentials.NewStaticCredentialsProvider(
			s.AccessKey, s.SecretKey, "",
		),
		// R2 / 多数 S3 兼容服务需路径风格访问。
		UsePathStyle: true,
	})
	cachedClient = client
	cachedSig = sig
	return client, s, nil
}

// PutGzip 将 data 经 gzip 压缩后写入对象存储。返回最终对象 key。
func PutGzip(ctx context.Context, key string, data []byte, contentType string) error {
	client, s, err := getClient()
	if err != nil {
		return err
	}
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	if _, err := gz.Write(data); err != nil {
		return err
	}
	if err := gz.Close(); err != nil {
		return err
	}

	ce := "gzip"
	_, err = client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:          aws.String(s.Bucket),
		Key:             aws.String(key),
		Body:            bytes.NewReader(buf.Bytes()),
		ContentEncoding: aws.String(ce),
		ContentType:     aws.String(contentType),
	})
	return err
}

// GetGunzip 读取并解压一个由 PutGzip 写入的对象。
func GetGunzip(ctx context.Context, key string) ([]byte, error) {
	client, s, err := getClient()
	if err != nil {
		return nil, err
	}
	out, err := client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.Bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return nil, err
	}
	defer out.Body.Close()
	gz, err := gzip.NewReader(out.Body)
	if err != nil {
		return nil, err
	}
	defer gz.Close()
	return io.ReadAll(gz)
}

// PutRaw 上传原始字节(不 gzip),用于存储图片/文件等二进制数据。
func PutRaw(ctx context.Context, key string, data []byte, contentType string) error {
	client, s, err := getClient()
	if err != nil {
		return err
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	_, err = client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(s.Bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(data),
		ContentType: aws.String(contentType),
	})
	return err
}

// GetRaw 下载原始字节(不解压),与 PutRaw 配对。
func GetRaw(ctx context.Context, key string) ([]byte, error) {
	client, s, err := getClient()
	if err != nil {
		return nil, err
	}
	out, err := client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.Bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return nil, err
	}
	defer out.Body.Close()
	return io.ReadAll(out.Body)
}

// TestConnection 校验当前配置能否正常写入并删除一个探针对象。
// 用于管理面板的「测试连接」按钮。
func TestConnection(ctx context.Context) error {
	client, s, err := getClient()
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	probeKey := fmt.Sprintf("%s/.healthcheck/%d", s.KeyPrefix, time.Now().UnixNano())
	if _, err := client.PutObject(ctx, &s3.PutObjectInput{
		Bucket: aws.String(s.Bucket),
		Key:    aws.String(probeKey),
		Body:   bytes.NewReader([]byte("ok")),
	}); err != nil {
		return fmt.Errorf("写入测试失败: %w", err)
	}
	// 清理探针对象(失败不致命)。
	_, _ = client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(s.Bucket),
		Key:    aws.String(probeKey),
	})
	return nil
}

// DeleteObject 删除单个对象。键不存在时不报错(S3 语义)。
func DeleteObject(ctx context.Context, key string) error {
	if key == "" {
		return nil
	}
	client, s, err := getClient()
	if err != nil {
		return err
	}
	_, err = client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(s.Bucket),
		Key:    aws.String(key),
	})
	return err
}
