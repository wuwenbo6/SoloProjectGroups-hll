package device

import (
	"log"
	"net"
	"sync"
	"sync/atomic"
	"time"
)

type QueuedMessage struct {
	Topic     string
	Payload   []byte
	QoS       byte
	Timestamp time.Time
}

type TopicInfo struct {
	TopicID   uint16
	TopicName string
}

type DeviceInfo struct {
	ClientID      string
	Connected     bool
	Sleeping      bool
	LastSeen      time.Time
	Addr          net.Addr
	Subscriptions []string
}

type topicEntry struct {
	TopicID   uint16
	TopicName string
	UpdatedAt time.Time
}

type Manager struct {
	topicMap     map[string]*topicEntry
	reverseTopic map[uint16]*topicEntry
	nextTopicID  uint16
	deviceSubs   map[string]map[string]bool
	msgQueue     map[string][]*QueuedMessage
	topicMutex   sync.RWMutex
	subMutex     sync.RWMutex
	queueMutex   sync.RWMutex
	maxQueueSize int
	store        *Store
	topicTTL     time.Duration
	statsDropped uint64
	statsQueued  uint64
}

func NewManager() *Manager {
	return &Manager{
		topicMap:     make(map[string]*topicEntry),
		reverseTopic: make(map[uint16]*topicEntry),
		nextTopicID:  1,
		deviceSubs:   make(map[string]map[string]bool),
		msgQueue:     make(map[string][]*QueuedMessage),
		maxQueueSize: 100,
		topicTTL:     0,
	}
}

func NewManagerWithStore(storeDir string, maxQueueSize int, topicTTL time.Duration) *Manager {
	store := NewStore(storeDir)
	if err := store.EnsureDir(); err != nil {
		log.Printf("Warning: failed to create store directory %s: %v", storeDir, err)
	}

	m := &Manager{
		topicMap:     make(map[string]*topicEntry),
		reverseTopic: make(map[uint16]*topicEntry),
		nextTopicID:  1,
		deviceSubs:   make(map[string]map[string]bool),
		msgQueue:     make(map[string][]*QueuedMessage),
		maxQueueSize: maxQueueSize,
		store:        store,
		topicTTL:     topicTTL,
	}

	m.restoreQueuesFromStore()
	return m
}

func (m *Manager) restoreQueuesFromStore() {
	if m.store == nil {
		return
	}
	allQueues, err := m.store.LoadAllQueues()
	if err != nil {
		log.Printf("Warning: failed to restore queues from store: %v", err)
		return
	}
	for clientID, msgs := range allQueues {
		if len(msgs) > 0 {
			m.msgQueue[clientID] = msgs
			log.Printf("Restored %d queued messages for client %s from store", len(msgs), clientID)
		}
	}
}

func (m *Manager) RegisterTopic(clientID, topicName string) uint16 {
	m.topicMutex.Lock()
	defer m.topicMutex.Unlock()
	if entry, ok := m.topicMap[topicName]; ok {
		entry.UpdatedAt = time.Now()
		return entry.TopicID
	}
	id := m.nextTopicID
	m.nextTopicID++
	if m.nextTopicID == 0 {
		m.nextTopicID = 1
	}
	entry := &topicEntry{
		TopicID:   id,
		TopicName: topicName,
		UpdatedAt: time.Now(),
	}
	m.topicMap[topicName] = entry
	m.reverseTopic[id] = entry
	log.Printf("Registered topic '%s' with ID %d", topicName, id)
	return id
}

func (m *Manager) GetTopicID(topicName string) uint16 {
	m.topicMutex.RLock()
	defer m.topicMutex.RUnlock()
	if entry, ok := m.topicMap[topicName]; ok {
		return entry.TopicID
	}
	return 0
}

func (m *Manager) GetTopicName(topicID uint16) string {
	m.topicMutex.RLock()
	defer m.topicMutex.RUnlock()
	if entry, ok := m.reverseTopic[topicID]; ok {
		return entry.TopicName
	}
	return ""
}

func (m *Manager) GetAllTopics() []TopicInfo {
	m.topicMutex.RLock()
	defer m.topicMutex.RUnlock()
	topics := make([]TopicInfo, 0, len(m.topicMap))
	for _, entry := range m.topicMap {
		topics = append(topics, TopicInfo{
			TopicID:   entry.TopicID,
			TopicName: entry.TopicName,
		})
	}
	return topics
}

func (m *Manager) ExpireTopics() int {
	if m.topicTTL <= 0 {
		return 0
	}
	m.topicMutex.Lock()
	defer m.topicMutex.Unlock()

	now := time.Now()
	expired := 0
	for name, entry := range m.topicMap {
		if now.Sub(entry.UpdatedAt) > m.topicTTL {
			if m.isTopicReferenced(entry.TopicID) {
				entry.UpdatedAt = now
				continue
			}
			delete(m.topicMap, name)
			delete(m.reverseTopic, entry.TopicID)
			expired++
			log.Printf("Expired topic '%s' (ID %d) after TTL %v", name, entry.TopicID, m.topicTTL)
		}
	}
	return expired
}

func (m *Manager) isTopicReferenced(topicID uint16) bool {
	m.subMutex.RLock()
	defer m.subMutex.RUnlock()
	for _, subs := range m.deviceSubs {
		for topicName := range subs {
			if entry, ok := m.topicMap[topicName]; ok && entry.TopicID == topicID {
				return true
			}
		}
	}
	return false
}

func (m *Manager) GetTopicTTL() time.Duration {
	return m.topicTTL
}

func (m *Manager) Subscribe(clientID, topicName string) {
	m.subMutex.Lock()
	defer m.subMutex.Unlock()
	if _, ok := m.deviceSubs[clientID]; !ok {
		m.deviceSubs[clientID] = make(map[string]bool)
	}
	m.deviceSubs[clientID][topicName] = true
	log.Printf("Device %s subscribed to '%s'", clientID, topicName)
}

func (m *Manager) Unsubscribe(clientID, topicName string) {
	m.subMutex.Lock()
	defer m.subMutex.Unlock()
	if subs, ok := m.deviceSubs[clientID]; ok {
		delete(subs, topicName)
		log.Printf("Device %s unsubscribed from '%s'", clientID, topicName)
	}
}

func (m *Manager) GetSubscriptions(clientID string) []string {
	m.subMutex.RLock()
	defer m.subMutex.RUnlock()
	subs, ok := m.deviceSubs[clientID]
	if !ok {
		return nil
	}
	topics := make([]string, 0, len(subs))
	for t := range subs {
		topics = append(topics, t)
	}
	return topics
}

func (m *Manager) GetAllSubscriptions() map[string][]string {
	m.subMutex.RLock()
	defer m.subMutex.RUnlock()
	result := make(map[string][]string)
	for clientID, subs := range m.deviceSubs {
		topics := make([]string, 0, len(subs))
		for t := range subs {
			topics = append(topics, t)
		}
		result[clientID] = topics
	}
	return result
}

func (m *Manager) IsSubscribed(clientID, topicName string) bool {
	m.subMutex.RLock()
	defer m.subMutex.RUnlock()
	subs, ok := m.deviceSubs[clientID]
	if !ok {
		return false
	}
	return subs[topicName]
}

func (m *Manager) RemoveClient(clientID string) {
	m.subMutex.Lock()
	delete(m.deviceSubs, clientID)
	m.subMutex.Unlock()

	m.queueMutex.Lock()
	delete(m.msgQueue, clientID)
	m.queueMutex.Unlock()

	if m.store != nil {
		if err := m.store.DeleteQueue(clientID); err != nil {
			log.Printf("Failed to delete queue file for %s: %v", clientID, err)
		}
	}
}

func (m *Manager) QueueMessage(clientID, topic string, payload []byte, qos byte) (dropped bool) {
	m.queueMutex.Lock()
	defer m.queueMutex.Unlock()

	if _, ok := m.msgQueue[clientID]; !ok {
		m.msgQueue[clientID] = make([]*QueuedMessage, 0, m.maxQueueSize)
	}

	msg := &QueuedMessage{
		Topic:     topic,
		Payload:   payload,
		QoS:       qos,
		Timestamp: time.Now(),
	}

	if len(m.msgQueue[clientID]) >= m.maxQueueSize {
		m.msgQueue[clientID] = m.msgQueue[clientID][1:]
		atomic.AddUint64(&m.statsDropped, 1)
		dropped = true
	}
	m.msgQueue[clientID] = append(m.msgQueue[clientID], msg)
	atomic.AddUint64(&m.statsQueued, 1)

	log.Printf("Queued message for %s: topic=%s, queue_size=%d", clientID, topic, len(m.msgQueue[clientID]))

	if m.store != nil {
		if err := m.store.AppendMessage(clientID, msg); err != nil {
			log.Printf("Failed to persist queue message for %s: %v", clientID, err)
		}
	}
	return dropped
}

func (m *Manager) GetQueuedMessages(clientID string) []*QueuedMessage {
	m.queueMutex.RLock()
	defer m.queueMutex.RUnlock()
	msgs, ok := m.msgQueue[clientID]
	if !ok {
		return nil
	}
	result := make([]*QueuedMessage, len(msgs))
	copy(result, msgs)
	return result
}

func (m *Manager) ClearQueuedMessages(clientID string) {
	m.queueMutex.Lock()
	delete(m.msgQueue, clientID)
	m.queueMutex.Unlock()

	if m.store != nil {
		if err := m.store.DeleteQueue(clientID); err != nil {
			log.Printf("Failed to delete queue file for %s: %v", clientID, err)
		}
	}
}

func (m *Manager) GetQueueSize(clientID string) int {
	m.queueMutex.RLock()
	defer m.queueMutex.RUnlock()
	return len(m.msgQueue[clientID])
}

func (m *Manager) GetAllQueueSizes() map[string]int {
	m.queueMutex.RLock()
	defer m.queueMutex.RUnlock()
	result := make(map[string]int)
	for clientID, msgs := range m.msgQueue {
		result[clientID] = len(msgs)
	}
	return result
}

func (m *Manager) GetDeviceInfo(clientID string, connected, sleeping bool, addr net.Addr, lastSeen time.Time) *DeviceInfo {
	subs := m.GetSubscriptions(clientID)
	return &DeviceInfo{
		ClientID:      clientID,
		Connected:     connected,
		Sleeping:      sleeping,
		LastSeen:      lastSeen,
		Addr:          addr,
		Subscriptions: subs,
	}
}

type QueueStats struct {
	MessagesQueued  uint64
	MessagesDropped uint64
}

func (m *Manager) GetQueueStats() QueueStats {
	return QueueStats{
		MessagesQueued:  atomic.LoadUint64(&m.statsQueued),
		MessagesDropped: atomic.LoadUint64(&m.statsDropped),
	}
}

func (m *Manager) ResetQueueStats() {
	atomic.StoreUint64(&m.statsQueued, 0)
	atomic.StoreUint64(&m.statsDropped, 0)
}
