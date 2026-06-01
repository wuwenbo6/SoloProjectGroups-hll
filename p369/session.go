package main

import (
	"encoding/binary"
	"fmt"
	"sync"
	"time"
)

type SessionStatus string

const (
	StatusActive       SessionStatus = "active"
	StatusDisconnected SessionStatus = "disconnected"
)

type Session struct {
	SessionID      string        `json:"session_id"`
	UserName       string        `json:"user_name"`
	NASIP          string        `json:"nas_ip"`
	NASPort        uint32        `json:"nas_port"`
	FramedIP       string        `json:"framed_ip"`
	BandwidthUp    uint32        `json:"bandwidth_up"`
	BandwidthDown  uint32        `json:"bandwidth_down"`
	SessionTimeout uint32        `json:"session_timeout"`
	FilterID       string        `json:"filter_id"`
	StartTime      time.Time     `json:"start_time"`
	Status         SessionStatus `json:"status"`
}

type SessionStore struct {
	mu       sync.RWMutex
	sessions map[string]*Session
}

func NewSessionStore() *SessionStore {
	return &SessionStore{
		sessions: make(map[string]*Session),
	}
}

func (s *SessionStore) Add(session *Session) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sessions[session.SessionID] = session
}

func (s *SessionStore) Get(sessionID string) (*Session, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	session, ok := s.sessions[sessionID]
	if !ok {
		return nil, false
	}
	return session, true
}

func (s *SessionStore) GetByUser(username string) []*Session {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var result []*Session
	for _, session := range s.sessions {
		if session.UserName == username {
			result = append(result, session)
		}
	}
	return result
}

func (s *SessionStore) GetBySessionIDAndUser(sessionID, username string) (*Session, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	session, ok := s.sessions[sessionID]
	if !ok {
		return nil, false
	}
	if username != "" && session.UserName != username {
		return nil, false
	}
	return session, true
}

func (s *SessionStore) List() []*Session {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]*Session, 0, len(s.sessions))
	for _, session := range s.sessions {
		result = append(result, session)
	}
	return result
}

func (s *SessionStore) UpdateBandwidth(sessionID string, up, down uint32) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	session, ok := s.sessions[sessionID]
	if !ok {
		return false
	}
	session.BandwidthUp = up
	session.BandwidthDown = down
	return true
}

func (s *SessionStore) UpdateSessionTimeout(sessionID string, timeout uint32) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	session, ok := s.sessions[sessionID]
	if !ok {
		return false
	}
	session.SessionTimeout = timeout
	return true
}

func (s *SessionStore) UpdateFilterID(sessionID string, filterID string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	session, ok := s.sessions[sessionID]
	if !ok {
		return false
	}
	session.FilterID = filterID
	return true
}

func (s *SessionStore) Disconnect(sessionID string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	session, ok := s.sessions[sessionID]
	if !ok {
		return false
	}
	session.Status = StatusDisconnected
	return true
}

func (s *SessionStore) Remove(sessionID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.sessions, sessionID)
}

func GenerateSessionID() string {
	var buf [4]byte
	binary.BigEndian.PutUint32(buf[:], uint32(time.Now().UnixNano()))
	return fmt.Sprintf("%08x", buf)
}
