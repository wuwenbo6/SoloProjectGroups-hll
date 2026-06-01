package types

import "time"

const (
	RegisterTypeInitial  = "initial"
	RegisterTypeRefresh  = "refresh"
	RegisterTypeUnknown  = "unknown"
)

type SIPRegister struct {
	SourceIP     string    `json:"source_ip"`
	Destination  string    `json:"destination"`
	CallID       string    `json:"call_id"`
	From         string    `json:"from"`
	To           string    `json:"to"`
	UserAgent    string    `json:"user_agent"`
	Contact      string    `json:"contact"`
	Expires      int       `json:"expires"`
	RegisterType string    `json:"register_type"`
	Timestamp    time.Time `json:"timestamp"`
}

type FrequencyStats struct {
	IP              string    `json:"ip"`
	Count           int       `json:"count"`
	WeightedCount   float64   `json:"weighted_count"`
	Rate            float64   `json:"rate"`
	WeightedRate    float64   `json:"weighted_rate"`
	InitialCount    int       `json:"initial_count"`
	RefreshCount    int       `json:"refresh_count"`
	FirstSeen       time.Time `json:"first_seen"`
	LastSeen        time.Time `json:"last_seen"`
	IsAlerting      bool      `json:"is_alerting"`
	AlertLevel      string    `json:"alert_level"`
}

type AlertEvent struct {
	ID            string            `json:"id"`
	IP            string            `json:"ip"`
	Count         int               `json:"count"`
	WeightedCount float64           `json:"weighted_count"`
	Rate          float64           `json:"rate"`
	WeightedRate  float64           `json:"weighted_rate"`
	InitialCount  int               `json:"initial_count"`
	RefreshCount  int               `json:"refresh_count"`
	Threshold     float64           `json:"threshold"`
	GeoInfo       *GeoInfo          `json:"geo_info"`
	Timestamp     time.Time         `json:"timestamp"`
	UserAgents    []string          `json:"user_agents"`
	Destinations  map[string]int    `json:"destinations"`
	Contacts      map[string]int    `json:"contacts"`
}

type GeoInfo struct {
	Country     string  `json:"country"`
	CountryCode string  `json:"country_code"`
	City        string  `json:"city"`
	Latitude    float64 `json:"latitude"`
	Longitude   float64 `json:"longitude"`
	Timezone    string  `json:"timezone"`
	ISP         string  `json:"isp"`
	ASN         uint    `json:"asn"`
}

type BlockedIP struct {
	IP          string    `json:"ip"`
	Reason      string    `json:"reason"`
	BlockedAt   time.Time `json:"blocked_at"`
	ExpiresAt   time.Time `json:"expires_at"`
	Duration    int64     `json:"duration_seconds"`
	Rate        float64   `json:"rate"`
	WeightedRate float64  `json:"weighted_rate"`
	GeoInfo     *GeoInfo  `json:"geo_info"`
	IsPermanent bool     `json:"is_permanent"`
	RuleSource   string    `json:"rule_source"`
}

type LogEntry struct {
	Timestamp   time.Time `json:"timestamp"`
	Type      string    `json:"type"`
	IP        string    `json:"ip"`
	Message   string    `json:"message"`
	Rate      float64   `json:"rate"`
	WeightedRate float64  `json:"weighted_rate"`
	GeoInfo   *GeoInfo  `json:"geo_info"`
	Details   map[string]interface{} `json:"details"`
}
