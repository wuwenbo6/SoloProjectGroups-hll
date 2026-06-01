package l2tp

import (
	"encoding/json"
	"fmt"
	"sync"
	"time"
)

type Statistics struct {
	BytesIn    uint64 `json:"bytes_in"`
	BytesOut   uint64 `json:"bytes_out"`
	PacketsIn  uint64 `json:"packets_in"`
	PacketsOut uint64 `json:"packets_out"`
	ErrorsIn   uint64 `json:"errors_in"`
	ErrorsOut  uint64 `json:"errors_out"`
	StartTime  int64  `json:"start_time"`
	LastUpdate int64  `json:"last_update"`
}

func NewStatistics() *Statistics {
	now := time.Now().Unix()
	return &Statistics{
		StartTime:  now,
		LastUpdate: now,
	}
}

func (s *Statistics) RecordInbound(bytes int) {
	s.BytesIn += uint64(bytes)
	s.PacketsIn++
	s.LastUpdate = time.Now().Unix()
}

func (s *Statistics) RecordOutbound(bytes int) {
	s.BytesOut += uint64(bytes)
	s.PacketsOut++
	s.LastUpdate = time.Now().Unix()
}

func (s *Statistics) RecordErrorInbound(bytes int) {
	s.BytesIn += uint64(bytes)
	s.PacketsIn++
	s.ErrorsIn++
	s.LastUpdate = time.Now().Unix()
}

func (s *Statistics) RecordErrorOutbound(bytes int) {
	s.BytesOut += uint64(bytes)
	s.PacketsOut++
	s.ErrorsOut++
	s.LastUpdate = time.Now().Unix()
}

func (s *Statistics) DurationSeconds() int64 {
	return time.Now().Unix() - s.StartTime
}

func (s *Statistics) BytesInPerSecond() float64 {
	dur := s.DurationSeconds()
	if dur == 0 {
		return 0
	}
	return float64(s.BytesIn) / float64(dur)
}

func (s *Statistics) BytesOutPerSecond() float64 {
	dur := s.DurationSeconds()
	if dur == 0 {
		return 0
	}
	return float64(s.BytesOut) / float64(dur)
}

func (s *Statistics) Reset() {
	now := time.Now().Unix()
	s.BytesIn = 0
	s.BytesOut = 0
	s.PacketsIn = 0
	s.PacketsOut = 0
	s.ErrorsIn = 0
	s.ErrorsOut = 0
	s.StartTime = now
	s.LastUpdate = now
}

func (s *Statistics) String() string {
	return fmt.Sprintf(
		"In: %d bytes (%d pkts), Out: %d bytes (%d pkts), Errors: %d in/%d out",
		s.BytesIn, s.PacketsIn,
		s.BytesOut, s.PacketsOut,
		s.ErrorsIn, s.ErrorsOut,
	)
}

type SessionStats struct {
	SessionName string      `json:"session_name"`
	TunnelName  string      `json:"tunnel_name"`
	SessionID   uint32      `json:"session_id"`
	Stats       *Statistics `json:"stats"`
}

type TunnelStats struct {
	TunnelName   string                   `json:"tunnel_name"`
	TunnelID     uint32                   `json:"tunnel_id"`
	Stats        *Statistics              `json:"stats"`
	SessionStats map[string]*SessionStats `json:"session_stats"`
}

type StatsManager struct {
	mu          sync.RWMutex
	tunnelStats map[string]*TunnelStats
}

func NewStatsManager() *StatsManager {
	return &StatsManager{
		tunnelStats: make(map[string]*TunnelStats),
	}
}

func (sm *StatsManager) AddTunnel(tunnelName string, tunnelID uint32) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	if _, exists := sm.tunnelStats[tunnelName]; !exists {
		sm.tunnelStats[tunnelName] = &TunnelStats{
			TunnelName:   tunnelName,
			TunnelID:     tunnelID,
			Stats:        NewStatistics(),
			SessionStats: make(map[string]*SessionStats),
		}
	}
}

func (sm *StatsManager) RemoveTunnel(tunnelName string) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	delete(sm.tunnelStats, tunnelName)
}

func (sm *StatsManager) AddSession(tunnelName, sessionName string, sessionID uint32) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	ts, exists := sm.tunnelStats[tunnelName]
	if !exists {
		sm.tunnelStats[tunnelName] = &TunnelStats{
			TunnelName:   tunnelName,
			Stats:        NewStatistics(),
			SessionStats: make(map[string]*SessionStats),
		}
		ts = sm.tunnelStats[tunnelName]
	}

	if _, exists := ts.SessionStats[sessionName]; !exists {
		ts.SessionStats[sessionName] = &SessionStats{
			SessionName: sessionName,
			TunnelName:  tunnelName,
			SessionID:   sessionID,
			Stats:       NewStatistics(),
		}
	}
}

func (sm *StatsManager) RemoveSession(tunnelName, sessionName string) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	if ts, exists := sm.tunnelStats[tunnelName]; exists {
		delete(ts.SessionStats, sessionName)
	}
}

func (sm *StatsManager) RecordTunnelInbound(tunnelName string, bytes int) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	if ts, exists := sm.tunnelStats[tunnelName]; exists {
		ts.Stats.RecordInbound(bytes)
	}
}

func (sm *StatsManager) RecordTunnelOutbound(tunnelName string, bytes int) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	if ts, exists := sm.tunnelStats[tunnelName]; exists {
		ts.Stats.RecordOutbound(bytes)
	}
}

func (sm *StatsManager) RecordSessionInbound(tunnelName, sessionName string, bytes int) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	if ts, exists := sm.tunnelStats[tunnelName]; exists {
		if ss, exists := ts.SessionStats[sessionName]; exists {
			ss.Stats.RecordInbound(bytes)
		}
		ts.Stats.RecordInbound(bytes)
	}
}

func (sm *StatsManager) RecordSessionOutbound(tunnelName, sessionName string, bytes int) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	if ts, exists := sm.tunnelStats[tunnelName]; exists {
		if ss, exists := ts.SessionStats[sessionName]; exists {
			ss.Stats.RecordOutbound(bytes)
		}
		ts.Stats.RecordOutbound(bytes)
	}
}

func (sm *StatsManager) RecordSessionErrorIn(tunnelName, sessionName string, bytes int) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	if ts, exists := sm.tunnelStats[tunnelName]; exists {
		if ss, exists := ts.SessionStats[sessionName]; exists {
			ss.Stats.RecordErrorInbound(bytes)
		}
		ts.Stats.RecordErrorInbound(bytes)
	}
}

func (sm *StatsManager) GetTunnelStats(tunnelName string) (*TunnelStats, bool) {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	ts, exists := sm.tunnelStats[tunnelName]
	if !exists {
		return nil, false
	}

	clone, _ := deepCopyTunnelStats(ts)
	return clone, true
}

func (sm *StatsManager) GetSessionStats(tunnelName, sessionName string) (*SessionStats, bool) {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	ts, exists := sm.tunnelStats[tunnelName]
	if !exists {
		return nil, false
	}

	ss, exists := ts.SessionStats[sessionName]
	if !exists {
		return nil, false
	}

	clone, _ := deepCopySessionStats(ss)
	return clone, true
}

func (sm *StatsManager) GetAllTunnelStats() []*TunnelStats {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	result := make([]*TunnelStats, 0, len(sm.tunnelStats))
	for _, ts := range sm.tunnelStats {
		clone, _ := deepCopyTunnelStats(ts)
		result = append(result, clone)
	}
	return result
}

func (sm *StatsManager) ResetTunnelStats(tunnelName string) bool {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	ts, exists := sm.tunnelStats[tunnelName]
	if !exists {
		return false
	}

	ts.Stats.Reset()
	for _, ss := range ts.SessionStats {
		ss.Stats.Reset()
	}
	return true
}

func deepCopyTunnelStats(ts *TunnelStats) (*TunnelStats, error) {
	data, err := json.Marshal(ts)
	if err != nil {
		return nil, err
	}
	var clone TunnelStats
	err = json.Unmarshal(data, &clone)
	return &clone, err
}

func deepCopySessionStats(ss *SessionStats) (*SessionStats, error) {
	data, err := json.Marshal(ss)
	if err != nil {
		return nil, err
	}
	var clone SessionStats
	err = json.Unmarshal(data, &clone)
	return &clone, err
}

func FormatBytes(bytes uint64) string {
	const unit = 1024
	if bytes < unit {
		return fmt.Sprintf("%d B", bytes)
	}
	div, exp := uint64(unit), 0
	for n := bytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.2f %cB", float64(bytes)/float64(div), "KMGTPE"[exp])
}
