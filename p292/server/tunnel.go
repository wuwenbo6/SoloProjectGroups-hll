package main

import (
	"fmt"
	"sync"
	"time"
)

type TunnelManager struct {
	mu      sync.Mutex
	tunnels map[string]*TunnelState
}

func NewTunnelManager() *TunnelManager {
	return &TunnelManager{
		tunnels: make(map[string]*TunnelState),
	}
}

func (tm *TunnelManager) CreateHandoverTunnel(mnID, oldMAG, newMAG, oldTech, newTech string) *TunnelState {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	if existing, ok := tm.tunnels[mnID]; ok {
		if existing.Status == "active" {
			existing.BufferedPkts += simulateBufferedPackets()
			return existing
		}
	}

	tunnel := &TunnelState{
		MNID:         mnID,
		OldMAG:       oldMAG,
		NewMAG:       newMAG,
		OldTech:      oldTech,
		NewTech:      newTech,
		Status:       "active",
		BufferedPkts: simulateBufferedPackets(),
		CreatedAt:    time.Now(),
		ExpiresAt:    time.Now().Add(10 * time.Second),
	}
	tm.tunnels[mnID] = tunnel
	return tunnel
}

func (tm *TunnelManager) CompleteHandover(mnID string) {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	if tunnel, ok := tm.tunnels[mnID]; ok {
		tunnel.Status = "completed"
	}
}

func (tm *TunnelManager) GetAll() []TunnelState {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	now := time.Now()
	result := make([]TunnelState, 0)
	for key, tunnel := range tm.tunnels {
		if tunnel.Status == "active" && now.After(tunnel.ExpiresAt) {
			tunnel.Status = "expired"
		}
		result = append(result, *tunnel)
		if tunnel.Status == "completed" || tunnel.Status == "expired" {
			delete(tm.tunnels, key)
		}
	}
	return result
}

func simulateBufferedPackets() int {
	return 3 + int(time.Now().UnixNano()%8)
}

func tunnelSummary(tunnel *TunnelState) string {
	return fmt.Sprintf("bidirectional tunnel %s<->%s, %d buffered packets forwarded to both MAGs",
		tunnel.OldMAG, tunnel.NewMAG, tunnel.BufferedPkts)
}
