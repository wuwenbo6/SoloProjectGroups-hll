package session

import (
	"log"
	"sync"
	"time"
)

type Message struct {
	Topic     string
	Payload   []byte
	QoS       byte
	Timestamp time.Time
}

type WillMessage struct {
	Topic   string
	Payload []byte
	QoS     byte
	Retain  bool
}

type Subscription struct {
	TopicFilter string
	QoS         byte
}

type Session struct {
	ClientID       string
	Connected      bool
	ConnectedAt    time.Time
	LastSeen       time.Time
	Subscriptions  map[string]Subscription
	Inflight       map[uint16]Message
	MessageQueue   []Message
	CurrentAddr    string
	ConnectionID   string
	Will           *WillMessage
	KeepAlive      uint16
	Migrating      bool
	MigrateAt      time.Time
	MigrationStats MigrationStats
	Using0RTT      bool
}

type MigrationStats struct {
	Count           int
	LastDuration    time.Duration
	TotalDuration   time.Duration
	AvgDuration     time.Duration
	LastMigrateAt   time.Time
}

type Manager struct {
	sessions map[string]*Session
	mu       sync.RWMutex
	willChan chan WillMessage
}

func NewManager() *Manager {
	m := &Manager{
		sessions: make(map[string]*Session),
		willChan: make(chan WillMessage, 100),
	}
	go m.willMessageWorker()
	go m.keepAliveChecker()
	return m
}

func (m *Manager) WillChannel() <-chan WillMessage {
	return m.willChan
}

func (m *Manager) GetOrCreate(clientID string) *Session {
	m.mu.Lock()
	defer m.mu.Unlock()

	if s, ok := m.sessions[clientID]; ok {
		return s
	}

	s := &Session{
		ClientID:      clientID,
		Connected:     false,
		ConnectedAt:   time.Now(),
		LastSeen:      time.Now(),
		Subscriptions: make(map[string]Subscription),
		Inflight:      make(map[uint16]Message),
		MessageQueue:  make([]Message, 0),
	}
	m.sessions[clientID] = s
	return s
}

func (m *Manager) Get(clientID string) (*Session, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	s, ok := m.sessions[clientID]
	return s, ok
}

func (m *Manager) Remove(clientID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.sessions, clientID)
}

func (m *Manager) SetConnected(clientID string, connected bool, addr, connID string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if s, ok := m.sessions[clientID]; ok {
		s.Connected = connected
		s.LastSeen = time.Now()
		s.CurrentAddr = addr
		s.ConnectionID = connID
		if connected {
			s.ConnectedAt = time.Now()
			s.Migrating = false
		}
	}
}

func (m *Manager) SetWill(clientID string, will *WillMessage) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if s, ok := m.sessions[clientID]; ok {
		s.Will = will
	}
}

func (m *Manager) ClearWill(clientID string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if s, ok := m.sessions[clientID]; ok {
		s.Will = nil
	}
}

func (m *Manager) SetKeepAlive(clientID string, keepAlive uint16) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if s, ok := m.sessions[clientID]; ok {
		s.KeepAlive = keepAlive
		s.LastSeen = time.Now()
	}
}

func (m *Manager) StartMigration(clientID string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if s, ok := m.sessions[clientID]; ok {
		s.Migrating = true
		s.MigrateAt = time.Now()
		log.Printf("Client %s started migration, Will message suppressed", clientID)
	}
}

func (m *Manager) CompleteMigration(clientID string) time.Duration {
	m.mu.Lock()
	defer m.mu.Unlock()

	if s, ok := m.sessions[clientID]; ok {
		s.Migrating = false
		s.LastSeen = time.Now()
		
		if !s.MigrateAt.IsZero() {
			duration := time.Since(s.MigrateAt)
			s.MigrationStats.Count++
			s.MigrationStats.LastDuration = duration
			s.MigrationStats.TotalDuration += duration
			s.MigrationStats.AvgDuration = s.MigrationStats.TotalDuration / time.Duration(s.MigrationStats.Count)
			s.MigrationStats.LastMigrateAt = time.Now()
			
			log.Printf("Client %s migration completed in %v (count: %d, avg: %v), keepalive reset", 
				clientID, duration, s.MigrationStats.Count, s.MigrationStats.AvgDuration)
			return duration
		}
		
		log.Printf("Client %s migration completed, keepalive reset", clientID)
	}
	return 0
}

func (m *Manager) Set0RTTStatus(clientID string, using0RTT bool) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if s, ok := m.sessions[clientID]; ok {
		s.Using0RTT = using0RTT
		log.Printf("Client %s 0-RTT status: %v", clientID, using0RTT)
	}
}

func (m *Manager) GetMigrationStats(clientID string) (MigrationStats, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if s, ok := m.sessions[clientID]; ok {
		return s.MigrationStats, true
	}
	return MigrationStats{}, false
}

func (m *Manager) AddSubscription(clientID, topicFilter string, qos byte) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if s, ok := m.sessions[clientID]; ok {
		s.Subscriptions[topicFilter] = Subscription{
			TopicFilter: topicFilter,
			QoS:         qos,
		}
	}
}

func (m *Manager) RemoveSubscription(clientID, topicFilter string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if s, ok := m.sessions[clientID]; ok {
		delete(s.Subscriptions, topicFilter)
	}
}

func (m *Manager) GetSubscribers(topic string) []*Session {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var subscribers []*Session
	for _, s := range m.sessions {
		if !s.Connected {
			continue
		}
		for _, sub := range s.Subscriptions {
			if matchTopic(sub.TopicFilter, topic) {
				subscribers = append(subscribers, s)
				break
			}
		}
	}
	return subscribers
}

func (m *Manager) QueueMessage(clientID string, msg Message) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if s, ok := m.sessions[clientID]; ok {
		s.MessageQueue = append(s.MessageQueue, msg)
		if len(s.MessageQueue) > 1000 {
			s.MessageQueue = s.MessageQueue[1:]
		}
	}
}

func (m *Manager) GetAll() []*Session {
	m.mu.RLock()
	defer m.mu.RUnlock()

	sessions := make([]*Session, 0, len(m.sessions))
	for _, s := range m.sessions {
		sessions = append(sessions, s)
	}
	return sessions
}

func (m *Manager) UpdateLastSeen(clientID string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if s, ok := m.sessions[clientID]; ok {
		s.LastSeen = time.Now()
	}
}

func (m *Manager) willMessageWorker() {
	for will := range m.willChan {
		log.Printf("Will message triggered: %s -> %s", will.Topic, string(will.Payload))
		m.publishWill(will)
	}
}

func (m *Manager) publishWill(will WillMessage) {
	msg := Message{
		Topic:     will.Topic,
		Payload:   will.Payload,
		QoS:       will.QoS,
		Timestamp: time.Now(),
	}

	subscribers := m.GetSubscribers(will.Topic)
	for _, sub := range subscribers {
		m.QueueMessage(sub.ClientID, msg)
	}
}

func (m *Manager) keepAliveChecker() {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		m.checkKeepAliveAndWill()
	}
}

func (m *Manager) checkKeepAliveAndWill() {
	m.mu.Lock()
	defer m.mu.Unlock()

	now := time.Now()

	for clientID, s := range m.sessions {
		if !s.Connected {
			continue
		}

		if s.KeepAlive > 0 {
			timeout := time.Duration(s.KeepAlive)*time.Second + 5*time.Second
			if now.Sub(s.LastSeen) > timeout {
				log.Printf("Client %s keepalive timeout", clientID)

				if !s.Migrating && s.Will != nil {
					log.Printf("Client %s timeout, triggering Will message", clientID)
					m.willChan <- *s.Will
				}

				s.Connected = false
				continue
			}
		}
	}
}

func matchTopic(filter, topic string) bool {
	if filter == "#" {
		return true
	}
	if filter == topic {
		return true
	}

	filterParts := splitTopic(filter)
	topicParts := splitTopic(topic)

	for i := 0; i < len(filterParts); i++ {
		if filterParts[i] == "#" {
			return true
		}
		if i >= len(topicParts) {
			return false
		}
		if filterParts[i] != "+" && filterParts[i] != topicParts[i] {
			return false
		}
	}

	return len(filterParts) == len(topicParts)
}

func splitTopic(topic string) []string {
	var parts []string
	start := 0
	for i := 0; i < len(topic); i++ {
		if topic[i] == '/' {
			parts = append(parts, topic[start:i])
			start = i + 1
		}
	}
	if start < len(topic) {
		parts = append(parts, topic[start:])
	}
	return parts
}

func (s *Session) DequeueMessage() (Message, bool) {
	if len(s.MessageQueue) == 0 {
		return Message{}, false
	}
	msg := s.MessageQueue[0]
	s.MessageQueue = s.MessageQueue[1:]
	return msg, true
}

func (s *Session) PeekMessage() (Message, bool) {
	if len(s.MessageQueue) == 0 {
		return Message{}, false
	}
	return s.MessageQueue[0], true
}
