package stats

import (
	"strconv"
	"sync"
	"time"
)

type UnitTimeoutStat struct {
	TimeoutCount int64  `json:"timeoutCount"`
	TotalCount   int64  `json:"totalCount"`
	LastTimeout  string `json:"lastTimeout"`
}

type RouteStats struct {
	PacketsSent     int64                      `json:"packetsSent"`
	PacketsReceived int64                      `json:"packetsReceived"`
	BytesSent       int64                      `json:"bytesSent"`
	BytesReceived   int64                      `json:"bytesReceived"`
	Errors          int64                      `json:"errors"`
	LastActivity    string                     `json:"lastActivity"`
	UnitTimeouts    map[string]UnitTimeoutStat `json:"unitTimeouts"`
}

type routeStatsInternal struct {
	PacketsSent     int64
	PacketsReceived int64
	BytesSent       int64
	BytesReceived   int64
	Errors          int64
	LastActivity    time.Time
	UnitTimeouts    map[byte]*unitTimeoutInternal
}

type unitTimeoutInternal struct {
	TimeoutCount int64
	TotalCount   int64
	LastTimeout  time.Time
}

type Manager struct {
	mu    sync.RWMutex
	stats map[int]*routeStatsInternal
}

func NewManager() *Manager {
	return &Manager{
		stats: make(map[int]*routeStatsInternal),
	}
}

func (m *Manager) InitRoute(routeID int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, exists := m.stats[routeID]; !exists {
		m.stats[routeID] = &routeStatsInternal{
			UnitTimeouts: make(map[byte]*unitTimeoutInternal),
		}
	}
}

func (m *Manager) RecordSent(routeID int, bytes int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if s, ok := m.stats[routeID]; ok {
		s.PacketsSent++
		s.BytesSent += int64(bytes)
		s.LastActivity = time.Now()
	}
}

func (m *Manager) RecordReceived(routeID int, bytes int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if s, ok := m.stats[routeID]; ok {
		s.PacketsReceived++
		s.BytesReceived += int64(bytes)
		s.LastActivity = time.Now()
	}
}

func (m *Manager) RecordError(routeID int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if s, ok := m.stats[routeID]; ok {
		s.Errors++
	}
}

func (m *Manager) RecordTimeout(routeID int, unitID byte) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if s, ok := m.stats[routeID]; ok {
		if s.UnitTimeouts == nil {
			s.UnitTimeouts = make(map[byte]*unitTimeoutInternal)
		}
		if _, exists := s.UnitTimeouts[unitID]; !exists {
			s.UnitTimeouts[unitID] = &unitTimeoutInternal{}
		}
		s.UnitTimeouts[unitID].TimeoutCount++
		s.UnitTimeouts[unitID].TotalCount++
		s.UnitTimeouts[unitID].LastTimeout = time.Now()
	}
}

func (m *Manager) RecordRequest(routeID int, unitID byte) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if s, ok := m.stats[routeID]; ok {
		if s.UnitTimeouts == nil {
			s.UnitTimeouts = make(map[byte]*unitTimeoutInternal)
		}
		if _, exists := s.UnitTimeouts[unitID]; !exists {
			s.UnitTimeouts[unitID] = &unitTimeoutInternal{}
		}
		s.UnitTimeouts[unitID].TotalCount++
	}
}

func (m *Manager) GetAll() map[int]RouteStats {
	m.mu.RLock()
	defer m.mu.RUnlock()
	result := make(map[int]RouteStats)
	for k, v := range m.stats {
		result[k] = toPublic(v)
	}
	return result
}

func (m *Manager) Get(routeID int) (RouteStats, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if s, ok := m.stats[routeID]; ok {
		return toPublic(s), true
	}
	return RouteStats{}, false
}

func (m *Manager) Reset(routeID int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.stats[routeID]; ok {
		m.stats[routeID] = &routeStatsInternal{
			UnitTimeouts: make(map[byte]*unitTimeoutInternal),
		}
	}
}

func (m *Manager) Remove(routeID int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.stats, routeID)
}

func toPublic(internal *routeStatsInternal) RouteStats {
	unitTimeouts := make(map[string]UnitTimeoutStat)
	for uk, uv := range internal.UnitTimeouts {
		key := strconv.Itoa(int(uk))
		var lastTimeoutStr string
		if !uv.LastTimeout.IsZero() {
			lastTimeoutStr = uv.LastTimeout.Format(time.RFC3339)
		}
		unitTimeouts[key] = UnitTimeoutStat{
			TimeoutCount: uv.TimeoutCount,
			TotalCount:   uv.TotalCount,
			LastTimeout:  lastTimeoutStr,
		}
	}
	var lastActivityStr string
	if !internal.LastActivity.IsZero() {
		lastActivityStr = internal.LastActivity.Format(time.RFC3339)
	}
	return RouteStats{
		PacketsSent:     internal.PacketsSent,
		PacketsReceived: internal.PacketsReceived,
		BytesSent:       internal.BytesSent,
		BytesReceived:   internal.BytesReceived,
		Errors:          internal.Errors,
		LastActivity:    lastActivityStr,
		UnitTimeouts:    unitTimeouts,
	}
}
