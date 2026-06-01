package models

import (
	"time"

	"github.com/google/uuid"
)

type LogEntry struct {
	ID        string                 `json:"id"`
	Timestamp time.Time              `json:"timestamp"`
	Source    string                 `json:"source"`
	Severity  string                 `json:"severity"`
	Message   string                 `json:"message"`
	Hostname  string                 `json:"hostname"`
	Facility  string                 `json:"facility"`
	Fields    map[string]interface{} `json:"fields"`
	Raw       string                 `json:"raw,omitempty"`
}

func NewLogEntry() *LogEntry {
	return &LogEntry{
		ID:        uuid.New().String(),
		Timestamp: time.Now(),
		Fields:    make(map[string]interface{}),
	}
}

type Event struct {
	ID          string                 `json:"id"`
	Type        string                 `json:"type"`
	Timestamp   time.Time              `json:"timestamp"`
	LogEntryID  string                 `json:"log_entry_id"`
	Hostname    string                 `json:"hostname"`
	Source      string                 `json:"source"`
	Attributes  map[string]interface{} `json:"attributes"`
	Description string                 `json:"description"`
}

type Alert struct {
	ID          string    `json:"id"`
	RuleID      string    `json:"rule_id"`
	RuleName    string    `json:"rule_name"`
	Severity    string    `json:"severity"`
	Timestamp   time.Time `json:"timestamp"`
	EventIDs    []string  `json:"event_ids"`
	Events      []Event   `json:"events,omitempty"`
	Description string    `json:"description"`
	Status      string    `json:"status"`
}

const (
	AlertStatusNew       = "new"
	AlertStatusAcknowledged = "acknowledged"
	AlertStatusResolved  = "resolved"
)
