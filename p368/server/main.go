package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"math/rand"
	"net/http"
	"sort"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

type PathID string

const (
	PathA PathID = "pathA"
	PathB PathID = "pathB"
)

var pathPriority = map[PathID]int{
	PathA: 1,
	PathB: 2,
}

type PathStatus struct {
	ID            PathID `json:"id"`
	Connected     bool   `json:"connected"`
	Active        bool   `json:"active"`
	Priority      int    `json:"priority"`
	QueueDepth    int    `json:"queue_depth"`
	Weight        int    `json:"weight"`
	LatencyMs     int    `json:"latency_ms"`
	IopsRead      int    `json:"iops_read"`
	IopsWrite     int    `json:"iops_write"`
	BandwidthMbps int    `json:"bandwidth_mbps"`
}

type Event struct {
	Timestamp string `json:"timestamp"`
	Type      string `json:"type"`
	Path      PathID `json:"path"`
	Message   string `json:"message"`
}

type RetryCommand struct {
	ID        int64     `json:"id"`
	OpType    string    `json:"op_type"`
	Path      PathID    `json:"path"`
	Retries   int       `json:"retries"`
	QueuedAt  time.Time `json:"queued_at"`
	LastRetry time.Time `json:"last_retry"`
}

type RetryQueueStatus struct {
	QueueSize      int `json:"queue_size"`
	TotalQueued    int `json:"total_queued"`
	TotalRetried   int `json:"total_retried"`
	TotalSucceeded int `json:"total_succeeded"`
	TotalExpired   int `json:"total_expired"`
}

type SwitchLatencyRecord struct {
	Timestamp string `json:"timestamp"`
	FromPath  PathID `json:"from_path"`
	ToPath    PathID `json:"to_path"`
	LatencyMs int64  `json:"latency_ms"`
	Reason    string `json:"reason"`
}

type LatencyStats struct {
	Count   int                   `json:"count"`
	MinMs   int64                 `json:"min_ms"`
	MaxMs   int64                 `json:"max_ms"`
	AvgMs   float64               `json:"avg_ms"`
	P50Ms   int64                 `json:"p50_ms"`
	P95Ms   int64                 `json:"p95_ms"`
	P99Ms   int64                 `json:"p99_ms"`
	Records []SwitchLatencyRecord `json:"recent_records"`
}

type LoadBalancerStatus struct {
	Mode        string `json:"mode"`
	PathAWeight int    `json:"path_a_weight"`
	PathBWeight int    `json:"path_b_weight"`
	PathADepth  int    `json:"path_a_depth"`
	PathBDepth  int    `json:"path_b_depth"`
	PathARatio  string `json:"path_a_ratio"`
	PathBRatio  string `json:"path_b_ratio"`
}

type SimulatorStatus struct {
	Paths               []PathStatus       `json:"paths"`
	ActivePath          PathID             `json:"active_path"`
	SwitchCount         int                `json:"switch_count"`
	LastSwitchTime      *string            `json:"last_switch_time"`
	LastSwitchDirection *string            `json:"last_switch_direction"`
	AutoFailover        bool               `json:"auto_failover"`
	IOLoadPercent       int                `json:"io_load_percent"`
	RetryQueue          RetryQueueStatus   `json:"retry_queue"`
	LoadBalancer        LoadBalancerStatus `json:"load_balancer"`
	LatencyStats        LatencyStats       `json:"latency_stats"`
}

type IOTick struct {
	PathA     int   `json:"pathA"`
	PathB     int   `json:"pathB"`
	Timestamp int64 `json:"timestamp"`
}

type WSMessage struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

type Simulator struct {
	mu                  sync.RWMutex
	paths               map[PathID]*PathStatus
	activePath          PathID
	switchCount         int
	lastSwitchTime      *string
	lastSwitchDirection *string
	autoFailover        bool
	ioLoadPercent       int
	events              []Event
	wsClients           map[*websocket.Conn]bool
	wsMu                sync.RWMutex
	wsWriteMu           sync.Mutex
	stopAutoFailover    chan struct{}
	autoFailoverRunning bool
	retryQueue          []RetryCommand
	retryTotalQueued    int
	retryTotalRetried   int
	retryTotalSucceeded int
	retryTotalExpired   int
	nextCmdID           int64
	pathQueueDepth      map[PathID]int
	switchLatencies     []SwitchLatencyRecord
	disconnectTimestamp map[PathID]time.Time
}

func NewSimulator() *Simulator {
	s := &Simulator{
		paths: map[PathID]*PathStatus{
			PathA: {
				ID: PathA, Connected: true, Active: true, Priority: 1,
				LatencyMs: 2, IopsRead: 50000, IopsWrite: 20000, BandwidthMbps: 3200,
			},
			PathB: {
				ID: PathB, Connected: true, Active: false, Priority: 2,
				LatencyMs: 3, IopsRead: 48000, IopsWrite: 19000, BandwidthMbps: 3000,
			},
		},
		activePath:          PathA,
		ioLoadPercent:       70,
		events:              make([]Event, 0),
		wsClients:           make(map[*websocket.Conn]bool),
		retryQueue:          make([]RetryCommand, 0),
		stopAutoFailover:    make(chan struct{}),
		pathQueueDepth:      map[PathID]int{PathA: 0, PathB: 0},
		switchLatencies:     make([]SwitchLatencyRecord, 0),
		disconnectTimestamp: make(map[PathID]time.Time),
	}
	now := time.Now().Format(time.RFC3339)
	s.events = append(s.events, Event{
		Timestamp: now, Type: "connect", Path: PathA,
		Message: "PathA connected (default active, priority=1)",
	})
	s.events = append(s.events, Event{
		Timestamp: now, Type: "connect", Path: PathB,
		Message: "PathB connected (standby, priority=2)",
	})
	return s
}

func (s *Simulator) computeWeightsLocked() (weightA, weightB int, ratioA, ratioB string) {
	depthA := s.pathQueueDepth[PathA]
	depthB := s.pathQueueDepth[PathB]
	connA := s.paths[PathA].Connected
	connB := s.paths[PathB].Connected

	if !connA && !connB {
		return 0, 0, "0%", "0%"
	}
	if !connA {
		return 0, 100, "0%", "100%"
	}
	if !connB {
		return 100, 0, "100%", "0%"
	}

	inverseA := 1.0 / float64(depthA+1)
	inverseB := 1.0 / float64(depthB+1)
	total := inverseA + inverseB

	wA := int(math.Round(inverseA / total * 100))
	wB := 100 - wA

	return wA, wB, fmt.Sprintf("%d%%", wA), fmt.Sprintf("%d%%", wB)
}

func (s *Simulator) GetStatus() SimulatorStatus {
	s.mu.RLock()
	defer s.mu.RUnlock()

	wA, wB, rA, rB := s.computeWeightsLocked()

	paths := make([]PathStatus, 0, len(s.paths))
	for _, id := range []PathID{PathA, PathB} {
		p := *s.paths[id]
		p.Active = (id == s.activePath)
		p.Priority = pathPriority[id]
		p.QueueDepth = s.pathQueueDepth[id]
		if id == PathA {
			p.Weight = wA
		} else {
			p.Weight = wB
		}
		if !p.Connected {
			p.IopsRead = 0
			p.IopsWrite = 0
			p.BandwidthMbps = 0
		} else {
			loadFactor := float64(s.ioLoadPercent) / 100.0
			p.IopsRead = int(float64(p.IopsRead) * loadFactor)
			p.IopsWrite = int(float64(p.IopsWrite) * loadFactor)
			p.BandwidthMbps = int(float64(p.BandwidthMbps) * loadFactor)
		}
		paths = append(paths, p)
	}

	latStats := s.computeLatencyStatsLocked()

	return SimulatorStatus{
		Paths:               paths,
		ActivePath:          s.activePath,
		SwitchCount:         s.switchCount,
		LastSwitchTime:      s.lastSwitchTime,
		LastSwitchDirection: s.lastSwitchDirection,
		AutoFailover:        s.autoFailover,
		IOLoadPercent:       s.ioLoadPercent,
		RetryQueue: RetryQueueStatus{
			QueueSize:      len(s.retryQueue),
			TotalQueued:    s.retryTotalQueued,
			TotalRetried:   s.retryTotalRetried,
			TotalSucceeded: s.retryTotalSucceeded,
			TotalExpired:   s.retryTotalExpired,
		},
		LoadBalancer: LoadBalancerStatus{
			Mode:        "queue_depth_weighted",
			PathAWeight: wA,
			PathBWeight: wB,
			PathADepth:  s.pathQueueDepth[PathA],
			PathBDepth:  s.pathQueueDepth[PathB],
			PathARatio:  rA,
			PathBRatio:  rB,
		},
		LatencyStats: latStats,
	}
}

func (s *Simulator) computeLatencyStatsLocked() LatencyStats {
	stats := LatencyStats{
		Count: len(s.switchLatencies),
		MinMs: 0,
		MaxMs: 0,
		AvgMs: 0,
		P50Ms: 0,
		P95Ms: 0,
		P99Ms: 0,
	}

	if len(s.switchLatencies) == 0 {
		return stats
	}

	latencies := make([]int64, len(s.switchLatencies))
	var sum int64
	for i, r := range s.switchLatencies {
		latencies[i] = r.LatencyMs
		sum += r.LatencyMs
	}

	sort.Slice(latencies, func(i, j int) bool { return latencies[i] < latencies[j] })

	stats.MinMs = latencies[0]
	stats.MaxMs = latencies[len(latencies)-1]
	stats.AvgMs = float64(sum) / float64(len(latencies))
	stats.P50Ms = latencies[int(float64(len(latencies))*0.5)]
	stats.P95Ms = latencies[int(float64(len(latencies))*0.95)]
	stats.P99Ms = latencies[len(latencies)-1]
	if len(latencies) > 1 {
		stats.P99Ms = latencies[int(float64(len(latencies))*0.99)]
	}

	recentCount := 10
	if len(s.switchLatencies) < recentCount {
		recentCount = len(s.switchLatencies)
	}
	stats.Records = make([]SwitchLatencyRecord, recentCount)
	copy(stats.Records, s.switchLatencies[len(s.switchLatencies)-recentCount:])

	return stats
}

func (s *Simulator) recordSwitchLatency(from, to PathID, reason string) {
	var latency int64
	if discTime, ok := s.disconnectTimestamp[from]; ok {
		latency = time.Since(discTime).Milliseconds()
	} else {
		latency = int64(1 + rand.Intn(5))
	}

	now := time.Now().Format(time.RFC3339)
	record := SwitchLatencyRecord{
		Timestamp: now,
		FromPath:  from,
		ToPath:    to,
		LatencyMs: latency,
		Reason:    reason,
	}
	s.switchLatencies = append(s.switchLatencies, record)
	if len(s.switchLatencies) > 200 {
		s.switchLatencies = s.switchLatencies[len(s.switchLatencies)-200:]
	}

	s.addEventLocked(Event{
		Timestamp: now, Type: "switch_latency", Path: to,
		Message: fmt.Sprintf("Switch %s->%s latency: %dms (%s)", from, to, latency, reason),
	})
}

func (s *Simulator) DisconnectPath(id PathID) bool {
	s.mu.Lock()

	p, ok := s.paths[id]
	if !ok || !p.Connected {
		s.mu.Unlock()
		return false
	}

	p.Connected = false
	s.disconnectTimestamp[id] = time.Now()
	s.pathQueueDepth[id] = 0
	now := time.Now().Format(time.RFC3339)
	s.addEventLocked(Event{
		Timestamp: now, Type: "disconnect", Path: id,
		Message: fmt.Sprintf("%s disconnected", id),
	})

	if id == s.activePath {
		s.enqueueInFlightIOs(id)
		otherPath := s.otherPath(id)
		if s.paths[otherPath].Connected {
			s.activePath = otherPath
			s.switchCount++
			dir := fmt.Sprintf("%s -> %s", id, otherPath)
			s.lastSwitchTime = &now
			s.lastSwitchDirection = &dir
			s.recordSwitchLatency(id, otherPath, "failover")
			s.addEventLocked(Event{
				Timestamp: now, Type: "switch", Path: otherPath,
				Message: fmt.Sprintf("Failover: %s -> %s", id, otherPath),
			})
			s.addEventLocked(Event{
				Timestamp: now, Type: "io_resume", Path: otherPath,
				Message: fmt.Sprintf("IO resumed on %s, no interruption", otherPath),
			})
			s.addEventLocked(Event{
				Timestamp: now, Type: "retry_queue", Path: id,
				Message: fmt.Sprintf("In-flight commands queued for retry (%d pending)", len(s.retryQueue)),
			})
		}
	}

	s.mu.Unlock()
	s.broadcastStatus()
	return true
}

func (s *Simulator) ConnectPath(id PathID) bool {
	s.mu.Lock()

	p, ok := s.paths[id]
	if !ok || p.Connected {
		s.mu.Unlock()
		return false
	}

	p.Connected = true
	now := time.Now().Format(time.RFC3339)

	currentPriority := pathPriority[s.activePath]
	recoveredPriority := pathPriority[id]

	if recoveredPriority < currentPriority {
		oldActive := s.activePath
		s.activePath = id
		s.switchCount++
		dir := fmt.Sprintf("%s -> %s", oldActive, id)
		s.lastSwitchTime = &now
		s.lastSwitchDirection = &dir
		s.recordSwitchLatency(oldActive, id, "priority_fallback")
		s.addEventLocked(Event{
			Timestamp: now, Type: "recover", Path: id,
			Message: fmt.Sprintf("%s recovered", id),
		})
		s.addEventLocked(Event{
			Timestamp: now, Type: "fallback", Path: id,
			Message: fmt.Sprintf("Priority fallback: %s (pri=%d) -> %s (pri=%d)", oldActive, currentPriority, id, recoveredPriority),
		})
	} else {
		s.addEventLocked(Event{
			Timestamp: now, Type: "recover", Path: id,
			Message: fmt.Sprintf("%s recovered (standby, pri=%d > active pri=%d)", id, recoveredPriority, currentPriority),
		})
	}

	delete(s.disconnectTimestamp, id)

	s.mu.Unlock()
	s.broadcastStatus()
	return true
}

func (s *Simulator) enqueueInFlightIOs(failedPath PathID) {
	inflight := 3 + rand.Intn(5)
	for i := 0; i < inflight; i++ {
		cmdID := atomic.AddInt64(&s.nextCmdID, 1)
		opType := "read"
		if rand.Float32() < 0.4 {
			opType = "write"
		}
		cmd := RetryCommand{
			ID:        cmdID,
			OpType:    opType,
			Path:      failedPath,
			Retries:   0,
			QueuedAt:  time.Now(),
			LastRetry: time.Now(),
		}
		s.retryQueue = append(s.retryQueue, cmd)
		s.retryTotalQueued++
	}
}

func (s *Simulator) processRetryQueue() {
	s.mu.Lock()

	if len(s.retryQueue) == 0 {
		s.mu.Unlock()
		return
	}

	other := s.otherPath(s.activePath)
	connected := s.paths[s.activePath].Connected
	if !connected {
		s.mu.Unlock()
		return
	}

	var remaining []RetryCommand
	now := time.Now()
	nowStr := now.Format(time.RFC3339)
	maxRetries := 12

	for _, cmd := range s.retryQueue {
		if now.Sub(cmd.LastRetry) < 5*time.Second {
			remaining = append(remaining, cmd)
			continue
		}

		s.retryTotalRetried++
		cmd.Retries++
		cmd.LastRetry = now

		if cmd.Retries >= maxRetries {
			s.retryTotalExpired++
			s.addEventLocked(Event{
				Timestamp: nowStr, Type: "retry_expired", Path: cmd.Path,
				Message: fmt.Sprintf("Cmd#%d expired after %d retries", cmd.ID, cmd.Retries),
			})
			continue
		}

		if connected {
			s.retryTotalSucceeded++
			s.pathQueueDepth[s.activePath]++
			s.addEventLocked(Event{
				Timestamp: nowStr, Type: "retry_success", Path: s.activePath,
				Message: fmt.Sprintf("Cmd#%d (%s) retried on %s (attempt %d)", cmd.ID, cmd.OpType, s.activePath, cmd.Retries),
			})
			s.pathQueueDepth[other] = int(float64(s.pathQueueDepth[other]) * 0.7)
			if s.pathQueueDepth[other] < 0 {
				s.pathQueueDepth[other] = 0
			}
		} else {
			remaining = append(remaining, cmd)
		}
	}

	s.retryQueue = remaining
	if len(s.retryQueue) > 0 {
		s.addEventLocked(Event{
			Timestamp: nowStr, Type: "retry_pending", Path: s.activePath,
			Message: fmt.Sprintf("%d commands still pending in retry queue", len(s.retryQueue)),
		})
	}

	s.mu.Unlock()
	s.broadcastStatus()
}

func (s *Simulator) ToggleAutoFailover(enabled bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.autoFailover = enabled
	if enabled && !s.autoFailoverRunning {
		s.autoFailoverRunning = true
		s.stopAutoFailover = make(chan struct{})
		go s.runAutoFailover()
	} else if !enabled && s.autoFailoverRunning {
		s.autoFailoverRunning = false
		close(s.stopAutoFailover)
	}
}

func (s *Simulator) SetIOLoad(percent int) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if percent < 10 {
		percent = 10
	}
	if percent > 100 {
		percent = 100
	}
	s.ioLoadPercent = percent
}

func (s *Simulator) GetRecentEvents(count int) []Event {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if len(s.events) <= count {
		result := make([]Event, len(s.events))
		copy(result, s.events)
		return result
	}
	result := make([]Event, count)
	copy(result, s.events[len(s.events)-count:])
	return result
}

func (s *Simulator) otherPath(id PathID) PathID {
	if id == PathA {
		return PathB
	}
	return PathA
}

func (s *Simulator) addEventLocked(e Event) {
	s.events = append(s.events, e)
	if len(s.events) > 200 {
		s.events = s.events[len(s.events)-200:]
	}
}

func (s *Simulator) runAutoFailover() {
	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	for {
		delay := time.Duration(5+r.Intn(10)) * time.Second
		select {
		case <-s.stopAutoFailover:
			return
		case <-time.After(delay):
		}

		s.mu.Lock()
		var target PathID
		if r.Float32() < 0.5 {
			target = PathA
		} else {
			target = PathB
		}

		p := s.paths[target]
		if p.Connected {
			p.Connected = false
			s.disconnectTimestamp[target] = time.Now()
			s.pathQueueDepth[target] = 0
			now := time.Now().Format(time.RFC3339)
			s.addEventLocked(Event{
				Timestamp: now, Type: "disconnect", Path: target,
				Message: fmt.Sprintf("[Auto-inject] %s disconnected", target),
			})

			if target == s.activePath {
				s.enqueueInFlightIOs(target)
				other := s.otherPath(target)
				if s.paths[other].Connected {
					s.activePath = other
					s.switchCount++
					dir := fmt.Sprintf("%s -> %s", target, other)
					s.lastSwitchTime = &now
					s.lastSwitchDirection = &dir
					s.recordSwitchLatency(target, other, "auto_failover")
					s.addEventLocked(Event{
						Timestamp: now, Type: "switch", Path: other,
						Message: fmt.Sprintf("Failover: %s -> %s", target, other),
					})
					s.addEventLocked(Event{
						Timestamp: now, Type: "io_resume", Path: other,
						Message: fmt.Sprintf("IO resumed on %s, no interruption", other),
					})
					s.addEventLocked(Event{
						Timestamp: now, Type: "retry_queue", Path: target,
						Message: fmt.Sprintf("In-flight commands queued for retry (%d pending)", len(s.retryQueue)),
					})
				}
			}
			s.mu.Unlock()
			s.broadcastStatus()

			recoverDelay := time.Duration(3+r.Intn(7)) * time.Second
			select {
			case <-s.stopAutoFailover:
				s.mu.Lock()
				s.paths[target].Connected = true
				now := time.Now().Format(time.RFC3339)
				s.addEventLocked(Event{
					Timestamp: now, Type: "recover", Path: target,
					Message: fmt.Sprintf("[Auto-recover] %s reconnected", target),
				})
				delete(s.disconnectTimestamp, target)
				s.mu.Unlock()
				s.broadcastStatus()
				return
			case <-time.After(recoverDelay):
			}

			s.mu.Lock()
			s.paths[target].Connected = true
			now = time.Now().Format(time.RFC3339)

			currentPriority := pathPriority[s.activePath]
			recoveredPriority := pathPriority[target]

			if recoveredPriority < currentPriority {
				oldActive := s.activePath
				s.activePath = target
				s.switchCount++
				dir := fmt.Sprintf("%s -> %s", oldActive, target)
				s.lastSwitchTime = &now
				s.lastSwitchDirection = &dir
				s.recordSwitchLatency(oldActive, target, "auto_fallback")
				s.addEventLocked(Event{
					Timestamp: now, Type: "recover", Path: target,
					Message: fmt.Sprintf("[Auto-recover] %s reconnected", target),
				})
				s.addEventLocked(Event{
					Timestamp: now, Type: "fallback", Path: target,
					Message: fmt.Sprintf("Priority fallback: %s (pri=%d) -> %s (pri=%d)", oldActive, currentPriority, target, recoveredPriority),
				})
			} else {
				s.addEventLocked(Event{
					Timestamp: now, Type: "recover", Path: target,
					Message: fmt.Sprintf("[Auto-recover] %s reconnected (standby)", target),
				})
			}
			delete(s.disconnectTimestamp, target)
			s.mu.Unlock()
			s.broadcastStatus()
		} else {
			s.mu.Unlock()
		}
	}
}

func (s *Simulator) RegisterWS(conn *websocket.Conn) {
	s.wsMu.Lock()
	s.wsClients[conn] = true
	s.wsMu.Unlock()
}

func (s *Simulator) UnregisterWS(conn *websocket.Conn) {
	s.wsMu.Lock()
	delete(s.wsClients, conn)
	s.wsMu.Unlock()
}

func (s *Simulator) broadcastStatus() {
	status := s.GetStatus()
	msg := WSMessage{Type: "status", Data: status}
	s.broadcast(msg)
}

func (s *Simulator) broadcast(msg WSMessage) {
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}

	s.wsMu.RLock()
	clients := make([]*websocket.Conn, 0, len(s.wsClients))
	for c := range s.wsClients {
		clients = append(clients, c)
	}
	s.wsMu.RUnlock()

	s.wsWriteMu.Lock()
	defer s.wsWriteMu.Unlock()

	for _, c := range clients {
		err := c.WriteMessage(websocket.TextMessage, data)
		if err != nil {
			s.wsMu.Lock()
			delete(s.wsClients, c)
			s.wsMu.Unlock()
			c.Close()
		}
	}
}

func (s *Simulator) StartIOTicker() {
	go func() {
		ticker := time.NewTicker(500 * time.Millisecond)
		defer ticker.Stop()

		for range ticker.C {
			s.mu.Lock()
			loadFactor := float64(s.ioLoadPercent) / 100.0
			baseA := 50000.0
			baseB := 48000.0
			connA := s.paths[PathA].Connected
			connB := s.paths[PathB].Connected
			if !connA {
				baseA = 0
			}
			if !connB {
				baseB = 0
			}

			if connA && connB {
				depthA := s.pathQueueDepth[PathA]
				depthB := s.pathQueueDepth[PathB]
				inverseA := 1.0 / float64(depthA+1)
				inverseB := 1.0 / float64(depthB+1)
				total := inverseA + inverseB
				wA := inverseA / total
				wB := inverseB / total

				jitterA := 1.0 + (rand.Float64()-0.5)*0.1
				jitterB := 1.0 + (rand.Float64()-0.5)*0.1

				valA := int(math.Round(baseA * loadFactor * wA * jitterA * 2))
				valB := int(math.Round(baseB * loadFactor * wB * jitterB * 2))

				s.pathQueueDepth[PathA] += int(float64(valA) / 10000.0)
				s.pathQueueDepth[PathB] += int(float64(valB) / 10000.0)

				s.pathQueueDepth[PathA] = int(float64(s.pathQueueDepth[PathA]) * 0.85)
				s.pathQueueDepth[PathB] = int(float64(s.pathQueueDepth[PathB]) * 0.85)
				if s.pathQueueDepth[PathA] < 0 {
					s.pathQueueDepth[PathA] = 0
				}
				if s.pathQueueDepth[PathB] < 0 {
					s.pathQueueDepth[PathB] = 0
				}

				s.mu.Unlock()
				tick := IOTick{
					PathA:     valA,
					PathB:     valB,
					Timestamp: time.Now().UnixMilli(),
				}
				msg := WSMessage{Type: "io_tick", Data: tick}
				s.broadcast(msg)
			} else {
				activeOnly := s.activePath
				s.mu.Unlock()

				jitterA := 1.0 + (rand.Float64()-0.5)*0.1
				jitterB := 1.0 + (rand.Float64()-0.5)*0.1

				valA := int(math.Round(baseA * loadFactor * jitterA))
				valB := int(math.Round(baseB * loadFactor * jitterB))

				if activeOnly == PathA {
					valB = int(float64(valB) * 0.1)
				} else {
					valA = int(float64(valA) * 0.1)
				}

				tick := IOTick{
					PathA:     valA,
					PathB:     valB,
					Timestamp: time.Now().UnixMilli(),
				}
				msg := WSMessage{Type: "io_tick", Data: tick}
				s.broadcast(msg)
			}
		}
	}()
}

func (s *Simulator) StartRetryProcessor() {
	go func() {
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()

		for range ticker.C {
			s.processRetryQueue()
		}
	}()
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func main() {
	sim := NewSimulator()
	sim.StartIOTicker()
	sim.StartRetryProcessor()

	gin.SetMode(gin.ReleaseMode)
	r := gin.Default()

	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"*"},
		AllowMethods:     []string{"GET", "POST", "OPTIONS"},
		AllowHeaders:     []string{"Content-Type"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: false,
		MaxAge:           12 * time.Hour,
	}))

	r.GET("/api/status", func(c *gin.Context) {
		c.JSON(http.StatusOK, sim.GetStatus())
	})

	r.GET("/api/stats/latency", func(c *gin.Context) {
		sim.mu.RLock()
		stats := sim.computeLatencyStatsLocked()
		sim.mu.RUnlock()
		c.JSON(http.StatusOK, stats)
	})

	r.POST("/api/path/:id/disconnect", func(c *gin.Context) {
		id := PathID(c.Param("id"))
		if id != PathA && id != PathB {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid path id"})
			return
		}
		ok := sim.DisconnectPath(id)
		c.JSON(http.StatusOK, gin.H{"success": ok})
	})

	r.POST("/api/path/:id/connect", func(c *gin.Context) {
		id := PathID(c.Param("id"))
		if id != PathA && id != PathB {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid path id"})
			return
		}
		ok := sim.ConnectPath(id)
		c.JSON(http.StatusOK, gin.H{"success": ok})
	})

	r.POST("/api/failover/toggle", func(c *gin.Context) {
		var req struct {
			Enabled bool `json:"enabled"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
			return
		}
		sim.ToggleAutoFailover(req.Enabled)
		c.JSON(http.StatusOK, gin.H{"enabled": req.Enabled})
	})

	r.POST("/api/io/load", func(c *gin.Context) {
		var req struct {
			Percent int `json:"percent"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
			return
		}
		sim.SetIOLoad(req.Percent)
		c.JSON(http.StatusOK, gin.H{"percent": req.Percent})
	})

	r.GET("/ws", func(c *gin.Context) {
		conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			log.Println("WebSocket upgrade error:", err)
			return
		}
		sim.RegisterWS(conn)
		defer func() {
			sim.UnregisterWS(conn)
			conn.Close()
		}()

		statusMsg := WSMessage{Type: "status", Data: sim.GetStatus()}
		data, _ := json.Marshal(statusMsg)
		sim.wsWriteMu.Lock()
		conn.WriteMessage(websocket.TextMessage, data)
		sim.wsWriteMu.Unlock()

		for {
			_, _, err := conn.ReadMessage()
			if err != nil {
				break
			}
		}
	})

	log.Println("NVMe/TCP Simulator backend starting on http://localhost:8080")
	if err := r.Run(":8080"); err != nil {
		log.Fatal("Server failed:", err)
	}
}
