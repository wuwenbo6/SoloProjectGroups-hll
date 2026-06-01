package scraper

import "time"

type Metrics struct {
	ServerName     string            `json:"server_name"`
	Timestamp      time.Time         `json:"timestamp"`
	SessionCount   int64             `json:"session_count"`
	TotalBytesIn    int64             `json:"total_bytes_in"`
	TotalBytesOut   int64             `json:"total_bytes_out"`
	IPDistribution map[string]int64  `json:"ip_distribution"`
}

type Scraper interface {
	Scrape() (*Metrics, error)
	Name() string
}
