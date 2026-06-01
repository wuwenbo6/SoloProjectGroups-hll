package stats

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"sort"
	"sync"
	"time"
)

type SessionRecord struct {
	SessionID      string     `json:"session_id"`
	Username       string     `json:"username"`
	MACAddress     string     `json:"mac_address"`
	AuthMethod     string     `json:"auth_method"`
	RemoteIP       string     `json:"remote_ip"`
	VLANID         int        `json:"vlan_id"`
	PoolName       string     `json:"pool_name"`
	StartTime      time.Time  `json:"start_time"`
	EndTime        *time.Time `json:"end_time,omitempty"`
	Duration       float64    `json:"duration_seconds"`
	DurationStr    string     `json:"duration_human"`
	BytesIn        int64      `json:"bytes_in"`
	BytesOut       int64      `json:"bytes_out"`
	PacketsIn      int64      `json:"packets_in"`
	PacketsOut     int64      `json:"packets_out"`
	TerminateCause string     `json:"terminate_cause,omitempty"`
	RADIUSUsed     bool       `json:"radius_used"`
}

type DurationStats struct {
	TotalSessions     int                     `json:"total_sessions"`
	ActiveSessions    int                     `json:"active_sessions"`
	CompletedSessions int                     `json:"completed_sessions"`
	TotalDuration     float64                 `json:"total_duration_seconds"`
	AvgDuration       float64                 `json:"avg_duration_seconds"`
	MinDuration       float64                 `json:"min_duration_seconds"`
	MaxDuration       float64                 `json:"max_duration_seconds"`
	MedianDuration    float64                 `json:"median_duration_seconds"`
	P95Duration       float64                 `json:"p95_duration_seconds"`
	P99Duration       float64                 `json:"p99_duration_seconds"`
	StdDev            float64                 `json:"std_deviation"`
	TotalBytesIn      int64                   `json:"total_bytes_in"`
	TotalBytesOut     int64                   `json:"total_bytes_out"`
	TotalPacketsIn    int64                   `json:"total_packets_in"`
	TotalPacketsOut   int64                   `json:"total_packets_out"`
	ByAuthMethod      map[string]*MethodStats `json:"by_auth_method"`
	ByVLANPool        map[string]*MethodStats `json:"by_vlan_pool"`
}

type MethodStats struct {
	Count       int     `json:"count"`
	AvgDuration float64 `json:"avg_duration_seconds"`
	TotalBytes  int64   `json:"total_bytes"`
}

type StatsCollector struct {
	mu      sync.RWMutex
	records []*SessionRecord
}

func NewStatsCollector() *StatsCollector {
	return &StatsCollector{
		records: make([]*SessionRecord, 0, 10000),
	}
}

func (sc *StatsCollector) RecordSessionStart(sessionID, username, macAddress, authMethod, remoteIP string, vlanID int, poolName string, radiusUsed bool) {
	sc.mu.Lock()
	defer sc.mu.Unlock()

	record := &SessionRecord{
		SessionID:  sessionID,
		Username:   username,
		MACAddress: macAddress,
		AuthMethod: authMethod,
		RemoteIP:   remoteIP,
		VLANID:     vlanID,
		PoolName:   poolName,
		StartTime:  time.Now(),
		RADIUSUsed: radiusUsed,
	}

	sc.records = append(sc.records, record)
}

func (sc *StatsCollector) RecordSessionEnd(sessionID string, bytesIn, bytesOut, packetsIn, packetsOut int64, terminateCause string) {
	sc.mu.Lock()
	defer sc.mu.Unlock()

	for i := len(sc.records) - 1; i >= 0; i-- {
		if sc.records[i].SessionID == sessionID {
			now := time.Now()
			sc.records[i].EndTime = &now
			sc.records[i].Duration = now.Sub(sc.records[i].StartTime).Seconds()
			sc.records[i].DurationStr = formatDuration(now.Sub(sc.records[i].StartTime))
			sc.records[i].BytesIn = bytesIn
			sc.records[i].BytesOut = bytesOut
			sc.records[i].PacketsIn = packetsIn
			sc.records[i].PacketsOut = packetsOut
			sc.records[i].TerminateCause = terminateCause
			return
		}
	}
}

func (sc *StatsCollector) GetDurationStats() *DurationStats {
	sc.mu.RLock()
	defer sc.mu.RUnlock()

	stats := &DurationStats{
		TotalSessions: len(sc.records),
		ByAuthMethod:  make(map[string]*MethodStats),
		ByVLANPool:    make(map[string]*MethodStats),
	}

	var completedDurations []float64
	var totalDuration float64
	var totalBytesIn, totalBytesOut int64
	var totalPacketsIn, totalPacketsOut int64
	activeCount := 0

	methodDurations := make(map[string][]float64)
	methodBytes := make(map[string]int64)
	poolDurations := make(map[string][]float64)
	poolBytes := make(map[string]int64)

	for _, r := range sc.records {
		if r.EndTime != nil {
			completedDurations = append(completedDurations, r.Duration)
			totalDuration += r.Duration
			stats.CompletedSessions++
			totalBytesIn += r.BytesIn
			totalBytesOut += r.BytesOut
			totalPacketsIn += r.PacketsIn
			totalPacketsOut += r.PacketsOut

			methodDurations[r.AuthMethod] = append(methodDurations[r.AuthMethod], r.Duration)
			methodBytes[r.AuthMethod] += r.BytesIn + r.BytesOut
			poolDurations[r.PoolName] = append(poolDurations[r.PoolName], r.Duration)
			poolBytes[r.PoolName] += r.BytesIn + r.BytesOut
		} else {
			activeCount++
		}
	}

	stats.ActiveSessions = activeCount
	stats.TotalDuration = totalDuration
	stats.TotalBytesIn = totalBytesIn
	stats.TotalBytesOut = totalBytesOut
	stats.TotalPacketsIn = totalPacketsIn
	stats.TotalPacketsOut = totalPacketsOut

	if len(completedDurations) > 0 {
		stats.AvgDuration = totalDuration / float64(len(completedDurations))

		sort.Float64s(completedDurations)
		stats.MinDuration = completedDurations[0]
		stats.MaxDuration = completedDurations[len(completedDurations)-1]
		stats.MedianDuration = percentile(completedDurations, 50)
		stats.P95Duration = percentile(completedDurations, 95)
		stats.P99Duration = percentile(completedDurations, 99)
		stats.StdDev = stdDev(completedDurations, stats.AvgDuration)
	}

	for method, durations := range methodDurations {
		avg := 0.0
		for _, d := range durations {
			avg += d
		}
		avg /= float64(len(durations))
		stats.ByAuthMethod[method] = &MethodStats{
			Count:       len(durations),
			AvgDuration: avg,
			TotalBytes:  methodBytes[method],
		}
	}

	for pool, durations := range poolDurations {
		avg := 0.0
		for _, d := range durations {
			avg += d
		}
		avg /= float64(len(durations))
		stats.ByVLANPool[pool] = &MethodStats{
			Count:       len(durations),
			AvgDuration: avg,
			TotalBytes:  poolBytes[pool],
		}
	}

	return stats
}

func (sc *StatsCollector) GetSessionRecords(limit, offset int) []*SessionRecord {
	sc.mu.RLock()
	defer sc.mu.RUnlock()

	if limit <= 0 {
		limit = 100
	}
	if offset < 0 {
		offset = 0
	}

	total := len(sc.records)
	if offset >= total {
		return []*SessionRecord{}
	}

	end := offset + limit
	if end > total {
		end = total
	}

	result := make([]*SessionRecord, end-offset)
	copy(result, sc.records[offset:end])
	return result
}

func (sc *StatsCollector) ExportCSV(w io.Writer) error {
	sc.mu.RLock()
	defer sc.mu.RUnlock()

	writer := csv.NewWriter(w)
	defer writer.Flush()

	header := []string{
		"session_id", "username", "mac_address", "auth_method", "remote_ip",
		"vlan_id", "pool_name", "start_time", "end_time", "duration_seconds",
		"duration_human", "bytes_in", "bytes_out", "packets_in", "packets_out",
		"terminate_cause", "radius_used",
	}
	if err := writer.Write(header); err != nil {
		return err
	}

	for _, r := range sc.records {
		endTime := ""
		if r.EndTime != nil {
			endTime = r.EndTime.Format(time.RFC3339)
		}
		row := []string{
			r.SessionID, r.Username, r.MACAddress, r.AuthMethod, r.RemoteIP,
			fmt.Sprintf("%d", r.VLANID), r.PoolName,
			r.StartTime.Format(time.RFC3339), endTime,
			fmt.Sprintf("%.2f", r.Duration), r.DurationStr,
			fmt.Sprintf("%d", r.BytesIn), fmt.Sprintf("%d", r.BytesOut),
			fmt.Sprintf("%d", r.PacketsIn), fmt.Sprintf("%d", r.PacketsOut),
			r.TerminateCause, fmt.Sprintf("%v", r.RADIUSUsed),
		}
		if err := writer.Write(row); err != nil {
			return err
		}
	}

	return nil
}

func (sc *StatsCollector) ExportJSON(w io.Writer) error {
	sc.mu.RLock()
	defer sc.mu.RUnlock()

	encoder := json.NewEncoder(w)
	encoder.SetIndent("", "  ")
	return encoder.Encode(sc.records)
}

func percentile(sorted []float64, p float64) float64 {
	if len(sorted) == 0 {
		return 0
	}
	if len(sorted) == 1 {
		return sorted[0]
	}
	idx := p / 100.0 * float64(len(sorted)-1)
	lower := int(math.Floor(idx))
	upper := lower + 1
	if upper >= len(sorted) {
		return sorted[len(sorted)-1]
	}
	frac := idx - float64(lower)
	return sorted[lower]*(1-frac) + sorted[upper]*frac
}

func stdDev(values []float64, mean float64) float64 {
	if len(values) < 2 {
		return 0
	}
	var sum float64
	for _, v := range values {
		sum += (v - mean) * (v - mean)
	}
	return math.Sqrt(sum / float64(len(values)))
}

func formatDuration(d time.Duration) string {
	d = d.Round(time.Second)
	h := d / time.Hour
	d -= h * time.Hour
	m := d / time.Minute
	d -= m * time.Minute
	s := d / time.Second

	if h > 0 {
		return fmt.Sprintf("%dh%dm%ds", h, m, s)
	}
	if m > 0 {
		return fmt.Sprintf("%dm%ds", m, s)
	}
	return fmt.Sprintf("%ds", s)
}
