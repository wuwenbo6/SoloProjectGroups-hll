package sctp

import (
	"sort"
	"sync"
	"time"
)

type Simulator struct {
	mu         sync.RWMutex
	EndpointA  *Endpoint
	EndpointB  *Endpoint
	config     SimulatorConfig
	isRunning  bool
	events     []PathSwitchEvent
	eventsChan chan PathSwitchEvent
}

func NewSimulator(config SimulatorConfig) *Simulator {
	if config.HeartbeatInterval == 0 {
		config.HeartbeatInterval = 1 * time.Second
	}
	if config.MaxMissedHeartbeats == 0 {
		config.MaxMissedHeartbeats = 3
	}
	if len(config.EndpointAIPs) == 0 {
		config.EndpointAIPs = []string{"192.168.1.1", "192.168.2.1"}
	}
	if len(config.EndpointBIPs) == 0 {
		config.EndpointBIPs = []string{"192.168.1.2", "192.168.2.2"}
	}
	if config.EndpointAName == "" {
		config.EndpointAName = "Endpoint A"
	}
	if config.EndpointBName == "" {
		config.EndpointBName = "Endpoint B"
	}

	s := &Simulator{
		config:     config,
		eventsChan: make(chan PathSwitchEvent, 100),
	}

	s.EndpointA = NewEndpoint("A", config.EndpointAName, config.EndpointAIPs, config.EndpointBIPs, config)
	s.EndpointB = NewEndpoint("B", config.EndpointBName, config.EndpointBIPs, config.EndpointAIPs, config)

	s.EndpointA.SetPeer(s.EndpointB)
	s.EndpointB.SetPeer(s.EndpointA)

	eventCallback := func(event PathSwitchEvent) {
		s.mu.Lock()
		s.events = append(s.events, event)
		s.mu.Unlock()
		select {
		case s.eventsChan <- event:
		default:
		}
	}

	s.EndpointA.SetEventCallback(eventCallback)
	s.EndpointB.SetEventCallback(eventCallback)

	return s
}

func (s *Simulator) Start() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.isRunning {
		return
	}

	s.EndpointA.Start()
	s.EndpointB.Start()
	s.isRunning = true
}

func (s *Simulator) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.isRunning {
		return
	}

	s.EndpointA.Stop()
	s.EndpointB.Stop()
	s.isRunning = false
}

func (s *Simulator) IsRunning() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.isRunning
}

func (s *Simulator) GetAllSwitchEvents() []PathSwitchEvent {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]PathSwitchEvent, len(s.events))
	copy(result, s.events)
	return result
}

func (s *Simulator) GetEventsChannel() <-chan PathSwitchEvent {
	return s.eventsChan
}

func (s *Simulator) SimulateFailure(endpointID, srcIP, dstIP string) {
	if endpointID == "A" {
		s.EndpointA.SimulatePathFailure(srcIP, dstIP)
	} else if endpointID == "B" {
		s.EndpointB.SimulatePathFailure(srcIP, dstIP)
	}
}

func (s *Simulator) SimulateRecovery(endpointID, srcIP, dstIP string) {
	if endpointID == "A" {
		s.EndpointA.SimulatePathRecovery(srcIP, dstIP)
	} else if endpointID == "B" {
		s.EndpointB.SimulatePathRecovery(srcIP, dstIP)
	}
}

func (s *Simulator) SendData(endpointID, content string) {
	if endpointID == "A" {
		s.EndpointA.SendData(content)
	} else if endpointID == "B" {
		s.EndpointB.SendData(content)
	}
}

func (s *Simulator) SetPrimaryPath(endpointID, srcIP, dstIP string) bool {
	if endpointID == "A" {
		return s.EndpointA.SetPrimaryPath(srcIP, dstIP)
	} else if endpointID == "B" {
		return s.EndpointB.SetPrimaryPath(srcIP, dstIP)
	}
	return false
}

func (s *Simulator) SetPathPriority(endpointID, srcIP, dstIP string, priority int) bool {
	if endpointID == "A" {
		return s.EndpointA.SetPathPriority(srcIP, dstIP, priority)
	} else if endpointID == "B" {
		return s.EndpointB.SetPathPriority(srcIP, dstIP, priority)
	}
	return false
}

type FullSwitchStats struct {
	EndpointA SwitchStats `json:"endpoint_a"`
	EndpointB SwitchStats `json:"endpoint_b"`
	Combined  SwitchStats `json:"combined"`
}

func (s *Simulator) GetSwitchStats() FullSwitchStats {
	statsA := s.EndpointA.GetSwitchStats()
	statsB := s.EndpointB.GetSwitchStats()

	allEvents := s.GetAllSwitchEvents()
	combined := SwitchStats{
		TotalSwitches:    len(allEvents),
		FailuresByReason: make(map[string]int),
	}

	if len(allEvents) > 0 {
		times := make([]int64, 0, len(allEvents))
		var total int64 = 0
		minVal := int64(1<<63 - 1)
		maxVal := int64(0)

		for _, event := range allEvents {
			times = append(times, event.SwitchTimeMs)
			total += event.SwitchTimeMs
			if event.SwitchTimeMs < minVal {
				minVal = event.SwitchTimeMs
			}
			if event.SwitchTimeMs > maxVal {
				maxVal = event.SwitchTimeMs
			}
			combined.FailuresByReason[event.Reason]++
		}

		combined.TotalDataMs = total
		combined.AvgSwitchTimeMs = float64(total) / float64(len(times))
		combined.MinSwitchTimeMs = minVal
		combined.MaxSwitchTimeMs = maxVal
		combined.LastSwitchTime = allEvents[len(allEvents)-1].Timestamp

		sort.Slice(times, func(i, j int) bool {
			return times[i] < times[j]
		})

		n := len(times)
		if n%2 == 0 {
			combined.MedianSwitchTimeMs = float64(times[n/2-1]+times[n/2]) / 2.0
		} else {
			combined.MedianSwitchTimeMs = float64(times[n/2])
		}

		p95Idx := int(float64(n) * 0.95)
		if p95Idx >= n {
			p95Idx = n - 1
		}
		combined.P95SwitchTimeMs = float64(times[p95Idx])

		p99Idx := int(float64(n) * 0.99)
		if p99Idx >= n {
			p99Idx = n - 1
		}
		combined.P99SwitchTimeMs = float64(times[p99Idx])
	}

	return FullSwitchStats{
		EndpointA: statsA,
		EndpointB: statsB,
		Combined:  combined,
	}
}

type SimulatorStatus struct {
	IsRunning bool              `json:"is_running"`
	EndpointA EndpointStatus    `json:"endpoint_a"`
	EndpointB EndpointStatus    `json:"endpoint_b"`
	AllEvents []PathSwitchEvent `json:"all_events"`
	Config    SimulatorConfig   `json:"config"`
}

func (s *Simulator) GetStatus() SimulatorStatus {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return SimulatorStatus{
		IsRunning: s.isRunning,
		EndpointA: s.EndpointA.GetStatus(),
		EndpointB: s.EndpointB.GetStatus(),
		AllEvents: s.GetAllSwitchEvents(),
		Config:    s.config,
	}
}

func (s *Simulator) Reset() {
	s.Stop()

	events := make([]PathSwitchEvent, 0)
	s.mu.Lock()
	s.events = events
	s.mu.Unlock()

	s.EndpointA = NewEndpoint("A", s.config.EndpointAName, s.config.EndpointAIPs, s.config.EndpointBIPs, s.config)
	s.EndpointB = NewEndpoint("B", s.config.EndpointBName, s.config.EndpointBIPs, s.config.EndpointAIPs, s.config)

	s.EndpointA.SetPeer(s.EndpointB)
	s.EndpointB.SetPeer(s.EndpointA)

	eventCallback := func(event PathSwitchEvent) {
		s.mu.Lock()
		s.events = append(s.events, event)
		s.mu.Unlock()
		select {
		case s.eventsChan <- event:
		default:
		}
	}

	s.EndpointA.SetEventCallback(eventCallback)
	s.EndpointB.SetEventCallback(eventCallback)

	s.Start()
}
