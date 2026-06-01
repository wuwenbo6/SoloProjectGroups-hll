package audit

import (
	"encoding/json"
	"fmt"
	"os"
	"sync"
	"time"

	"radius-coa-server/internal/session"
)

type ActionType string

const (
	ActionPolicyUpdate   ActionType = "policy_update"
	ActionDisconnect     ActionType = "disconnect"
	ActionSessionStart   ActionType = "session_start"
	ActionSessionStop    ActionType = "session_stop"
	ActionAuthSuccess    ActionType = "auth_success"
	ActionAuthFailure    ActionType = "auth_failure"
)

type LogEntry struct {
	ID          string      `json:"id"`
	Timestamp   time.Time   `json:"timestamp"`
	Action      ActionType  `json:"action"`
	Username    string      `json:"username"`
	SessionID   string      `json:"session_id"`
	NASIP       string      `json:"nas_ip"`
	OperatorIP  string      `json:"operator_ip,omitempty"`
	OldPolicy   *session.Policy `json:"old_policy,omitempty"`
	NewPolicy   *session.Policy `json:"new_policy,omitempty"`
	Reason      string      `json:"reason,omitempty"`
	Success     bool        `json:"success"`
	Message     string      `json:"message,omitempty"`
}

type Logger struct {
	logs    []*LogEntry
	mu      sync.RWMutex
	maxSize int
	logFile *os.File
}

var (
	instance *Logger
	once     sync.Once
)

func GetLogger() *Logger {
	once.Do(func() {
		instance = &Logger{
			logs:    make([]*LogEntry, 0),
			maxSize: 10000,
		}
	})
	return instance
}

func (l *Logger) SetLogFile(path string) error {
	l.mu.Lock()
	defer l.mu.Unlock()

	if l.logFile != nil {
		_ = l.logFile.Close()
	}

	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}
	l.logFile = f
	return nil
}

func (l *Logger) Log(entry *LogEntry) {
	l.mu.Lock()
	defer l.mu.Unlock()

	entry.ID = fmt.Sprintf("audit-%d", time.Now().UnixNano())
	entry.Timestamp = time.Now()

	l.logs = append(l.logs, entry)

	if len(l.logs) > l.maxSize {
		l.logs = l.logs[1:]
	}

	if l.logFile != nil {
		data, _ := json.Marshal(entry)
		_, _ = l.logFile.Write(append(data, '\n'))
	}
}

func (l *Logger) LogPolicyUpdate(username, sessionID, nasIP, operatorIP string, oldPolicy, newPolicy session.Policy, success bool, message string) {
	l.Log(&LogEntry{
		Action:     ActionPolicyUpdate,
		Username:   username,
		SessionID:  sessionID,
		NASIP:      nasIP,
		OperatorIP: operatorIP,
		OldPolicy:  &oldPolicy,
		NewPolicy:  &newPolicy,
		Success:    success,
		Message:    message,
	})
}

func (l *Logger) LogDisconnect(username, sessionID, nasIP, operatorIP, reason string, success bool, message string) {
	l.Log(&LogEntry{
		Action:     ActionDisconnect,
		Username:   username,
		SessionID:  sessionID,
		NASIP:      nasIP,
		OperatorIP: operatorIP,
		Reason:     reason,
		Success:    success,
		Message:    message,
	})
}

func (l *Logger) LogSessionStart(username, sessionID, nasIP, framedIP string) {
	l.Log(&LogEntry{
		Action:    ActionSessionStart,
		Username:  username,
		SessionID: sessionID,
		NASIP:     nasIP,
		Success:   true,
		Message:   fmt.Sprintf("Session started, IP: %s", framedIP),
	})
}

func (l *Logger) LogSessionStop(username, sessionID, nasIP string) {
	l.Log(&LogEntry{
		Action:    ActionSessionStop,
		Username:  username,
		SessionID: sessionID,
		NASIP:     nasIP,
		Success:   true,
		Message:   "Session stopped",
	})
}

func (l *Logger) LogAuth(username, nasIP string, success bool, message string) {
	action := ActionAuthSuccess
	if !success {
		action = ActionAuthFailure
	}
	l.Log(&LogEntry{
		Action:    action,
		Username:  username,
		NASIP:     nasIP,
		Success:   success,
		Message:   message,
	})
}

func (l *Logger) Query(action ActionType, username string, limit int) []*LogEntry {
	l.mu.RLock()
	defer l.mu.RUnlock()

	result := make([]*LogEntry, 0)
	count := 0

	for i := len(l.logs) - 1; i >= 0 && (limit <= 0 || count < limit); i-- {
		entry := l.logs[i]

		if action != "" && entry.Action != action {
			continue
		}
		if username != "" && entry.Username != username {
			continue
		}

		result = append(result, entry)
		count++
	}

	return result
}

func (l *Logger) GetAll(limit int) []*LogEntry {
	return l.Query("", "", limit)
}

func (l *Logger) Close() {
	l.mu.Lock()
	defer l.mu.Unlock()

	if l.logFile != nil {
		_ = l.logFile.Close()
		l.logFile = nil
	}
}
