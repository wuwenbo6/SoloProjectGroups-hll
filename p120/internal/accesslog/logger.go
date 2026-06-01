package accesslog

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sync"
	"time"

	"coap-gateway/internal/config"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"gopkg.in/natefinch/lumberjack.v2"
)

type HTTPAccessLog struct {
	Timestamp     time.Time `json:"timestamp"`
	Method        string    `json:"method"`
	Path          string    `json:"path"`
	Query         string    `json:"query,omitempty"`
	StatusCode    int       `json:"status_code"`
	Latency       int64     `json:"latency_ms"`
	ClientIP      string    `json:"client_ip"`
	UserAgent     string    `json:"user_agent,omitempty"`
	RequestID     string    `json:"request_id,omitempty"`
	DeviceID      string    `json:"device_id,omitempty"`
	ContentLength int64     `json:"content_length,omitempty"`
	Protocol      string    `json:"protocol"`
}

type CoAPAccessLog struct {
	Timestamp     time.Time `json:"timestamp"`
	Code          string    `json:"code"`
	Path          string    `json:"path"`
	Query         string    `json:"query,omitempty"`
	MessageID     uint16    `json:"message_id,omitempty"`
	Token         string    `json:"token,omitempty"`
	DeviceID      string    `json:"device_id,omitempty"`
	ClientAddr    string    `json:"client_addr"`
	Protocol      string    `json:"protocol"`
	Latency       int64     `json:"latency_ms,omitempty"`
	ContentLength int       `json:"content_length,omitempty"`
	Type          string    `json:"type,omitempty"`
}

type Logger struct {
	cfg          *config.AccessLogConfig
	logger       *zap.Logger
	fileLogger   *lumberjack.Logger
	writer       io.Writer
	enabled      bool
	mu           sync.Mutex
}

var (
	globalLogger *Logger
	once         sync.Once
)

func NewLogger(cfg *config.AccessLogConfig, zapLogger *zap.Logger) *Logger {
	once.Do(func() {
		globalLogger = &Logger{
			cfg:     cfg,
			logger:  zapLogger,
			enabled: cfg.Enabled,
		}

		if cfg.Enabled {
			if err := os.MkdirAll(filepath.Dir(cfg.FilePath), 0755); err != nil {
				zapLogger.Error("Failed to create log directory", zap.Error(err))
				globalLogger.enabled = false
				return
			}

			globalLogger.fileLogger = &lumberjack.Logger{
				Filename:   cfg.FilePath,
				MaxSize:    cfg.MaxSize,
				MaxBackups: cfg.MaxBackups,
				MaxAge:     cfg.MaxAge,
				Compress:   true,
			}

			if cfg.Format == "json" {
				globalLogger.writer = globalLogger.fileLogger
			} else {
				globalLogger.writer = io.MultiWriter(globalLogger.fileLogger, os.Stdout)
			}
		}
	})

	return globalLogger
}

func GetLogger() *Logger {
	return globalLogger
}

func (l *Logger) LogHTTP(entry HTTPAccessLog) {
	if !l.enabled {
		return
	}

	l.mu.Lock()
	defer l.mu.Unlock()

	entry.Timestamp = time.Now()
	entry.Protocol = "HTTP"

	if l.cfg.Format == "json" {
		data, err := json.Marshal(entry)
		if err != nil {
			l.logger.Error("Failed to marshal HTTP access log", zap.Error(err))
			return
		}
		fmt.Fprintln(l.writer, string(data))
	} else {
		line := fmt.Sprintf(
			"%s [%s] %s %s %s %d %dms %s",
			entry.Timestamp.Format(time.RFC3339),
			entry.ClientIP,
			entry.Method,
			entry.Path,
			entry.Query,
			entry.StatusCode,
			entry.Latency,
			entry.UserAgent,
		)
		fmt.Fprintln(l.writer, line)
	}
}

func (l *Logger) LogCoAP(entry CoAPAccessLog) {
	if !l.enabled {
		return
	}

	l.mu.Lock()
	defer l.mu.Unlock()

	entry.Timestamp = time.Now()

	if l.cfg.Format == "json" {
		data, err := json.Marshal(entry)
		if err != nil {
			l.logger.Error("Failed to marshal CoAP access log", zap.Error(err))
			return
		}
		fmt.Fprintln(l.writer, string(data))
	} else {
		line := fmt.Sprintf(
			"%s [%s] %s %s %s %s",
			entry.Timestamp.Format(time.RFC3339),
			entry.ClientAddr,
			entry.Protocol,
			entry.Code,
			entry.Path,
			entry.Query,
		)
		fmt.Fprintln(l.writer, line)
	}
}

func (l *Logger) Close() error {
	l.mu.Lock()
	defer l.mu.Unlock()

	if l.fileLogger != nil {
		return l.fileLogger.Close()
	}
	return nil
}

type responseBodyWriter struct {
	gin.ResponseWriter
	body *bytes.Buffer
}

func (r *responseBodyWriter) Write(b []byte) (int, error) {
	r.body.Write(b)
	return r.ResponseWriter.Write(b)
}

func HTTPMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		logger := GetLogger()
		if logger == nil || !logger.enabled {
			c.Next()
			return
		}

		start := time.Now()
		path := c.Request.URL.Path
		query := c.Request.URL.RawQuery

		c.Next()

		latency := time.Since(start).Milliseconds()

		entry := HTTPAccessLog{
			Method:        c.Request.Method,
			Path:          path,
			Query:         query,
			StatusCode:    c.Writer.Status(),
			Latency:       latency,
			ClientIP:      c.ClientIP(),
			UserAgent:     c.Request.UserAgent(),
			RequestID:     c.Writer.Header().Get("X-Request-ID"),
			DeviceID:      c.Param("device_id"),
			ContentLength: int64(c.Writer.Size()),
		}

		logger.LogHTTP(entry)
	}
}
