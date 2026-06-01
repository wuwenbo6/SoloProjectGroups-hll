package mlag

import (
	"fmt"
	"sync"
	"time"
)

var startTime = time.Now()

func NewSwitch(id, name string, config MlagConfig) *Switch {
	sw := &Switch{
		ID:              id,
		Name:            name,
		Role:            RoleUnknown,
		Config:          config,
		Ports:           make(map[string]*Port),
		Running:         false,
		stopChan:        make(chan struct{}),
		electionWon:     false,
		FailbackState:   FailbackNone,
		PeerWasDown:     false,
		WasMasterBefore: false,
		SystemMAC:       fmt.Sprintf("00:1a:2b:3c:4d:%02x", len(id)%256),
	}

	driftWindow := config.MacDriftWindow
	if driftWindow == 0 {
		driftWindow = 30 * time.Second
	}
	driftThreshold := config.MacDriftThreshold
	if driftThreshold == 0 {
		driftThreshold = 5
	}

	sw.MacTable = NewMacTable(driftWindow, driftThreshold)
	sw.HeartbeatLogger = NewHeartbeatLogger(1000)
	sw.initPorts()
	return sw
}

func (s *Switch) initPorts() {
	portNames := []string{"Eth1/1", "Eth1/2", "Eth1/3", "Eth1/4"}
	for i, name := range portNames {
		portID := fmt.Sprintf("port-%d", i+1)
		s.Ports[portID] = &Port{
			ID:    portID,
			Name:  name,
			State: PortStateUp,
			LacpState: &LacpState{
				PortID:        portID,
				State:         "Active",
				ActorKey:      100,
				PartnerKey:    100,
				ActorSystem:   s.ID,
				PartnerSystem: "peer-system",
				UpdatedAt:     time.Now(),
			},
		}
	}
}

func (s *Switch) Start(wg *sync.WaitGroup) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.Running {
		return fmt.Errorf("switch %s is already running", s.ID)
	}

	s.Running = true
	s.stopChan = make(chan struct{})

	wg.Add(1)
	go s.runHeartbeatLoop(wg)

	wg.Add(1)
	go s.runElectionLoop(wg)

	wg.Add(1)
	go s.runLacpSyncLoop(wg)

	wg.Add(1)
	go s.runMacCleanupLoop(wg)

	wg.Add(1)
	go s.runMacSimulateLoop(wg)

	wg.Add(1)
	go s.runConsistencyCheckLoop(wg)

	return nil
}

func (s *Switch) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.Running {
		return
	}

	s.Running = false
	close(s.stopChan)
}

func (s *Switch) GetRole() Role {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.Role
}

func (s *Switch) SetRole(role Role) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Role = role
}

func (s *Switch) IsRunning() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.Running
}

func (s *Switch) GetStatus() SwitchStatus {
	s.mu.RLock()
	defer s.mu.RUnlock()

	ports := make([]Port, 0, len(s.Ports))
	for _, p := range s.Ports {
		ports = append(ports, *p)
	}

	lacpStates := make([]LacpState, 0, len(s.Ports))
	for _, p := range s.Ports {
		if p.LacpState != nil {
			lacpStates = append(lacpStates, *p.LacpState)
		}
	}

	peerAlive := false
	peerRole := RoleUnknown
	if s.PeerInfo != nil {
		peerAlive = s.PeerInfo.Alive
		peerRole = s.PeerInfo.Role
	}

	lastHeartbeatStr := "Never"
	if !s.LastHeartbeat.IsZero() {
		lastHeartbeatStr = time.Since(s.LastHeartbeat).Round(time.Second).String()
	}

	failbackStatus := FailbackStatus{
		State: s.FailbackState,
		Total: s.Config.FailbackTimer.Round(time.Second).String(),
	}

	if s.FailbackState == FailbackWaiting && !s.FailbackStartAt.IsZero() {
		elapsed := time.Since(s.FailbackStartAt)
		remaining := s.Config.FailbackTimer - elapsed
		if remaining < 0 {
			remaining = 0
		}
		failbackStatus.Remaining = remaining.Round(time.Second).String()
		failbackStatus.StartedAt = s.FailbackStartAt.Format("15:04:05")
	} else if s.FailbackState == FailbackReady {
		failbackStatus.Remaining = "0s"
		failbackStatus.StartedAt = s.FailbackStartAt.Format("15:04:05")
	} else {
		failbackStatus.Remaining = "-"
		failbackStatus.StartedAt = "-"
	}

	var macEntries []MacEntry
	macDriftCount := 0
	macBlockedCount := 0
	if s.MacTable != nil {
		macEntries = s.MacTable.GetAllEntries()
		macDriftCount = s.MacTable.GetDriftCount()
		macBlockedCount = s.MacTable.GetBlockedCount()
	}

	heartbeatCount := 0
	if s.HeartbeatLogger != nil {
		heartbeatCount = s.HeartbeatLogger.Count()
	}

	return SwitchStatus{
		ID:              s.ID,
		Name:            s.Name,
		Role:            s.Role,
		UpTime:          time.Since(startTime).Round(time.Second).String(),
		LastHeartbeat:   lastHeartbeatStr,
		PeerAlive:       peerAlive,
		PeerRole:        peerRole,
		Ports:           ports,
		LacpStates:      lacpStates,
		Failback:        failbackStatus,
		MacEntries:      macEntries,
		MacDriftCount:   macDriftCount,
		MacBlockedCount: macBlockedCount,
		Consistency:     s.LastConsistency,
		HeartbeatCount:  heartbeatCount,
	}
}

func (s *Switch) GetPorts() map[string]*Port {
	s.mu.RLock()
	defer s.mu.RUnlock()
	ports := make(map[string]*Port)
	for k, v := range s.Ports {
		ports[k] = v
	}
	return ports
}

func (s *Switch) UpdatePortState(portID string, state PortState) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if port, exists := s.Ports[portID]; exists {
		port.State = state
	}
}

func (s *Switch) UpdateLacpState(portID string, state LacpState) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if port, exists := s.Ports[portID]; exists {
		state.PortID = portID
		state.UpdatedAt = time.Now()
		port.LacpState = &state
	}
}
