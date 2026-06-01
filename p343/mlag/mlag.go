package mlag

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"
)

func SetupMlagPair(sw1, sw2 *Switch) {
	sw1.Peer = sw2
	sw2.Peer = sw1
}

func (s *Switch) runHeartbeatLoop(wg *sync.WaitGroup) {
	defer wg.Done()

	ticker := time.NewTicker(s.Config.HeartbeatInterval)
	defer ticker.Stop()

	for {
		select {
		case <-s.stopChan:
			return
		case <-ticker.C:
			s.sendHeartbeat()
			s.checkPeerHeartbeat()
		}
	}
}

func (s *Switch) sendHeartbeat() {
	s.mu.Lock()
	s.SeqNum++
	seqNum := s.SeqNum
	role := s.Role
	s.mu.Unlock()

	ports := make([]Port, 0)
	lacpStates := make([]LacpState, 0)

	s.mu.RLock()
	for _, p := range s.Ports {
		ports = append(ports, *p)
		if p.LacpState != nil {
			lacpStates = append(lacpStates, *p.LacpState)
		}
	}
	s.mu.RUnlock()

	sendTime := time.Now()
	heartbeat := HeartbeatInfo{
		SwitchID:   s.ID,
		Role:       role,
		Timestamp:  sendTime,
		SeqNum:     seqNum,
		Alive:      true,
		Ports:      ports,
		LacpStates: lacpStates,
	}

	go s.sendHeartbeatToPeer(heartbeat)
	go func() {
		peerID := "unknown"
		peerAlive := false
		if s.Peer != nil {
			peerID = s.Peer.ID
			s.Peer.mu.RLock()
			peerAlive = s.Peer.PeerInfo != nil && s.Peer.PeerInfo.Alive
			s.Peer.mu.RUnlock()
		}

		if s.HeartbeatLogger != nil {
			s.HeartbeatLogger.Log(HeartbeatRecord{
				Source:    s.ID,
				Dest:      peerID,
				SeqNum:    seqNum,
				Role:      role,
				Timestamp: sendTime,
				LatencyMs: 0,
				Received:  true,
				PeerAlive: peerAlive,
			})
		}
	}()
}

func (s *Switch) sendHeartbeatToPeer(hb HeartbeatInfo) {
	if s.Peer == nil {
		return
	}

	s.Peer.ReceiveHeartbeat(hb)
}

func (s *Switch) ReceiveHeartbeat(hb HeartbeatInfo) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.PeerInfo = &hb
	s.LastHeartbeat = hb.Timestamp
}

func (s *Switch) checkPeerHeartbeat() {
	s.mu.RLock()
	lastHeartbeat := s.LastHeartbeat
	s.mu.RUnlock()

	if !lastHeartbeat.IsZero() {
		deadline := lastHeartbeat.Add(s.Config.DeadInterval)
		if time.Now().After(deadline) {
			s.mu.Lock()
			if s.PeerInfo != nil {
				s.PeerInfo.Alive = false
			}
			s.mu.Unlock()
		}
	}
}

func (s *Switch) runElectionLoop(wg *sync.WaitGroup) {
	defer wg.Done()

	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-s.stopChan:
			return
		case <-ticker.C:
			s.performElection()
		}
	}
}

func (s *Switch) performElection() {
	s.mu.RLock()
	myPriority := s.Config.Priority
	myID := s.ID
	peerInfo := s.PeerInfo
	myRole := s.Role
	failbackState := s.FailbackState
	failbackStartAt := s.FailbackStartAt
	wasMasterBefore := s.WasMasterBefore
	failbackTimer := s.Config.FailbackTimer
	s.mu.RUnlock()

	var peerPriority int
	var peerID string
	var peerAlive bool

	if peerInfo != nil {
		peerAlive = peerInfo.Alive
		peerID = peerInfo.SwitchID
	}

	if s.Peer != nil {
		peerPriority = s.Peer.Config.Priority
	}

	if !peerAlive || peerInfo == nil {
		s.mu.Lock()
		if myRole != RoleMaster {
			if myRole == RoleBackup {
				s.WasMasterBefore = false
			}
		} else {
			s.WasMasterBefore = true
		}
		s.Role = RoleMaster
		s.electionWon = true
		s.FailbackState = FailbackNone
		s.PeerWasDown = true
		s.mu.Unlock()
		return
	}

	s.mu.Lock()
	if s.PeerWasDown && peerAlive {
		s.PeerWasDown = false
		if myRole == RoleMaster && wasMasterBefore {
			s.FailbackState = FailbackWaiting
			s.FailbackStartAt = time.Now()
		}
	}
	s.mu.Unlock()

	var iShouldBeMaster bool

	if myPriority != peerPriority {
		iShouldBeMaster = myPriority > peerPriority
	} else {
		iShouldBeMaster = myID < peerID
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if failbackState == FailbackWaiting {
		elapsed := time.Since(failbackStartAt)
		if elapsed >= failbackTimer {
			s.FailbackState = FailbackReady
		} else {
			iShouldBeMaster = false
		}
	}

	if myRole == RoleMaster {
		if peerInfo.Role == RoleMaster {
			if !iShouldBeMaster {
				s.Role = RoleBackup
				s.electionWon = false
				s.FailbackState = FailbackNone
			}
		}
	} else if myRole == RoleBackup {
		if iShouldBeMaster {
			if s.FailbackState == FailbackWaiting {
				// do nothing, wait for timer
			} else {
				s.Role = RoleMaster
				s.electionWon = true
				s.FailbackState = FailbackNone
				s.WasMasterBefore = true
			}
		}
	} else {
		if iShouldBeMaster {
			s.Role = RoleMaster
			s.electionWon = true
			s.FailbackState = FailbackNone
			s.WasMasterBefore = true
		} else {
			s.Role = RoleBackup
			s.electionWon = false
		}
	}

	if s.Role == RoleMaster {
		s.FailbackState = FailbackNone
	}
}

func (s *Switch) runLacpSyncLoop(wg *sync.WaitGroup) {
	defer wg.Done()

	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-s.stopChan:
			return
		case <-ticker.C:
			s.syncLacpStates()
		}
	}
}

func (s *Switch) syncLacpStates() {
	s.mu.RLock()
	role := s.Role
	peerInfo := s.PeerInfo
	s.mu.RUnlock()

	if peerInfo == nil {
		return
	}

	if role == RoleMaster {
		activeCount := 0
		s.mu.RLock()
		for _, p := range s.Ports {
			if p.LacpState != nil && p.LacpState.State == "Active" {
				activeCount++
			}
		}
		s.mu.RUnlock()
	} else {
		s.syncFromPeer(peerInfo)
	}
}

func (s *Switch) syncFromPeer(peerInfo *HeartbeatInfo) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for _, peerLacp := range peerInfo.LacpStates {
		if port, exists := s.Ports[peerLacp.PortID]; exists {
			if port.LacpState != nil {
				port.LacpState.PartnerKey = peerLacp.ActorKey
				port.LacpState.UpdatedAt = time.Now()
			}
		}
	}
}

func SendHeartbeatOverHTTP(peerAddr string, hb HeartbeatInfo) error {
	data, err := json.Marshal(hb)
	if err != nil {
		return err
	}

	resp, err := http.Post(
		fmt.Sprintf("http://%s/api/heartbeat", peerAddr),
		"application/json",
		bytes.NewBuffer(data),
	)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	return nil
}
