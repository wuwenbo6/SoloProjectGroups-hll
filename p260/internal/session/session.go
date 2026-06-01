package session

import (
	"fmt"
	"sync"
	"time"
)

type Policy struct {
	UploadSpeed   int64 `json:"upload_speed"`
	DownloadSpeed int64 `json:"download_speed"`
}

type Session struct {
	ID         string    `json:"id"`
	Username   string    `json:"username"`
	NASIP      string    `json:"nas_ip"`
	NASPort    string    `json:"nas_port"`
	FramedIP   string    `json:"framed_ip"`
	CallingStID  string    `json:"calling_station_id"`
	Policy     Policy    `json:"policy"`
	StartTime  time.Time `json:"start_time"`
	LastUpdate time.Time `json:"last_update"`
	Status     string    `json:"status"`
}

type Manager struct {
	sessions          map[string]*Session
	sessionByUserSID  map[string]*Session
	mu                sync.RWMutex
}

func buildUserSIDKey(username, sessionID string) string {
	return fmt.Sprintf("%s|%s", username, sessionID)
}

var defaultPolicy = Policy{
	UploadSpeed:   10 * 1024 * 1024,
	DownloadSpeed: 50 * 1024 * 1024,
}

func NewManager() *Manager {
	return &Manager{
		sessions:         make(map[string]*Session),
		sessionByUserSID: make(map[string]*Session),
	}
}

func (m *Manager) Add(session *Session) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if session.Policy.UploadSpeed == 0 && session.Policy.DownloadSpeed == 0 {
		session.Policy = defaultPolicy
	}

	m.sessions[session.ID] = session

	if session.Username != "" && session.ID != "" {
		key := buildUserSIDKey(session.Username, session.ID)
		m.sessionByUserSID[key] = session
	}
}

func (m *Manager) Get(id string) (*Session, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	s, ok := m.sessions[id]
	return s, ok
}

func (m *Manager) GetByUsername(username string) []*Session {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var result []*Session
	for _, s := range m.sessions {
		if s.Username == username && s.Status == "online" {
			result = append(result, s)
		}
	}
	return result
}

func (m *Manager) GetByUsernameAndSessionID(username, sessionID string) (*Session, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	key := buildUserSIDKey(username, sessionID)
	s, ok := m.sessionByUserSID[key]
	if !ok {
		return nil, false
	}
	return s, true
}

func (m *Manager) GetAll() []*Session {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var result []*Session
	for _, s := range m.sessions {
		result = append(result, s)
	}
	return result
}

func (m *Manager) GetOnline() []*Session {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var result []*Session
	for _, s := range m.sessions {
		if s.Status == "online" {
			result = append(result, s)
		}
	}
	return result
}

func (m *Manager) UpdatePolicy(id string, policy Policy) bool {
	m.mu.Lock()
	defer m.mu.Unlock()

	s, ok := m.sessions[id]
	if !ok {
		return false
	}
	s.Policy = policy
	s.LastUpdate = time.Now()
	return true
}

func (m *Manager) UpdateStatus(id string, status string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if s, ok := m.sessions[id]; ok {
		s.Status = status
		s.LastUpdate = time.Now()
	}
}

func (m *Manager) Remove(id string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if s, ok := m.sessions[id]; ok {
		if s.Username != "" {
			key := buildUserSIDKey(s.Username, id)
			delete(m.sessionByUserSID, key)
		}
	}

	delete(m.sessions, id)
}
