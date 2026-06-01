package model

import "time"

type Tenant struct {
	ID        string    `json:"id"`
	CreatedAt time.Time `json:"created_at"`
}

type Bucket struct {
	Name      string    `json:"name"`
	TenantID  string    `json:"tenant_id"`
	CreatedAt time.Time `json:"created_at"`
}

func (b *Bucket) FullName() string {
	return b.TenantID + "/" + b.Name
}

type Object struct {
	Key          string    `json:"key"`
	Bucket       string    `json:"bucket"`
	TenantID     string    `json:"tenant_id"`
	Size         int64     `json:"size"`
	ContentType  string    `json:"content_type"`
	ETag         string    `json:"etag"`
	LastModified time.Time `json:"last_modified"`
}

type Credential struct {
	AccessKeyID     string `json:"access_key_id"`
	SecretAccessKey string `json:"secret_access_key"`
	TenantID        string `json:"tenant_id"`
}

type MultipartUpload struct {
	UploadID    string    `json:"upload_id"`
	Bucket      string    `json:"bucket"`
	Key         string    `json:"key"`
	TenantID    string    `json:"tenant_id"`
	ContentType string    `json:"content_type"`
	Initiated   time.Time `json:"initiated"`
}

type Part struct {
	PartNumber   int       `json:"part_number"`
	ETag         string    `json:"etag"`
	Size         int64     `json:"size"`
	LastModified time.Time `json:"last_modified"`
}

type BucketPolicy struct {
	Version   string            `json:"Version"`
	Statement []PolicyStatement `json:"Statement"`
}

type PolicyStatement struct {
	Sid       string          `json:"Sid,omitempty"`
	Effect    string          `json:"Effect"`
	Principal PolicyPrincipal `json:"Principal"`
	Action    []string        `json:"Action"`
	Resource  []string        `json:"Resource"`
}

type PolicyPrincipal struct {
	AWS []string `json:"AWS,omitempty"`
}

type AccessLogEntry struct {
	Timestamp   time.Time `json:"timestamp"`
	RemoteIP    string    `json:"remote_ip"`
	TenantID    string    `json:"tenant_id"`
	AccessKeyID string    `json:"access_key_id"`
	Bucket      string    `json:"bucket"`
	ObjectKey   string    `json:"object_key"`
	Operation   string    `json:"operation"`
	HTTPMethod  string    `json:"http_method"`
	StatusCode  int       `json:"status_code"`
	ErrorCode   string    `json:"error_code,omitempty"`
	BytesSent   int64     `json:"bytes_sent"`
	UserAgent   string    `json:"user_agent"`
	RequestID   string    `json:"request_id"`
}
