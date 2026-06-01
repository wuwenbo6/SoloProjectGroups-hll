package fip

import (
	"bytes"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"math/rand"
	"sort"
	"strconv"
	"sync"
	"time"
)

type FIPSimulator struct {
	Ports         map[string]*VNPort
	VLANS         []int
	Events        []*Event
	VirtualLinks  []*VirtualLink
	VFIDTable     map[string]*VFIDEntry
	SessionTable  map[string]*SessionEntry
	PrimaryPort   string
	eventChan     chan *Event
	mu            sync.RWMutex
	vfidCounter   int
	fpmaCounter   int
	stopChan      chan struct{}
}

func NewFIPSimulator() *FIPSimulator {
	return &FIPSimulator{
		Ports:        make(map[string]*VNPort),
		VLANS:        []int{100, 200, 300, 400},
		Events:       make([]*Event, 0),
		VirtualLinks: make([]*VirtualLink, 0),
		VFIDTable:    make(map[string]*VFIDEntry),
		SessionTable: make(map[string]*SessionEntry),
		eventChan:    make(chan *Event, 100),
		stopChan:     make(chan struct{}),
	}
}

func (s *FIPSimulator) generateFPMA() string {
	s.fpmaCounter++
	return fmt.Sprintf("%s:%02x:%02x:%02x:%02x",
		FPMA_OUI,
		(s.fpmaCounter>>24)&0xFF,
		(s.fpmaCounter>>16)&0xFF,
		(s.fpmaCounter>>8)&0xFF,
		s.fpmaCounter&0xFF,
	)
}

func (s *FIPSimulator) AddVNPort(name string, mac string, wwpn string, wwnn string, priority int) *VNPort {
	s.mu.Lock()
	defer s.mu.Unlock()

	id := fmt.Sprintf("vn-port-%d", len(s.Ports)+1)
	fpma := s.generateFPMA()
	port := &VNPort{
		ID:        id,
		Name:      name,
		MAC:       mac,
		FPMA:      fpma,
		WWPN:      wwpn,
		WWNN:      wwnn,
		VLANs:     make([]int, 0),
		State:     "INIT",
		PeerPorts: make(map[string]*VirtualLink),
		Priority:  priority,
		IsPrimary: false,
		Negotiation: &NegotiationParams{
			FC4Types:    []string{"SCSI-FCP", "FC-GS"},
			MaxRXSize:   2112,
			MaxTXSize:   2112,
			ED_TOV:      2 * time.Second,
			RA_TOV:      10 * time.Second,
			FSPFEnabled: true,
			BB_Credit:   10,
		},
	}

	s.Ports[id] = port

	s.addEvent(&Event{
		Type:      "PORT_ADDED",
		Message:   fmt.Sprintf("VN Port %s added with MAC %s, FPMA %s, Priority %d", name, mac, fpma, priority),
		PortID:    id,
		Timestamp: time.Now(),
	})

	s.createVFID(id, name)

	s.runElectionLocked()

	return port
}

func (s *FIPSimulator) createVFID(portID string, portName string) {
	s.vfidCounter++
	now := time.Now()
	entry := &VFIDEntry{
		ID:        fmt.Sprintf("vfid-%d", s.vfidCounter),
		VFID:      s.vfidCounter,
		PortID:    portID,
		PortName:  portName,
		CreatedAt: now,
		TTL:       DEFAULT_VFID_TTL,
		ExpiresAt: now.Add(time.Duration(DEFAULT_VFID_TTL) * time.Second),
		Alive:     true,
	}
	s.VFIDTable[portID] = entry

	s.addEvent(&Event{
		Type:      "VFID_CREATED",
		Message:   fmt.Sprintf("VFID %d created for port %s, TTL=%ds, expires at %s", entry.VFID, portName, entry.TTL, entry.ExpiresAt.Format("15:04:05")),
		PortID:    portID,
		Timestamp: now,
		Details:   entry,
	})
}

func (s *FIPSimulator) RefreshVFID(portID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	entry, exists := s.VFIDTable[portID]
	if !exists {
		return fmt.Errorf("VFID for port %s not found", portID)
	}

	if !entry.Alive {
		return fmt.Errorf("VFID %d for port %s is expired", entry.VFID, entry.PortName)
	}

	now := time.Now()
	entry.TTL = DEFAULT_VFID_TTL
	entry.ExpiresAt = now.Add(time.Duration(DEFAULT_VFID_TTL) * time.Second)

	s.addEvent(&Event{
		Type:      "VFID_REFRESHED",
		Message:   fmt.Sprintf("VFID %d refreshed for port %s, TTL=%ds, new expiry %s", entry.VFID, entry.PortName, entry.TTL, entry.ExpiresAt.Format("15:04:05")),
		PortID:    portID,
		Timestamp: now,
	})

	return nil
}

func (s *FIPSimulator) StartVFIDTTLTimer() {
	ticker := time.NewTicker(1 * time.Second)
	go func() {
		for {
			select {
			case <-ticker.C:
				s.tickVFIDTTL()
			case <-s.stopChan:
				ticker.Stop()
				return
			}
		}
	}()
}

func (s *FIPSimulator) tickVFIDTTL() {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now()
	expired := make([]*VFIDEntry, 0)

	for portID, entry := range s.VFIDTable {
		if !entry.Alive {
			continue
		}
		remaining := int(time.Until(entry.ExpiresAt).Seconds())
		if remaining <= 0 {
			entry.Alive = false
			entry.TTL = 0
			expired = append(expired, entry)

			if port, exists := s.Ports[portID]; exists {
				port.State = "VFID_EXPIRED"
				port.IsPrimary = false
			}

			s.addEvent(&Event{
				Type:      "VFID_EXPIRED",
				Message:   fmt.Sprintf("VFID %d for port %s has EXPIRED (TTL reached 0)", entry.VFID, entry.PortName),
				PortID:    portID,
				Timestamp: now,
				Details:   entry,
			})

			for i, link := range s.VirtualLinks {
				if link.SourceID == portID || link.DestID == portID {
					link.State = "DOWN"
					s.VirtualLinks[i] = link
				}
			}

			for sessionID, session := range s.SessionTable {
				if session.SourceID == portID || session.DestID == portID {
					session.State = "TERMINATED"
					s.SessionTable[sessionID] = session
				}
			}
		} else {
			entry.TTL = remaining
		}
	}

	if len(expired) > 0 {
		s.runElectionLocked()
	}
}

func (s *FIPSimulator) runElectionLocked() {
	oldPrimary := s.PrimaryPort

	candidates := make([]*VNPort, 0)
	for _, port := range s.Ports {
		if entry, exists := s.VFIDTable[port.ID]; exists && entry.Alive {
			candidates = append(candidates, port)
		} else {
			port.IsPrimary = false
		}
	}

	for _, port := range s.Ports {
		port.IsPrimary = false
		port.PrimaryPortID = ""
	}

	if len(candidates) == 0 {
		s.PrimaryPort = ""
		if oldPrimary != "" {
			s.addEvent(&Event{
				Type:      "ELECTION_RESULT",
				Message:   "No eligible candidates, primary port cleared",
				Timestamp: time.Now(),
			})
		}
		return
	}

	sort.Slice(candidates, func(i, j int) bool {
		return candidates[i].Priority > candidates[j].Priority
	})

	winner := candidates[0]
	s.PrimaryPort = winner.ID
	winner.IsPrimary = true

	for _, port := range s.Ports {
		port.PrimaryPortID = winner.ID
	}

	votes := make(map[string]int)
	for _, port := range s.Ports {
		if entry, exists := s.VFIDTable[port.ID]; exists && entry.Alive {
			votes[port.ID] = port.Priority
		}
	}

	result := &ElectionResult{
		PrimaryID:   winner.ID,
		PrimaryName: winner.Name,
		Priority:    winner.Priority,
		Timestamp:   time.Now(),
		PortVotes:   votes,
	}

	eventMsg := fmt.Sprintf("Election complete: Primary port = %s (Priority %d)", winner.Name, winner.Priority)
	if oldPrimary != "" && oldPrimary != winner.ID {
		if oldPort, exists := s.Ports[oldPrimary]; exists {
			eventMsg = fmt.Sprintf("Primary port changed: %s → %s (Priority %d)", oldPort.Name, winner.Name, winner.Priority)
		}
	}

	s.addEvent(&Event{
		Type:      "ELECTION_RESULT",
		Message:   eventMsg,
		PortID:    winner.ID,
		Timestamp: time.Now(),
		Details:   result,
	})
}

func (s *FIPSimulator) RunElection() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.runElectionLocked()
}

func (s *FIPSimulator) StartVLANDiscovery(portID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	port, exists := s.Ports[portID]
	if !exists {
		return fmt.Errorf("port %s not found", portID)
	}

	if entry, exists := s.VFIDTable[portID]; exists && !entry.Alive {
		return fmt.Errorf("port %s VFID expired, cannot proceed", portID)
	}

	port.State = "VLAN_DISCOVERY"
	s.addEvent(&Event{
		Type:      "VLAN_DISCOVERY_START",
		Message:   fmt.Sprintf("Starting VLAN Discovery on port %s (FPMA: %s)", port.Name, port.FPMA),
		PortID:    portID,
		Timestamp: time.Now(),
	})

	go s.simulateVLANDiscovery(portID)
	return nil
}

func (s *FIPSimulator) simulateVLANDiscovery(portID string) {
	time.Sleep(500 * time.Millisecond)

	s.mu.Lock()
	port := s.Ports[portID]
	s.mu.Unlock()

	s.addEvent(&Event{
		Type:      "FIP_SENT",
		Message:   fmt.Sprintf("Sent FIP VLAN Discovery Solicitation from %s (FPMA: %s)", port.MAC, port.FPMA),
		PortID:    portID,
		Timestamp: time.Now(),
		Details:   FIPMessage{Opcode: FIP_VLAN_DISCOVERY, SrcMAC: port.MAC},
	})

	time.Sleep(300 * time.Millisecond)

	s.mu.Lock()
	discoveredVLANs := make([]int, 0)
	for _, vlan := range s.VLANS {
		if rand.Float32() > 0.3 {
			discoveredVLANs = append(discoveredVLANs, vlan)
			s.addEvent(&Event{
				Type:      "FIP_RECEIVED",
				Message:   fmt.Sprintf("Received FIP VLAN Notification: VLAN %d", vlan),
				PortID:    portID,
				VLANID:    vlan,
				Timestamp: time.Now(),
				Details:   FIPMessage{Opcode: FIP_VLAN_NOTIFICATION, VLANID: vlan},
			})
		}
	}

	port.VLANs = discoveredVLANs
	port.State = "VLAN_DISCOVERED"
	s.mu.Unlock()

	s.addEvent(&Event{
		Type:      "VLAN_DISCOVERY_COMPLETE",
		Message:   fmt.Sprintf("VLAN Discovery complete. Discovered VLANs: %v", discoveredVLANs),
		PortID:    portID,
		Timestamp: time.Now(),
		Details:   discoveredVLANs,
	})
}

func (s *FIPSimulator) StartParameterExchange(portID string, peerID string, vlanID int) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	port, exists := s.Ports[portID]
	if !exists {
		return fmt.Errorf("port %s not found", portID)
	}

	peer, exists := s.Ports[peerID]
	if !exists {
		return fmt.Errorf("peer port %s not found", peerID)
	}

	if entry, exists := s.VFIDTable[portID]; exists && !entry.Alive {
		return fmt.Errorf("port %s VFID expired, cannot proceed", portID)
	}

	if entry, exists := s.VFIDTable[peerID]; exists && !entry.Alive {
		return fmt.Errorf("peer port %s VFID expired, cannot proceed", peerID)
	}

	port.State = "PARAM_EXCHANGE"
	s.addEvent(&Event{
		Type:      "PARAM_EXCHANGE_START",
		Message:   fmt.Sprintf("Starting parameter exchange between %s (FPMA: %s) and %s (FPMA: %s) on VLAN %d", port.Name, port.FPMA, peer.Name, peer.FPMA, vlanID),
		PortID:    portID,
		PeerID:    peerID,
		VLANID:    vlanID,
		Timestamp: time.Now(),
	})

	go s.simulateParameterExchange(portID, peerID, vlanID)
	return nil
}

func (s *FIPSimulator) simulateParameterExchange(portID string, peerID string, vlanID int) {
	time.Sleep(400 * time.Millisecond)

	s.mu.Lock()
	port := s.Ports[portID]
	peer := s.Ports[peerID]
	s.mu.Unlock()

	s.addEvent(&Event{
		Type:      "FIP_SENT",
		Message:   fmt.Sprintf("Sent Discovery Request from %s (FPMA: %s) to %s", port.Name, port.FPMA, peer.Name),
		PortID:    portID,
		PeerID:    peerID,
		VLANID:    vlanID,
		Timestamp: time.Now(),
		Details: FIPMessage{
			Opcode: FIP_DISC_REQ,
			SrcMAC: port.MAC,
			DstMAC: peer.MAC,
			VLANID: vlanID,
			WWPN:   port.WWPN,
			Params: port.Negotiation,
		},
	})

	time.Sleep(500 * time.Millisecond)

	s.addEvent(&Event{
		Type:      "FIP_RECEIVED",
		Message:   fmt.Sprintf("Received Discovery Response from %s (FPMA: %s)", peer.Name, peer.FPMA),
		PortID:    portID,
		PeerID:    peerID,
		VLANID:    vlanID,
		Timestamp: time.Now(),
		Details: FIPMessage{
			Opcode: FIP_DISC_RSP,
			SrcMAC: peer.MAC,
			DstMAC: port.MAC,
			VLANID: vlanID,
			WWPN:   peer.WWPN,
			Params: peer.Negotiation,
		},
	})

	time.Sleep(300 * time.Millisecond)

	negotiated := s.negotiateParams(port.Negotiation, peer.Negotiation)

	s.addEvent(&Event{
		Type:      "PARAM_NEGOTIATED",
		Message:   fmt.Sprintf("Parameters negotiated successfully"),
		PortID:    portID,
		PeerID:    peerID,
		VLANID:    vlanID,
		Timestamp: time.Now(),
		Details:   negotiated,
	})

	s.mu.Lock()
	port.State = "PARAM_NEGOTIATED"
	s.mu.Unlock()

	time.Sleep(200 * time.Millisecond)
	s.establishVirtualLink(portID, peerID, vlanID, negotiated)
}

func (s *FIPSimulator) negotiateParams(p1, p2 *NegotiationParams) *NegotiationParams {
	return &NegotiationParams{
		FC4Types:    intersectStrings(p1.FC4Types, p2.FC4Types),
		MaxRXSize:   min(p1.MaxRXSize, p2.MaxRXSize),
		MaxTXSize:   min(p1.MaxTXSize, p2.MaxTXSize),
		ED_TOV:      maxDuration(p1.ED_TOV, p2.ED_TOV),
		RA_TOV:      maxDuration(p1.RA_TOV, p2.RA_TOV),
		FSPFEnabled: p1.FSPFEnabled && p2.FSPFEnabled,
		BB_Credit:   min(p1.BB_Credit, p2.BB_Credit),
	}
}

func (s *FIPSimulator) establishVirtualLink(portID string, peerID string, vlanID int, params *NegotiationParams) {
	s.mu.Lock()
	defer s.mu.Unlock()

	port := s.Ports[portID]
	peer := s.Ports[peerID]

	linkID := fmt.Sprintf("vl-%s-%s-%d", portID, peerID, vlanID)
	link := &VirtualLink{
		ID:        linkID,
		SourceID:  portID,
		DestID:    peerID,
		VLANID:    vlanID,
		State:     "ESTABLISHED",
		CreatedAt: time.Now(),
		Params:    params,
	}

	s.VirtualLinks = append(s.VirtualLinks, link)
	port.PeerPorts[peerID] = link
	peer.PeerPorts[portID] = link
	port.State = "LINK_ESTABLISHED"
	peer.State = "LINK_ESTABLISHED"

	sessionID := fmt.Sprintf("session-%s-%s-vlan%d", portID, peerID, vlanID)
	session := &SessionEntry{
		ID:         sessionID,
		SourceID:   portID,
		SourceName: port.Name,
		SourceMAC:  port.MAC,
		SourceFPMA: port.FPMA,
		SourceWWPN: port.WWPN,
		DestID:     peerID,
		DestName:   peer.Name,
		DestMAC:    peer.MAC,
		DestFPMA:   peer.FPMA,
		DestWWPN:   peer.WWPN,
		VLANID:     vlanID,
		State:      "ACTIVE",
		CreatedAt:  time.Now(),
		ExpiresAt:  time.Now().Add(time.Duration(DEFAULT_VFID_TTL) * time.Second),
		Params:     params,
		TrafficStats: TrafficStats{
			TXFrames: uint64(rand.Intn(1000)),
			RXFrames: uint64(rand.Intn(1000)),
			TXBytes:  uint64(rand.Intn(1000000)),
			RXBytes:  uint64(rand.Intn(1000000)),
		},
	}
	s.SessionTable[sessionID] = session

	s.addEvent(&Event{
		Type:      "SESSION_CREATED",
		Message:   fmt.Sprintf("Session created: %s <-> %s on VLAN %d (FPMA: %s <-> %s)", port.Name, peer.Name, vlanID, port.FPMA, peer.FPMA),
		PortID:    portID,
		PeerID:    peerID,
		VLANID:    vlanID,
		Timestamp: time.Now(),
		Details:   session,
	})

	s.addEvent(&Event{
		Type:      "LINK_ESTABLISHED",
		Message:   fmt.Sprintf("Virtual Link established between %s and %s on VLAN %d", port.Name, peer.Name, vlanID),
		PortID:    portID,
		PeerID:    peerID,
		VLANID:    vlanID,
		Timestamp: time.Now(),
		Details:   link,
	})
}

func (s *FIPSimulator) addEvent(event *Event) {
	s.Events = append(s.Events, event)
	select {
	case s.eventChan <- event:
	default:
	}
}

func (s *FIPSimulator) GetEventChannel() <-chan *Event {
	return s.eventChan
}

func (s *FIPSimulator) GetPorts() map[string]*VNPort {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.Ports
}

func (s *FIPSimulator) GetEvents() []*Event {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.Events
}

func (s *FIPSimulator) GetVirtualLinks() []*VirtualLink {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.VirtualLinks
}

func (s *FIPSimulator) GetVLANS() []int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.VLANS
}

func (s *FIPSimulator) GetVFIDTable() map[string]*VFIDEntry {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.VFIDTable
}

func (s *FIPSimulator) GetSessionTable() map[string]*SessionEntry {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.SessionTable
}

func (s *FIPSimulator) GetPrimaryPort() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.PrimaryPort
}

func (s *FIPSimulator) ExportSessionTableJSON() ([]byte, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return json.MarshalIndent(s.SessionTable, "", "  ")
}

func (s *FIPSimulator) ExportSessionTableCSV() ([][]string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	records := [][]string{{
		"Session ID",
		"Source Name",
		"Source MAC",
		"Source FPMA",
		"Source WWPN",
		"Dest Name",
		"Dest MAC",
		"Dest FPMA",
		"Dest WWPN",
		"VLAN ID",
		"State",
		"Created At",
		"Expires At",
		"TX Frames",
		"RX Frames",
		"TX Bytes",
		"RX Bytes",
	}}

	for _, session := range s.SessionTable {
		records = append(records, []string{
			session.ID,
			session.SourceName,
			session.SourceMAC,
			session.SourceFPMA,
			session.SourceWWPN,
			session.DestName,
			session.DestMAC,
			session.DestFPMA,
			session.DestWWPN,
			strconv.Itoa(session.VLANID),
			session.State,
			session.CreatedAt.Format(time.RFC3339),
			session.ExpiresAt.Format(time.RFC3339),
			strconv.FormatUint(session.TrafficStats.TXFrames, 10),
			strconv.FormatUint(session.TrafficStats.RXFrames, 10),
			strconv.FormatUint(session.TrafficStats.TXBytes, 10),
			strconv.FormatUint(session.TrafficStats.RXBytes, 10),
		})
	}

	return records, nil
}

func (s *FIPSimulator) ExportSessionTableCSVBytes() ([]byte, error) {
	records, err := s.ExportSessionTableCSV()
	if err != nil {
		return nil, err
	}

	buf := &bytes.Buffer{}
	writer := csv.NewWriter(buf)
	for _, record := range records {
		if err := writer.Write(record); err != nil {
			return nil, err
		}
	}
	writer.Flush()

	return buf.Bytes(), nil
}

func (s *FIPSimulator) StartFKA() {
	ticker := time.NewTicker(8 * time.Second)
	go func() {
		for {
			select {
			case <-ticker.C:
				s.mu.RLock()
				for _, port := range s.Ports {
					if port.State == "LINK_ESTABLISHED" {
						s.RefreshVFID(port.ID)
						for sessionID, session := range s.SessionTable {
							if session.SourceID == port.ID || session.DestID == port.ID {
								session.ExpiresAt = time.Now().Add(time.Duration(DEFAULT_VFID_TTL) * time.Second)
								session.TrafficStats.TXFrames += uint64(rand.Intn(100))
								session.TrafficStats.RXFrames += uint64(rand.Intn(100))
								session.TrafficStats.TXBytes += uint64(rand.Intn(50000))
								session.TrafficStats.RXBytes += uint64(rand.Intn(50000))
								s.SessionTable[sessionID] = session
							}
						}
						s.addEvent(&Event{
							Type:      "FKA_ADV",
							Message:   fmt.Sprintf("FKA Advertisement sent from %s (FPMA: %s)", port.Name, port.FPMA),
							PortID:    port.ID,
							Timestamp: time.Now(),
						})
					}
				}
				s.mu.RUnlock()
			case <-s.stopChan:
				ticker.Stop()
				return
			}
		}
	}()
}

func intersectStrings(a, b []string) []string {
	m := make(map[string]bool)
	for _, s := range a {
		m[s] = true
	}
	result := make([]string, 0)
	for _, s := range b {
		if m[s] {
			result = append(result, s)
		}
	}
	return result
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func maxDuration(a, b time.Duration) time.Duration {
	if a > b {
		return a
	}
	return b
}
