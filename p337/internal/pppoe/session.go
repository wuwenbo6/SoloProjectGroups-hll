package pppoe

import (
	"crypto/rand"
	"fmt"
	"sync"
	"time"
)

type SessionState int

const (
	StateIdle SessionState = iota
	StatePADI
	StatePADO
	StatePADR
	StatePADS
	StateLCP
	StateAuth
	StateIPCP
	StateUp
	StateDown
	StateTerminating
)

func (s SessionState) String() string {
	names := map[SessionState]string{
		StateIdle:        "IDLE",
		StatePADI:        "PADI_SENT",
		StatePADO:        "PADO_SENT",
		StatePADR:        "PADR_SENT",
		StatePADS:        "PADS_SENT",
		StateLCP:         "LCP_NEGOTIATION",
		StateAuth:        "AUTHENTICATING",
		StateIPCP:        "IPCP_NEGOTIATION",
		StateUp:          "SESSION_UP",
		StateDown:        "SESSION_DOWN",
		StateTerminating: "TERMINATING",
	}
	if name, ok := names[s]; ok {
		return name
	}
	return "UNKNOWN"
}

type Session struct {
	mu             sync.RWMutex
	SessionID      string       `json:"session_id"`
	MACAddress     string       `json:"mac_address"`
	ACName         string       `json:"ac_name"`
	ServiceName    string       `json:"service_name"`
	State          SessionState `json:"state"`
	Username       string       `json:"username,omitempty"`
	AuthMethod     string       `json:"auth_method,omitempty"`
	RemoteIP       string       `json:"remote_ip,omitempty"`
	AssignedVLAN   int          `json:"assigned_vlan,omitempty"`
	MRU            int          `json:"mru"`
	MagicNumber    uint32       `json:"magic_number"`
	CreatedAt      time.Time    `json:"created_at"`
	ConnectedAt    *time.Time   `json:"connected_at,omitempty"`
	LastActivityAt time.Time    `json:"last_activity_at"`
	BytesIn        int64        `json:"bytes_in"`
	BytesOut       int64        `json:"bytes_out"`
	PacketsIn      int64        `json:"packets_in"`
	PacketsOut     int64        `json:"packets_out"`
}

func (s *Session) SetState(state SessionState) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.State = state
	s.LastActivityAt = time.Now()
	if state == StateUp {
		now := time.Now()
		s.ConnectedAt = &now
	}
}

func (s *Session) GetState() SessionState {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.State
}

func (s *Session) UpdateStats(bytesIn, bytesOut, pktsIn, pktsOut int64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.BytesIn += bytesIn
	s.BytesOut += bytesOut
	s.PacketsIn += pktsIn
	s.PacketsOut += pktsOut
	s.LastActivityAt = time.Now()
}

type SessionSnapshot struct {
	SessionID      string
	MACAddress     string
	ACName         string
	ServiceName    string
	State          SessionState
	Username       string
	AuthMethod     string
	RemoteIP       string
	AssignedVLAN   int
	MRU            int
	MagicNumber    uint32
	CreatedAt      time.Time
	ConnectedAt    *time.Time
	LastActivityAt time.Time
	BytesIn        int64
	BytesOut       int64
	PacketsIn      int64
	PacketsOut     int64
}

func (s *Session) GetSnapshot() SessionSnapshot {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return SessionSnapshot{
		SessionID:      s.SessionID,
		MACAddress:     s.MACAddress,
		ACName:         s.ACName,
		ServiceName:    s.ServiceName,
		State:          s.State,
		Username:       s.Username,
		AuthMethod:     s.AuthMethod,
		RemoteIP:       s.RemoteIP,
		AssignedVLAN:   s.AssignedVLAN,
		MRU:            s.MRU,
		MagicNumber:    s.MagicNumber,
		CreatedAt:      s.CreatedAt,
		ConnectedAt:    s.ConnectedAt,
		LastActivityAt: s.LastActivityAt,
		BytesIn:        s.BytesIn,
		BytesOut:       s.BytesOut,
		PacketsIn:      s.PacketsIn,
		PacketsOut:     s.PacketsOut,
	}
}

type SessionManager struct {
	mu       sync.RWMutex
	sessions map[string]*Session
	counter  uint64
}

func NewSessionManager() *SessionManager {
	return &SessionManager{
		sessions: make(map[string]*Session),
	}
}

func (sm *SessionManager) generateSessionID() string {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	sm.counter++
	return fmt.Sprintf("PPPOE-%06d", sm.counter)
}

func (sm *SessionManager) CreateSession(macAddress, serviceName string) *Session {
	session := &Session{
		SessionID:      sm.generateSessionID(),
		MACAddress:     macAddress,
		ACName:         "BRAS-SIM-01",
		ServiceName:    serviceName,
		State:          StateIdle,
		MRU:            1492,
		MagicNumber:    generateMagicNumber(),
		CreatedAt:      time.Now(),
		LastActivityAt: time.Now(),
	}

	sm.mu.Lock()
	sm.sessions[session.SessionID] = session
	sm.mu.Unlock()

	return session
}

func (sm *SessionManager) GetSession(id string) (*Session, bool) {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	s, ok := sm.sessions[id]
	return s, ok
}

func (sm *SessionManager) ListSessions() []*Session {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	result := make([]*Session, 0, len(sm.sessions))
	for _, s := range sm.sessions {
		result = append(result, s)
	}
	return result
}

func (sm *SessionManager) RemoveSession(id string) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	delete(sm.sessions, id)
}

func (sm *SessionManager) SessionCount() int {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	return len(sm.sessions)
}

func (sm *SessionManager) ActiveSessionCount() int {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	count := 0
	for _, s := range sm.sessions {
		if s.GetState() == StateUp {
			count++
		}
	}
	return count
}

func generateMagicNumber() uint32 {
	b := make([]byte, 4)
	rand.Read(b)
	return uint32(b[0])<<24 | uint32(b[1])<<16 | uint32(b[2])<<8 | uint32(b[3])
}
