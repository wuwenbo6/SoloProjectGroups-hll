package main

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"strconv"
	"sync"
	"time"
)

type AuthChangeLogEntry struct {
	ID          string                 `json:"id"`
	Timestamp   time.Time              `json:"timestamp"`
	SessionID   string                 `json:"session_id"`
	UserName    string                 `json:"user_name"`
	NASIP       string                 `json:"nas_ip"`
	EventType   string                 `json:"event_type"`
	Source      string                 `json:"source"`
	Vendor      string                 `json:"vendor"`
	Changes     map[string]interface{} `json:"changes"`
	Status      string                 `json:"status"`
	Message     string                 `json:"message"`
	NASResponse string                 `json:"nas_response,omitempty"`
}

type AuthChangeLogger struct {
	mu     sync.RWMutex
	logs   []AuthChangeLogEntry
	maxLen int
}

func NewAuthChangeLogger(maxLen int) *AuthChangeLogger {
	return &AuthChangeLogger{
		logs:   make([]AuthChangeLogEntry, 0, maxLen),
		maxLen: maxLen,
	}
}

func (l *AuthChangeLogger) Log(entry AuthChangeLogEntry) {
	l.mu.Lock()
	defer l.mu.Unlock()

	if entry.ID == "" {
		entry.ID = fmt.Sprintf("%d", time.Now().UnixNano())
	}
	if entry.Timestamp.IsZero() {
		entry.Timestamp = time.Now()
	}

	l.logs = append(l.logs, entry)
	if len(l.logs) > l.maxLen {
		l.logs = l.logs[len(l.logs)-l.maxLen:]
	}
}

func (l *AuthChangeLogger) List() []AuthChangeLogEntry {
	l.mu.RLock()
	defer l.mu.RUnlock()
	result := make([]AuthChangeLogEntry, len(l.logs))
	copy(result, l.logs)
	return result
}

func (l *AuthChangeLogger) Filter(sessionID, username, eventType, vendor string, start, end time.Time) []AuthChangeLogEntry {
	l.mu.RLock()
	defer l.mu.RUnlock()

	var result []AuthChangeLogEntry
	for _, entry := range l.logs {
		if sessionID != "" && entry.SessionID != sessionID {
			continue
		}
		if username != "" && entry.UserName != username {
			continue
		}
		if eventType != "" && entry.EventType != eventType {
			continue
		}
		if vendor != "" && entry.Vendor != vendor {
			continue
		}
		if !start.IsZero() && entry.Timestamp.Before(start) {
			continue
		}
		if !end.IsZero() && entry.Timestamp.After(end) {
			continue
		}
		result = append(result, entry)
	}
	return result
}

func (l *AuthChangeLogger) ExportJSON(sessionID, username, eventType, vendor string, start, end time.Time) ([]byte, error) {
	entries := l.Filter(sessionID, username, eventType, vendor, start, end)
	return json.MarshalIndent(entries, "", "  ")
}

func (l *AuthChangeLogger) ExportCSV(sessionID, username, eventType, vendor string, start, end time.Time) ([]byte, error) {
	entries := l.Filter(sessionID, username, eventType, vendor, start, end)

	records := [][]string{
		{"ID", "Timestamp", "SessionID", "UserName", "NASIP", "EventType", "Source", "Vendor", "Status", "Message", "Changes"},
	}

	for _, e := range entries {
		changesJSON, _ := json.Marshal(e.Changes)
		records = append(records, []string{
			e.ID,
			e.Timestamp.Format(time.RFC3339),
			e.SessionID,
			e.UserName,
			e.NASIP,
			e.EventType,
			e.Source,
			e.Vendor,
			e.Status,
			e.Message,
			string(changesJSON),
		})
	}

	buf := make([]byte, 0, 4096)
	writer := csv.NewWriter(&sliceWriter{&buf})
	writer.WriteAll(records)
	writer.Flush()

	return buf, writer.Error()
}

type sliceWriter struct {
	buf *[]byte
}

func (w *sliceWriter) Write(p []byte) (n int, err error) {
	*w.buf = append(*w.buf, p...)
	return len(p), nil
}

func (l *AuthChangeLogger) Clear() {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.logs = l.logs[:0]
}

func (l *AuthChangeLogger) Stats() map[string]int {
	l.mu.RLock()
	defer l.mu.RUnlock()

	stats := map[string]int{
		"total":      len(l.logs),
		"coa":        0,
		"disconnect": 0,
		"success":    0,
		"failed":     0,
		"cisco":      0,
		"huawei":     0,
	}

	for _, e := range l.logs {
		switch e.EventType {
		case "coa":
			stats["coa"]++
		case "disconnect":
			stats["disconnect"]++
		}
		switch e.Status {
		case "success":
			stats["success"]++
		case "failed":
			stats["failed"]++
		}
		switch e.Vendor {
		case "cisco":
			stats["cisco"]++
		case "huawei":
			stats["huawei"]++
		}
	}

	return stats
}

func buildAuthLogEntry(session *Session, eventType, vendor string, changes map[string]interface{}, status, message string) AuthChangeLogEntry {
	return AuthChangeLogEntry{
		ID:        strconv.FormatInt(time.Now().UnixNano(), 10),
		Timestamp: time.Now(),
		SessionID: session.SessionID,
		UserName:  session.UserName,
		NASIP:     session.NASIP,
		EventType: eventType,
		Source:    "api",
		Vendor:    vendor,
		Changes:   changes,
		Status:    status,
		Message:   message,
	}
}
