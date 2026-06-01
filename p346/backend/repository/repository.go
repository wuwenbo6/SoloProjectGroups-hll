package repository

import (
	"sync"
	"tacacs-simulator/model"
	"time"

	"github.com/google/uuid"
)

type Repository struct {
	mu           sync.RWMutex
	users        map[string]*model.User
	policies     map[string]*model.AuthPolicy
	sessions     map[uint32]*model.TacacsSession
	packets      []*model.PacketRecord
	config       *model.SystemConfig
	acctSeqNos   map[uint32]uint8
}

func NewRepository() *Repository {
	r := &Repository{
		users:      make(map[string]*model.User),
		policies:   make(map[string]*model.AuthPolicy),
		sessions:   make(map[uint32]*model.TacacsSession),
		packets:    make([]*model.PacketRecord, 0),
		acctSeqNos: make(map[uint32]uint8),
		config: &model.SystemConfig{
			SharedSecret: "tacacs_secret",
			UpdatedAt:    time.Now(),
		},
	}

	r.initDefaultData()
	return r
}

func (r *Repository) initDefaultData() {
	admin := &model.User{
		ID:             uuid.New().String(),
		Username:       "admin",
		Password:       "admin123",
		PrivilegeLevel: 15,
		CreatedAt:      time.Now(),
	}
	r.users[admin.Username] = admin

	user1 := &model.User{
		ID:             uuid.New().String(),
		Username:       "user",
		Password:       "user123",
		PrivilegeLevel: 1,
		CreatedAt:      time.Now(),
	}
	r.users[user1.Username] = user1

	defaultPolicies := []*model.AuthPolicy{
		{
			ID:             uuid.New().String(),
			Username:       "admin",
			CommandPattern: ".*",
			Allowed:        true,
			Priority:       100,
			CreatedAt:      time.Now(),
		},
		{
			ID:             uuid.New().String(),
			Username:       "user",
			CommandPattern: "^show.*",
			Allowed:        true,
			Priority:       10,
			CreatedAt:      time.Now(),
		},
		{
			ID:             uuid.New().String(),
			Username:       "user",
			CommandPattern: "^configure.*",
			Allowed:        false,
			Priority:       20,
			CreatedAt:      time.Now(),
		},
		{
			ID:             uuid.New().String(),
			Username:       "user",
			CommandPattern: "^enable.*",
			Allowed:        false,
			Priority:       30,
			CreatedAt:      time.Now(),
		},
	}

	for _, p := range defaultPolicies {
		r.policies[p.ID] = p
	}
}

func (r *Repository) GetSharedSecret() string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.config.SharedSecret
}

func (r *Repository) SetSharedSecret(secret string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.config.SharedSecret = secret
	r.config.UpdatedAt = time.Now()
}

func (r *Repository) GetConfig() *model.SystemConfig {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return &model.SystemConfig{
		SharedSecret: r.config.SharedSecret,
		UpdatedAt:    r.config.UpdatedAt,
	}
}

func (r *Repository) GetUser(username string) (*model.User, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	user, exists := r.users[username]
	if !exists {
		return nil, false
	}
	copy := *user
	return &copy, true
}

func (r *Repository) GetAllUsers() []*model.User {
	r.mu.RLock()
	defer r.mu.RUnlock()
	users := make([]*model.User, 0, len(r.users))
	for _, u := range r.users {
		copy := *u
		users = append(users, &copy)
	}
	return users
}

func (r *Repository) AddUser(user *model.User) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if user.ID == "" {
		user.ID = uuid.New().String()
	}
	user.CreatedAt = time.Now()
	r.users[user.Username] = user
}

func (r *Repository) UpdateUser(username string, user *model.User) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	_, exists := r.users[username]
	if !exists {
		return false
	}
	if username != user.Username {
		delete(r.users, username)
	}
	user.ID = r.users[username].ID
	user.CreatedAt = r.users[username].CreatedAt
	r.users[user.Username] = user
	return true
}

func (r *Repository) DeleteUser(username string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	_, exists := r.users[username]
	if !exists {
		return false
	}
	delete(r.users, username)
	return true
}

func (r *Repository) GetAllPolicies() []*model.AuthPolicy {
	r.mu.RLock()
	defer r.mu.RUnlock()
	policies := make([]*model.AuthPolicy, 0, len(r.policies))
	for _, p := range r.policies {
		copy := *p
		policies = append(policies, &copy)
	}
	return policies
}

func (r *Repository) GetPoliciesForUser(username string) []*model.AuthPolicy {
	r.mu.RLock()
	defer r.mu.RUnlock()
	policies := make([]*model.AuthPolicy, 0)
	for _, p := range r.policies {
		if p.Username == username || p.Username == "*" {
			copy := *p
			policies = append(policies, &copy)
		}
	}
	return policies
}

func (r *Repository) AddPolicy(policy *model.AuthPolicy) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if policy.ID == "" {
		policy.ID = uuid.New().String()
	}
	policy.CreatedAt = time.Now()
	r.policies[policy.ID] = policy
}

func (r *Repository) UpdatePolicy(id string, policy *model.AuthPolicy) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	_, exists := r.policies[id]
	if !exists {
		return false
	}
	policy.ID = id
	policy.CreatedAt = r.policies[id].CreatedAt
	r.policies[id] = policy
	return true
}

func (r *Repository) DeletePolicy(id string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	_, exists := r.policies[id]
	if !exists {
		return false
	}
	delete(r.policies, id)
	return true
}

func (r *Repository) CreateSession(sessionID uint32, username string) *model.TacacsSession {
	r.mu.Lock()
	defer r.mu.Unlock()
	session := &model.TacacsSession{
		ID:        uuid.New().String(),
		SessionID: sessionID,
		Username:  username,
		Status:    "active",
		StartTime: time.Now(),
	}
	r.sessions[sessionID] = session
	return session
}

func (r *Repository) GetSession(sessionID uint32) (*model.TacacsSession, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	session, exists := r.sessions[sessionID]
	if !exists {
		return nil, false
	}
	copy := *session
	return &copy, true
}

func (r *Repository) EndSession(sessionID uint32) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	session, exists := r.sessions[sessionID]
	if !exists {
		return false
	}
	session.Status = "ended"
	session.EndTime = time.Now()
	return true
}

func (r *Repository) GetAllSessions() []*model.TacacsSession {
	r.mu.RLock()
	defer r.mu.RUnlock()
	sessions := make([]*model.TacacsSession, 0, len(r.sessions))
	for _, s := range r.sessions {
		copy := *s
		sessions = append(sessions, &copy)
	}
	return sessions
}

func (r *Repository) RecordPacket(packet *model.PacketRecord) {
	r.mu.Lock()
	defer r.mu.Unlock()
	packet.ID = uuid.New().String()
	packet.Timestamp = time.Now()
	r.packets = append(r.packets, packet)
}

func (r *Repository) GetAllPackets() []*model.PacketRecord {
	r.mu.RLock()
	defer r.mu.RUnlock()
	packets := make([]*model.PacketRecord, len(r.packets))
	for i, p := range r.packets {
		copy := *p
		packets[i] = &copy
	}
	return packets
}

func (r *Repository) GetPacketsForSession(sessionID uint32) []*model.PacketRecord {
	r.mu.RLock()
	defer r.mu.RUnlock()
	packets := make([]*model.PacketRecord, 0)
	for _, p := range r.packets {
		if p.SessionID == sessionID {
			copy := *p
			packets = append(packets, &copy)
		}
	}
	return packets
}

func (r *Repository) GetAcctSeqNo(sessionID uint32) (uint8, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	seqNo, exists := r.acctSeqNos[sessionID]
	return seqNo, exists
}

func (r *Repository) ValidateAndSetAcctSeqNo(sessionID uint32, seqNo uint8) bool {
	r.mu.Lock()
	defer r.mu.Unlock()

	current, exists := r.acctSeqNos[sessionID]
	if !exists {
		if seqNo == 0 || seqNo == 1 {
			r.acctSeqNos[sessionID] = seqNo
			return true
		}
		return false
	}

	if seqNo <= current {
		return false
	}

	r.acctSeqNos[sessionID] = seqNo
	return true
}

func (r *Repository) GetNextAcctSeqNo(sessionID uint32) uint8 {
	r.mu.Lock()
	defer r.mu.Unlock()

	current, exists := r.acctSeqNos[sessionID]
	if !exists {
		r.acctSeqNos[sessionID] = 1
		return 1
	}

	next := current + 1
	if next == 0 {
		next = 1
	}
	r.acctSeqNos[sessionID] = next
	return next
}
