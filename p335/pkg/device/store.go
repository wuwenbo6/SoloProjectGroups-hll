package device

import (
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type persistedQueue struct {
	ClientID  string             `json:"client_id"`
	Messages  []persistedMessage `json:"messages"`
	UpdatedAt string             `json:"updated_at"`
}

type persistedMessage struct {
	Topic     string `json:"topic"`
	Payload   string `json:"payload"`
	QoS       byte   `json:"qos"`
	Timestamp string `json:"timestamp"`
}

type Store struct {
	baseDir string
	mu      sync.Mutex
}

func NewStore(baseDir string) *Store {
	if baseDir == "" {
		baseDir = "data/queues"
	}
	return &Store{baseDir: baseDir}
}

func (s *Store) EnsureDir() error {
	return os.MkdirAll(s.baseDir, 0755)
}

func (s *Store) queuePath(clientID string) string {
	safe := safeFilename(clientID)
	return filepath.Join(s.baseDir, safe+".json")
}

func (s *Store) AppendMessage(clientID string, msg *QueuedMessage) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	pq, err := s.readQueue(clientID)
	if err != nil {
		pq = &persistedQueue{
			ClientID:  clientID,
			Messages:  []persistedMessage{},
			UpdatedAt: time.Now().Format(time.RFC3339),
		}
	}

	pq.Messages = append(pq.Messages, persistedMessage{
		Topic:     msg.Topic,
		Payload:   string(msg.Payload),
		QoS:       msg.QoS,
		Timestamp: msg.Timestamp.Format(time.RFC3339),
	})
	pq.UpdatedAt = time.Now().Format(time.RFC3339)

	return s.writeQueue(clientID, pq)
}

func (s *Store) AppendMessages(clientID string, msgs []*QueuedMessage) error {
	if len(msgs) == 0 {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	pq, err := s.readQueue(clientID)
	if err != nil {
		pq = &persistedQueue{
			ClientID:  clientID,
			Messages:  []persistedMessage{},
			UpdatedAt: time.Now().Format(time.RFC3339),
		}
	}

	for _, msg := range msgs {
		pq.Messages = append(pq.Messages, persistedMessage{
			Topic:     msg.Topic,
			Payload:   string(msg.Payload),
			QoS:       msg.QoS,
			Timestamp: msg.Timestamp.Format(time.RFC3339),
		})
	}
	pq.UpdatedAt = time.Now().Format(time.RFC3339)

	return s.writeQueue(clientID, pq)
}

func (s *Store) LoadMessages(clientID string) ([]*QueuedMessage, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	pq, err := s.readQueue(clientID)
	if err != nil {
		return nil, err
	}

	msgs := make([]*QueuedMessage, 0, len(pq.Messages))
	for _, pm := range pq.Messages {
		ts, _ := time.Parse(time.RFC3339, pm.Timestamp)
		msgs = append(msgs, &QueuedMessage{
			Topic:     pm.Topic,
			Payload:   []byte(pm.Payload),
			QoS:       pm.QoS,
			Timestamp: ts,
		})
	}
	return msgs, nil
}

func (s *Store) DeleteQueue(clientID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	path := s.queuePath(clientID)
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return nil
	}
	return os.Remove(path)
}

func (s *Store) LoadAllQueues() (map[string][]*QueuedMessage, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	result := make(map[string][]*QueuedMessage)
	entries, err := os.ReadDir(s.baseDir)
	if err != nil {
		if os.IsNotExist(err) {
			return result, nil
		}
		return nil, err
	}

	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
			continue
		}
		path := filepath.Join(s.baseDir, entry.Name())
		data, err := os.ReadFile(path)
		if err != nil {
			log.Printf("Failed to read queue file %s: %v", path, err)
			continue
		}
		var pq persistedQueue
		if err := json.Unmarshal(data, &pq); err != nil {
			log.Printf("Failed to parse queue file %s: %v", path, err)
			continue
		}
		msgs := make([]*QueuedMessage, 0, len(pq.Messages))
		for _, pm := range pq.Messages {
			ts, _ := time.Parse(time.RFC3339, pm.Timestamp)
			msgs = append(msgs, &QueuedMessage{
				Topic:     pm.Topic,
				Payload:   []byte(pm.Payload),
				QoS:       pm.QoS,
				Timestamp: ts,
			})
		}
		result[pq.ClientID] = msgs
	}
	return result, nil
}

func (s *Store) readQueue(clientID string) (*persistedQueue, error) {
	path := s.queuePath(clientID)
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var pq persistedQueue
	if err := json.Unmarshal(data, &pq); err != nil {
		return nil, err
	}
	return &pq, nil
}

func (s *Store) writeQueue(clientID string, pq *persistedQueue) error {
	if err := s.EnsureDir(); err != nil {
		return err
	}
	data, err := json.MarshalIndent(pq, "", "  ")
	if err != nil {
		return err
	}
	path := s.queuePath(clientID)
	tmpPath := path + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0644); err != nil {
		return err
	}
	return os.Rename(tmpPath, path)
}

func safeFilename(id string) string {
	result := make([]byte, 0, len(id))
	for i := 0; i < len(id); i++ {
		c := id[i]
		if (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-' || c == '_' {
			result = append(result, c)
		} else {
			result = append(result, '_')
		}
	}
	return string(result)
}
