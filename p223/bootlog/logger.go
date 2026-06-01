package bootlog

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type BootEntry struct {
	MAC       string    `json:"mac"`
	Timestamp time.Time `json:"timestamp"`
	OSType    string    `json:"os_type,omitempty"`
	IP        string    `json:"ip,omitempty"`
	UserAgent string    `json:"user_agent,omitempty"`
}

type BootLogger struct {
	mu       sync.Mutex
	filePath string
	entries  []BootEntry
}

func NewBootLogger(filePath string) (*BootLogger, error) {
	logger := &BootLogger{
		filePath: filePath,
		entries:  make([]BootEntry, 0),
	}

	if err := os.MkdirAll(filepath.Dir(filePath), 0755); err != nil {
		return nil, fmt.Errorf("failed to create log directory: %w", err)
	}

	if data, err := os.ReadFile(filePath); err == nil {
		if len(data) > 0 {
			if err := json.Unmarshal(data, &logger.entries); err != nil {
				return nil, fmt.Errorf("failed to parse existing boot log: %w", err)
			}
		}
	}

	return logger, nil
}

func (l *BootLogger) Log(mac, osType, ip, userAgent string) error {
	l.mu.Lock()
	defer l.mu.Unlock()

	entry := BootEntry{
		MAC:       mac,
		Timestamp: time.Now(),
		OSType:    osType,
		IP:        ip,
		UserAgent: userAgent,
	}

	l.entries = append(l.entries, entry)

	return l.save()
}

func (l *BootLogger) GetAll() []BootEntry {
	l.mu.Lock()
	defer l.mu.Unlock()

	entries := make([]BootEntry, len(l.entries))
	copy(entries, l.entries)
	return entries
}

func (l *BootLogger) GetByMAC(mac string) []BootEntry {
	l.mu.Lock()
	defer l.mu.Unlock()

	var result []BootEntry
	for _, e := range l.entries {
		if e.MAC == mac {
			result = append(result, e)
		}
	}
	return result
}

func (l *BootLogger) GetLastN(n int) []BootEntry {
	l.mu.Lock()
	defer l.mu.Unlock()

	if n <= 0 {
		return nil
	}
	if n >= len(l.entries) {
		entries := make([]BootEntry, len(l.entries))
		copy(entries, l.entries)
		return entries
	}

	entries := make([]BootEntry, n)
	copy(entries, l.entries[len(l.entries)-n:])
	return entries
}

func (l *BootLogger) save() error {
	data, err := json.MarshalIndent(l.entries, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal boot log: %w", err)
	}

	tmpPath := l.filePath + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write boot log: %w", err)
	}

	return os.Rename(tmpPath, l.filePath)
}

func (l *BootLogger) Close() error {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.save()
}
