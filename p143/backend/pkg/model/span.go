package model

import "time"

type Span struct {
	TraceID      string                 `json:"trace_id"`
	SpanID       string                 `json:"span_id"`
	ParentSpanID string                 `json:"parent_span_id,omitempty"`
	ServiceName  string                 `json:"service_name"`
	Name         string                 `json:"name"`
	Kind         string                 `json:"kind,omitempty"`
	StartTime    time.Time              `json:"start_time"`
	EndTime      time.Time              `json:"end_time"`
	Duration     int64                  `json:"duration"`
	Attributes   map[string]interface{} `json:"attributes,omitempty"`
	Events       []SpanEvent            `json:"events,omitempty"`
	Links        []SpanLink             `json:"links,omitempty"`
	Status       SpanStatus             `json:"status"`
}

type SpanEvent struct {
	Name       string                 `json:"name"`
	Time       time.Time              `json:"time"`
	Attributes map[string]interface{} `json:"attributes,omitempty"`
}

type SpanLink struct {
	TraceID    string                 `json:"trace_id"`
	SpanID     string                 `json:"span_id"`
	TraceState string                 `json:"trace_state,omitempty"`
	Attributes map[string]interface{} `json:"attributes,omitempty"`
}

type SpanStatus struct {
	Code        string `json:"code"`
	Description string `json:"description,omitempty"`
}

type Trace struct {
	TraceID    string    `json:"trace_id"`
	Spans      []Span    `json:"spans"`
	TotalDuration int64 `json:"total_duration,omitempty"`
}

type ServiceDependency struct {
	Client string `json:"client"`
	Server string `json:"server"`
	Count  int64  `json:"count"`
}

type Alert struct {
	ID          string    `json:"id"`
	TraceID     string    `json:"trace_id"`
	Type        string    `json:"type"`
	Severity    string    `json:"severity"`
	Message     string    `json:"message"`
	ServiceName string    `json:"service_name,omitempty"`
	Duration    int64     `json:"duration,omitempty"`
	Threshold   int64     `json:"threshold,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	Resolved    bool      `json:"resolved"`
	ResolvedAt  time.Time `json:"resolved_at,omitempty"`
}

type AlertConfig struct {
	Enabled               bool  `json:"enabled"`
	SlowTraceThresholdMs  int64 `json:"slow_trace_threshold_ms"`
	SlowSpanThresholdMs   int64 `json:"slow_span_threshold_ms"`
	ErrorRateThreshold    float64 `json:"error_rate_threshold"`
	MaxAlertsPerMinute    int   `json:"max_alerts_per_minute"`
}

type SamplingConfig struct {
	Enabled         bool    `json:"enabled"`
	SamplingRate    float64 `json:"sampling_rate"`
	MinSamplesPerSec int    `json:"min_samples_per_sec"`
	SlowTraceAlwaysSample bool `json:"slow_trace_always_sample"`
	ErrorAlwaysSample bool   `json:"error_always_sample"`
}
