package accesslog

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"mini-rgw/model"
)

type Logger struct {
	mu       sync.RWMutex
	entries  []*model.AccessLogEntry
	maxInMem int
	logDir   string
	file     *os.File
}

func NewLogger(logDir string) (*Logger, error) {
	absDir, err := filepath.Abs(logDir)
	if err != nil {
		return nil, fmt.Errorf("invalid log dir: %w", err)
	}
	if err := os.MkdirAll(absDir, 0755); err != nil {
		return nil, err
	}
	logFile := filepath.Join(absDir, "s3_access.log")
	f, err := os.OpenFile(logFile, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return nil, err
	}
	return &Logger{
		entries:  make([]*model.AccessLogEntry, 0),
		maxInMem: 10000,
		logDir:   absDir,
		file:     f,
	}, nil
}

func (l *Logger) Log(entry *model.AccessLogEntry) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.entries = append(l.entries, entry)
	if len(l.entries) > l.maxInMem {
		l.entries = l.entries[len(l.entries)-l.maxInMem:]
	}
	if l.file != nil {
		data, _ := json.Marshal(entry)
		l.file.Write(append(data, '\n'))
	}
}

func (l *Logger) Query(tenantID, bucket, startDate, endDate string, limit, offset int) []*model.AccessLogEntry {
	l.mu.RLock()
	defer l.mu.RUnlock()

	var start, end time.Time
	if startDate != "" {
		start, _ = time.Parse("2006-01-02", startDate)
	}
	if endDate != "" {
		end, _ = time.Parse("2006-01-02", endDate)
		if !end.IsZero() {
			end = end.Add(24 * time.Hour)
		}
	}

	var filtered []*model.AccessLogEntry
	for _, e := range l.entries {
		if tenantID != "" && e.TenantID != tenantID {
			continue
		}
		if bucket != "" && e.Bucket != bucket {
			continue
		}
		if !start.IsZero() && e.Timestamp.Before(start) {
			continue
		}
		if !end.IsZero() && e.Timestamp.After(end) {
			continue
		}
		filtered = append(filtered, e)
	}

	total := len(filtered)
	if offset > total {
		return nil
	}
	if offset > 0 {
		filtered = filtered[offset:]
	}
	if limit > 0 && len(filtered) > limit {
		filtered = filtered[:limit]
	}
	return filtered
}

func (l *Logger) ExportJSON(tenantID, bucket, startDate, endDate string) ([]byte, error) {
	entries := l.Query(tenantID, bucket, startDate, endDate, 0, 0)
	return json.MarshalIndent(entries, "", "  ")
}

func (l *Logger) ExportCSV(tenantID, bucket, startDate, endDate string) ([]byte, error) {
	entries := l.Query(tenantID, bucket, startDate, endDate, 0, 0)

	var buf strings.Builder
	writer := csv.NewWriter(&buf)
	writer.Write([]string{"timestamp", "remote_ip", "tenant_id", "access_key_id", "bucket", "object_key", "operation", "http_method", "status_code", "error_code", "bytes_sent", "user_agent", "request_id"})
	for _, e := range entries {
		writer.Write([]string{
			e.Timestamp.Format(time.RFC3339),
			e.RemoteIP,
			e.TenantID,
			e.AccessKeyID,
			e.Bucket,
			e.ObjectKey,
			e.Operation,
			e.HTTPMethod,
			fmt.Sprintf("%d", e.StatusCode),
			e.ErrorCode,
			fmt.Sprintf("%d", e.BytesSent),
			e.UserAgent,
			e.RequestID,
		})
	}
	writer.Flush()
	return []byte(buf.String()), nil
}

func (l *Logger) Close() error {
	if l.file != nil {
		return l.file.Close()
	}
	return nil
}
