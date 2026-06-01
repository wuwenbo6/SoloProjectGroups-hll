package report

import (
	"encoding/json"
	"fmt"
	"time"

	"stun-turn-monitor/internal/alert"
	"stun-turn-monitor/internal/scraper"
)

type Report struct {
	Version     string          `json:"version"`
	GeneratedAt time.Time       `json:"generated_at"`
	TimeRange   TimeRange       `json:"time_range"`
	Servers     []ServerReport  `json:"servers"`
	Alerts      []*alert.Alert  `json:"alerts,omitempty"`
	Summary     ReportSummary   `json:"summary"`
}

type TimeRange struct {
	Start time.Time `json:"start"`
	End   time.Time `json:"end"`
}

type ServerReport struct {
	ServerName  string              `json:"server_name"`
	Metrics     []*scraper.Metrics  `json:"metrics"`
	Stats       ServerStats         `json:"stats"`
}

type ServerStats struct {
	AvgSessionCount    float64 `json:"avg_session_count"`
	MaxSessionCount    int64   `json:"max_session_count"`
	MinSessionCount    int64   `json:"min_session_count"`
	TotalBytesIn       int64   `json:"total_bytes_in"`
	TotalBytesOut      int64   `json:"total_bytes_out"`
	AvgBytesInPerSec   float64 `json:"avg_bytes_in_per_sec"`
	AvgBytesOutPerSec  float64 `json:"avg_bytes_out_per_sec"`
	UniqueIPCount      int     `json:"unique_ip_count"`
	DataPointCount     int     `json:"data_point_count"`
}

type ReportSummary struct {
	TotalServers       int     `json:"total_servers"`
	TotalDataPoints    int     `json:"total_data_points"`
	TotalAlerts        int     `json:"total_alerts"`
	ActiveAlerts       int     `json:"active_alerts"`
	OverallAvgSessions float64 `json:"overall_avg_sessions"`
	TotalTrafficInGB   float64 `json:"total_traffic_in_gb"`
	TotalTrafficOutGB  float64 `json:"total_traffic_out_gb"`
}

func GenerateReport(servers []string, metrics map[string][]*scraper.Metrics, alerts []*alert.Alert, start, end time.Time) *Report {
	report := &Report{
		Version:     "1.0",
		GeneratedAt: time.Now(),
		TimeRange: TimeRange{
			Start: start,
			End:   end,
		},
		Alerts: alerts,
	}

	var totalDataPoints int
	var totalSessions float64
	var totalBytesIn, totalBytesOut int64

	for _, serverName := range servers {
		serverMetrics := metrics[serverName]
		serverReport := ServerReport{
			ServerName: serverName,
			Metrics:    serverMetrics,
			Stats:      calculateStats(serverMetrics, start, end),
		}
		report.Servers = append(report.Servers, serverReport)

		totalDataPoints += serverReport.Stats.DataPointCount
		totalSessions += serverReport.Stats.AvgSessionCount
		totalBytesIn += serverReport.Stats.TotalBytesIn
		totalBytesOut += serverReport.Stats.TotalBytesOut
	}

	activeAlerts := 0
	for _, a := range alerts {
		if !a.Resolved {
			activeAlerts++
		}
	}

	report.Summary = ReportSummary{
		TotalServers:       len(servers),
		TotalDataPoints:    totalDataPoints,
		TotalAlerts:        len(alerts),
		ActiveAlerts:       activeAlerts,
		OverallAvgSessions: totalSessions / float64(len(servers)),
		TotalTrafficInGB:   float64(totalBytesIn) / 1024 / 1024 / 1024,
		TotalTrafficOutGB:  float64(totalBytesOut) / 1024 / 1024 / 1024,
	}

	return report
}

func calculateStats(metrics []*scraper.Metrics, start, end time.Time) ServerStats {
	if len(metrics) == 0 {
		return ServerStats{}
	}

	var totalSessions int64
	var maxSessions, minSessions int64
	var totalBytesIn, totalBytesOut int64
	uniqueIPs := make(map[string]bool)

	for i, m := range metrics {
		totalSessions += m.SessionCount
		totalBytesIn += m.TotalBytesIn
		totalBytesOut += m.TotalBytesOut

		if i == 0 || m.SessionCount > maxSessions {
			maxSessions = m.SessionCount
		}
		if i == 0 || m.SessionCount < minSessions {
			minSessions = m.SessionCount
		}

		for ip := range m.IPDistribution {
			uniqueIPs[ip] = true
		}
	}

	duration := end.Sub(start).Seconds()
	if duration <= 0 {
		duration = 1
	}

	return ServerStats{
		AvgSessionCount:   float64(totalSessions) / float64(len(metrics)),
		MaxSessionCount:   maxSessions,
		MinSessionCount:   minSessions,
		TotalBytesIn:      totalBytesIn,
		TotalBytesOut:     totalBytesOut,
		AvgBytesInPerSec:  float64(totalBytesIn) / duration,
		AvgBytesOutPerSec: float64(totalBytesOut) / duration,
		UniqueIPCount:     len(uniqueIPs),
		DataPointCount:    len(metrics),
	}
}

func (r *Report) ToJSON() (string, error) {
	data, err := json.MarshalIndent(r, "", "  ")
	if err != nil {
		return "", fmt.Errorf("failed to marshal report: %w", err)
	}
	return string(data), nil
}

func (r *Report) ToMinifiedJSON() (string, error) {
	data, err := json.Marshal(r)
	if err != nil {
		return "", fmt.Errorf("failed to marshal report: %w", err)
	}
	return string(data), nil
}

func ParseReport(data string) (*Report, error) {
	var report Report
	err := json.Unmarshal([]byte(data), &report)
	if err != nil {
		return nil, fmt.Errorf("failed to parse report: %w", err)
	}
	return &report, nil
}

func GenerateSummaryReport(servers []string, metrics map[string][]*scraper.Metrics, alerts []*alert.Alert, start, end time.Time) map[string]interface{} {
	report := GenerateReport(servers, metrics, alerts, start, end)
	return map[string]interface{}{
		"generated_at": report.GeneratedAt,
		"time_range":   report.TimeRange,
		"summary":      report.Summary,
		"server_count": len(report.Servers),
		"alert_count":  len(report.Alerts),
	}
}
