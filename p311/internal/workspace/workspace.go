package workspace

import (
	"os"
	"path/filepath"
)

type Manager struct {
	baseDir string
}

func NewManager(baseDir string) (*Manager, error) {
	if err := os.MkdirAll(baseDir, 0755); err != nil {
		return nil, err
	}

	return &Manager{baseDir: baseDir}, nil
}

func (m *Manager) GetPath(userID string) string {
	return filepath.Join(m.baseDir, userID)
}

func (m *Manager) Create(userID string) error {
	path := m.GetPath(userID)
	return os.MkdirAll(path, 0755)
}

func (m *Manager) Delete(userID string) error {
	path := m.GetPath(userID)
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return nil
	}
	return os.RemoveAll(path)
}

func (m *Manager) Exists(userID string) bool {
	path := m.GetPath(userID)
	_, err := os.Stat(path)
	return err == nil
}
