package pppoe

import (
	"fmt"
	"time"
)

type DiscoveryEvent struct {
	Step        string    `json:"step"`
	From        string    `json:"from"`
	To          string    `json:"to"`
	SessionID   string    `json:"session_id"`
	Timestamp   time.Time `json:"timestamp"`
	Description string    `json:"description"`
}

type DiscoveryResult struct {
	Session *Session
	Events  []*DiscoveryEvent
	Success bool
	Error   string
}

func SimulateDiscovery(sm *SessionManager, macAddress, serviceName string) *DiscoveryResult {
	result := &DiscoveryResult{}
	session := sm.CreateSession(macAddress, serviceName)
	result.Session = session

	result.Events = append(result.Events, &DiscoveryEvent{
		Step:        "PADI",
		From:        macAddress,
		To:          "broadcast",
		SessionID:   session.SessionID,
		Timestamp:   time.Now(),
		Description: fmt.Sprintf("Client %s sends PADI (PPPoE Active Discovery Initiation)", macAddress),
	})
	session.SetState(StatePADI)

	result.Events = append(result.Events, &DiscoveryEvent{
		Step:        "PADO",
		From:        "BRAS-SIM-01",
		To:          macAddress,
		SessionID:   session.SessionID,
		Timestamp:   time.Now(),
		Description: fmt.Sprintf("BRAS responds with PADO (PPPoE Active Discovery Offer) for service '%s'", serviceName),
	})
	session.SetState(StatePADO)

	result.Events = append(result.Events, &DiscoveryEvent{
		Step:        "PADR",
		From:        macAddress,
		To:          "BRAS-SIM-01",
		SessionID:   session.SessionID,
		Timestamp:   time.Now(),
		Description: fmt.Sprintf("Client %s sends PADR (PPPoE Active Discovery Request)", macAddress),
	})
	session.SetState(StatePADR)

	result.Events = append(result.Events, &DiscoveryEvent{
		Step:        "PADS",
		From:        "BRAS-SIM-01",
		To:          macAddress,
		SessionID:   session.SessionID,
		Timestamp:   time.Now(),
		Description: fmt.Sprintf("BRAS confirms with PADS (PPPoE Active Discovery Session-Confirmation), Session ID: %s", session.SessionID),
	})
	session.SetState(StatePADS)

	result.Events = append(result.Events, &DiscoveryEvent{
		Step:        "LCP",
		From:        macAddress,
		To:          "BRAS-SIM-01",
		SessionID:   session.SessionID,
		Timestamp:   time.Now(),
		Description: fmt.Sprintf("LCP negotiation: MRU=%d, Magic=%08x, Auth=PAP/CHAP", session.MRU, session.MagicNumber),
	})
	session.SetState(StateLCP)

	result.Success = true
	return result
}

type LCPConfig struct {
	MRU       int
	AuthProto string
}

func DefaultLCPConfig() *LCPConfig {
	return &LCPConfig{
		MRU:       1492,
		AuthProto: "PAP",
	}
}

func (s *Session) NegotiateLCP(config *LCPConfig) error {
	if config != nil {
		s.MRU = config.MRU
		s.AuthMethod = config.AuthProto
	}
	s.SetState(StateLCP)
	return nil
}
