package grpcutil

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

type TestCase struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Address     string `json:"address"`
	TLS         bool   `json:"tls"`
	Method      string `json:"method"`
	RequestJson string `json:"requestJson"`
	Timeout     int    `json:"timeout"`
	CreatedAt   string `json:"createdAt"`
	UpdatedAt   string `json:"updatedAt"`
}

type TestCaseStore struct {
	mu   sync.RWMutex
	dir  string
	data map[string]*TestCase
}

var globalTestCaseStore *TestCaseStore

func InitTestCaseStore(dir string) error {
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create test case directory: %w", err)
	}
	store := &TestCaseStore{
		dir:  dir,
		data: make(map[string]*TestCase),
	}
	if err := store.loadAll(); err != nil {
		return fmt.Errorf("failed to load test cases: %w", err)
	}
	globalTestCaseStore = store
	return nil
}

func GetTestCaseStore() *TestCaseStore {
	return globalTestCaseStore
}

func (s *TestCaseStore) loadAll() error {
	entries, err := os.ReadDir(s.dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		path := filepath.Join(s.dir, entry.Name())
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		tc := &TestCase{}
		if err := json.Unmarshal(data, tc); err != nil {
			continue
		}
		s.data[tc.ID] = tc
	}
	return nil
}

func (s *TestCaseStore) Save(tc *TestCase) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().Format(time.RFC3339)
	if tc.ID == "" {
		tc.ID = fmt.Sprintf("%d", time.Now().UnixNano())
		tc.CreatedAt = now
	}
	tc.UpdatedAt = now

	data, err := json.MarshalIndent(tc, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal test case: %w", err)
	}

	path := filepath.Join(s.dir, tc.ID+".json")
	if err := os.WriteFile(path, data, 0644); err != nil {
		return fmt.Errorf("failed to write test case: %w", err)
	}

	s.data[tc.ID] = tc
	return nil
}

func (s *TestCaseStore) List() []*TestCase {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]*TestCase, 0, len(s.data))
	for _, tc := range s.data {
		result = append(result, tc)
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].UpdatedAt > result[j].UpdatedAt
	})
	return result
}

func (s *TestCaseStore) Get(id string) (*TestCase, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	tc, ok := s.data[id]
	if !ok {
		return nil, fmt.Errorf("test case not found: %s", id)
	}
	return tc, nil
}

func (s *TestCaseStore) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	path := filepath.Join(s.dir, id+".json")
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to delete test case: %w", err)
	}
	delete(s.data, id)
	return nil
}
