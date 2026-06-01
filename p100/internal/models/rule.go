package models

import "time"

type Rule struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Severity    string    `json:"severity"`
	Enabled     bool      `json:"enabled"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`

	EventType     string   `json:"event_type"`
	Condition     string   `json:"condition"`
	Correlation   *CorrelationConfig `json:"correlation,omitempty"`
	Action        string   `json:"action"`
}

type CorrelationConfig struct {
	Type              string `json:"type"`
	GroupByField      string `json:"group_by_field"`
	TimeWindowSeconds int    `json:"time_window_seconds"`
	MinCount          int    `json:"min_count"`
	EventSequence     []EventCondition `json:"event_sequence,omitempty"`
}

type EventCondition struct {
	EventType string            `json:"event_type"`
	Filters   map[string]string `json:"filters"`
}
