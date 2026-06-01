package mlag

import (
	"fmt"
	"strings"
	"sync"
	"time"
)

func NewMacTable(driftWindow time.Duration, driftThreshold int) *MacTable {
	return &MacTable{
		Entries:        make(map[string]*MacEntry),
		MaxEntries:     1024,
		DriftWindow:    driftWindow,
		DriftThreshold: driftThreshold,
	}
}

func (mt *MacTable) LearnMAC(mac string, portID string, vlan uint16, systemMAC string) MacMoveState {
	if entry, exists := mt.Entries[mac]; exists {
		if entry.PortID != portID {
			entry.MoveCount++
			entry.LastMoveAt = time.Now()
			entry.LastSeen = time.Now()
			oldPort := entry.PortID
			entry.PortID = portID
			entry.VLAN = vlan

			if entry.MoveCount >= mt.DriftThreshold {
				windowStart := time.Now().Add(-mt.DriftWindow)
				if entry.LastMoveAt.After(windowStart) {
					if entry.MoveCount >= mt.DriftThreshold*2 {
						entry.State = MacMoveBlocked
					} else {
						entry.State = MacMoveDrift
					}
				} else {
					entry.MoveCount = 1
					entry.State = MacMoveNormal
				}
			}

			if entry.State == MacMoveBlocked {
				entry.PortID = oldPort
				return MacMoveBlocked
			}

			return entry.State
		}

		entry.LastSeen = time.Now()
		return MacMoveNormal
	}

	if len(mt.Entries) >= mt.MaxEntries {
		mt.evictOldest()
	}

	encapMAC := generateEncapMAC(systemMAC)

	mt.Entries[mac] = &MacEntry{
		MACAddress: mac,
		PortID:     portID,
		VLAN:       vlan,
		MoveCount:  0,
		State:      MacMoveNormal,
		LastSeen:   time.Now(),
		FirstSeen:  time.Now(),
		EncapMAC:   encapMAC,
	}

	return MacMoveNormal
}

func (mt *MacTable) evictOldest() {
	var oldestKey string
	var oldestTime time.Time

	for k, v := range mt.Entries {
		if v.State != MacMoveBlocked {
			if oldestKey == "" || v.LastSeen.Before(oldestTime) {
				oldestKey = k
				oldestTime = v.LastSeen
			}
		}
	}

	if oldestKey != "" {
		delete(mt.Entries, oldestKey)
	}
}

func (mt *MacTable) RemoveMAC(mac string) {
	delete(mt.Entries, mac)
}

func (mt *MacTable) GetEntry(mac string) *MacEntry {
	return mt.Entries[mac]
}

func (mt *MacTable) GetDriftCount() int {
	count := 0
	for _, entry := range mt.Entries {
		if entry.State == MacMoveDrift {
			count++
		}
	}
	return count
}

func (mt *MacTable) GetBlockedCount() int {
	count := 0
	for _, entry := range mt.Entries {
		if entry.State == MacMoveBlocked {
			count++
		}
	}
	return count
}

func (mt *MacTable) Cleanup(window time.Duration) {
	threshold := time.Now().Add(-window)
	for k, v := range mt.Entries {
		if v.LastSeen.Before(threshold) && v.State != MacMoveBlocked {
			delete(mt.Entries, k)
		}
	}
}

func (s *Switch) runMacCleanupLoop(wg *sync.WaitGroup) {
	defer wg.Done()

	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-s.stopChan:
			return
		case <-ticker.C:
			s.mu.Lock()
			if s.MacTable != nil {
				s.MacTable.Cleanup(5 * time.Minute)
			}
			s.mu.Unlock()
		}
	}
}

func (s *Switch) runMacSimulateLoop(wg *sync.WaitGroup) {
	defer wg.Done()

	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	macs := []string{
		"aa:bb:cc:00:01:01",
		"aa:bb:cc:00:01:02",
		"aa:bb:cc:00:02:01",
		"aa:bb:cc:00:02:02",
		"aa:bb:cc:00:03:01",
		"aa:bb:cc:00:03:02",
		"aa:bb:cc:00:04:01",
		"aa:bb:cc:00:04:02",
	}

	portIDs := make([]string, 0)
	for k := range s.Ports {
		portIDs = append(portIDs, k)
	}

	driftMAC := "aa:bb:cc:ff:00:01"

	seq := 0

	for {
		select {
		case <-s.stopChan:
			return
		case <-ticker.C:
			s.mu.Lock()
			if s.MacTable != nil {
				for i, mac := range macs {
					portIdx := i % len(portIDs)
					s.MacTable.LearnMAC(mac, portIDs[portIdx], 100, s.SystemMAC)
				}

				driftPort := portIDs[seq%len(portIDs)]
				s.MacTable.LearnMAC(driftMAC, driftPort, 100, s.SystemMAC)
				seq++
			}
			s.mu.Unlock()
		}
	}
}

func (mt *MacTable) GetAllEntries() []MacEntry {
	entries := make([]MacEntry, 0, len(mt.Entries))
	for _, v := range mt.Entries {
		entries = append(entries, *v)
	}
	return entries
}

type MacSyncMessage struct {
	SourceSwitch string     `json:"source_switch"`
	Entries      []MacEntry `json:"entries"`
	Timestamp    time.Time  `json:"timestamp"`
}

func (s *Switch) SyncMacTableFromPeer(msg MacSyncMessage) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.MacTable == nil {
		return
	}

	for _, peerEntry := range msg.Entries {
		if localEntry, exists := s.MacTable.Entries[peerEntry.MACAddress]; exists {
			if localEntry.State == MacMoveBlocked {
				continue
			}
			if peerEntry.State == MacMoveBlocked {
				localEntry.State = MacMoveBlocked
				localEntry.MoveCount = peerEntry.MoveCount
				continue
			}
		}
	}
}

var _ = sync.Mutex{}

func generateEncapMAC(systemMAC string) string {
	parts := strings.Split(systemMAC, ":")
	if len(parts) == 6 {
		return fmt.Sprintf("02:00:00:%s:%s:%s", parts[3], parts[4], parts[5])
	}
	if len(systemMAC) >= 20 {
		return fmt.Sprintf("02:00:00:%s:%s:%s",
			systemMAC[12:14], systemMAC[15:17], systemMAC[18:20])
	}
	return "02:00:00:00:00:00"
}
