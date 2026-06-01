package backup

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type BackupInfo struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	Name      string    `json:"name"`
	Size      int64     `json:"size"`
	CreatedAt time.Time `json:"created_at"`
}

type Storage interface {
	Save(ctx context.Context, userID, backupID string, reader io.Reader) (int64, error)
	Load(ctx context.Context, userID, backupID string) (io.ReadCloser, error)
	Delete(ctx context.Context, userID, backupID string) error
	List(ctx context.Context, userID string) ([]BackupInfo, error)
	Exists(ctx context.Context, userID, backupID string) (bool, error)
}

type LocalStorage struct {
	baseDir string
}

func NewLocalStorage(baseDir string) (*LocalStorage, error) {
	if err := os.MkdirAll(baseDir, 0755); err != nil {
		return nil, err
	}
	return &LocalStorage{baseDir: baseDir}, nil
}

func (ls *LocalStorage) getUserDir(userID string) string {
	return filepath.Join(ls.baseDir, userID)
}

func (ls *LocalStorage) getBackupPath(userID, backupID string) string {
	return filepath.Join(ls.getUserDir(userID), backupID+".tar.gz")
}

func (ls *LocalStorage) Save(ctx context.Context, userID, backupID string, reader io.Reader) (int64, error) {
	userDir := ls.getUserDir(userID)
	if err := os.MkdirAll(userDir, 0755); err != nil {
		return 0, err
	}

	path := ls.getBackupPath(userID, backupID)
	file, err := os.Create(path)
	if err != nil {
		return 0, err
	}
	defer file.Close()

	size, err := io.Copy(file, reader)
	if err != nil {
		os.Remove(path)
		return 0, err
	}

	return size, nil
}

func (ls *LocalStorage) Load(ctx context.Context, userID, backupID string) (io.ReadCloser, error) {
	path := ls.getBackupPath(userID, backupID)
	return os.Open(path)
}

func (ls *LocalStorage) Delete(ctx context.Context, userID, backupID string) error {
	path := ls.getBackupPath(userID, backupID)
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return nil
	}
	return os.Remove(path)
}

func (ls *LocalStorage) List(ctx context.Context, userID string) ([]BackupInfo, error) {
	userDir := ls.getUserDir(userID)
	if _, err := os.Stat(userDir); os.IsNotExist(err) {
		return []BackupInfo{}, nil
	}

	files, err := os.ReadDir(userDir)
	if err != nil {
		return nil, err
	}

	var backups []BackupInfo
	for _, f := range files {
		if strings.HasSuffix(f.Name(), ".tar.gz") {
			info, err := f.Info()
			if err != nil {
				continue
			}
			backups = append(backups, BackupInfo{
				ID:        strings.TrimSuffix(f.Name(), ".tar.gz"),
				UserID:    userID,
				Name:      strings.TrimSuffix(f.Name(), ".tar.gz"),
				Size:      info.Size(),
				CreatedAt: info.ModTime(),
			})
		}
	}
	return backups, nil
}

func (ls *LocalStorage) Exists(ctx context.Context, userID, backupID string) (bool, error) {
	path := ls.getBackupPath(userID, backupID)
	_, err := os.Stat(path)
	if err == nil {
		return true, nil
	}
	if os.IsNotExist(err) {
		return false, nil
	}
	return false, err
}

type Manager struct {
	storage      Storage
	enabled      bool
	maxBackups   int
	autoBackup   time.Duration
	stopAuto     chan struct{}
	workspaceMgr WorkspaceManager
}

type WorkspaceManager interface {
	GetPath(userID string) string
}

func NewManager(storage Storage, enabled bool, maxBackups int, autoBackupHours int, wm WorkspaceManager) *Manager {
	m := &Manager{
		storage:      storage,
		enabled:      enabled,
		maxBackups:   maxBackups,
		autoBackup:   time.Duration(autoBackupHours) * time.Hour,
		stopAuto:     make(chan struct{}),
		workspaceMgr: wm,
	}

	if enabled && autoBackupHours > 0 {
		go m.startAutoBackup()
	}

	return m
}

func (m *Manager) IsEnabled() bool {
	return m.enabled
}

func (m *Manager) startAutoBackup() {
	if m.autoBackup <= 0 {
		return
	}

	ticker := time.NewTicker(m.autoBackup)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
		case <-m.stopAuto:
			return
		}
	}
}

func (m *Manager) StopAutoBackup() {
	close(m.stopAuto)
}

func (m *Manager) CreateBackup(ctx context.Context, userID, name string) (*BackupInfo, error) {
	if !m.enabled {
		return nil, errors.New("backup is not enabled")
	}

	workspacePath := m.workspaceMgr.GetPath(userID)
	if _, err := os.Stat(workspacePath); os.IsNotExist(err) {
		return nil, errors.New("workspace does not exist")
	}

	backupID := generateBackupID()
	if name == "" {
		name = "backup-" + time.Now().Format("20060102-150405")
	}

	backups, err := m.storage.List(ctx, userID)
	if err != nil {
		return nil, err
	}

	if len(backups) >= m.maxBackups {
		oldest := backups[0]
		for _, b := range backups {
			if b.CreatedAt.Before(oldest.CreatedAt) {
				oldest = b
			}
		}
		m.DeleteBackup(ctx, userID, oldest.ID)
	}

	reader, writer := io.Pipe()
	go func() {
		defer writer.Close()
		if err := createTarGZ(writer, workspacePath); err != nil {
			writer.CloseWithError(err)
		}
	}()

	size, err := m.storage.Save(ctx, userID, backupID, reader)
	if err != nil {
		return nil, err
	}

	info := &BackupInfo{
		ID:        backupID,
		UserID:    userID,
		Name:      name,
		Size:      size,
		CreatedAt: time.Now(),
	}

	return info, nil
}

func (m *Manager) ListBackups(ctx context.Context, userID string) ([]BackupInfo, error) {
	if !m.enabled {
		return []BackupInfo{}, nil
	}

	return m.storage.List(ctx, userID)
}

func (m *Manager) DeleteBackup(ctx context.Context, userID, backupID string) error {
	if !m.enabled {
		return nil
	}

	return m.storage.Delete(ctx, userID, backupID)
}

func (m *Manager) RestoreBackup(ctx context.Context, userID, backupID string) error {
	if !m.enabled {
		return errors.New("backup is not enabled")
	}

	reader, err := m.storage.Load(ctx, userID, backupID)
	if err != nil {
		return err
	}
	defer reader.Close()

	workspacePath := m.workspaceMgr.GetPath(userID)

	if err := os.RemoveAll(workspacePath); err != nil {
		return err
	}

	if err := os.MkdirAll(workspacePath, 0755); err != nil {
		return err
	}

	return extractTarGZ(reader, workspacePath)
}

func (m *Manager) GetStorage() Storage {
	return m.storage
}

func createTarGZ(w io.Writer, sourceDir string) error {
	gzWriter := gzip.NewWriter(w)
	defer gzWriter.Close()

	tarWriter := tar.NewWriter(gzWriter)
	defer tarWriter.Close()

	sourceDir = filepath.Clean(sourceDir)

	return filepath.Walk(sourceDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		relPath, err := filepath.Rel(sourceDir, path)
		if err != nil {
			return err
		}

		if relPath == "." {
			return nil
		}

		header, err := tar.FileInfoHeader(info, "")
		if err != nil {
			return err
		}
		header.Name = relPath

		if info.IsDir() {
			header.Name += "/"
		}

		if err := tarWriter.WriteHeader(header); err != nil {
			return err
		}

		if !info.IsDir() {
			file, err := os.Open(path)
			if err != nil {
				return err
			}
			defer file.Close()

			_, err = io.Copy(tarWriter, file)
			return err
		}

		return nil
	})
}

func extractTarGZ(r io.Reader, targetDir string) error {
	gzReader, err := gzip.NewReader(r)
	if err != nil {
		return err
	}
	defer gzReader.Close()

	tarReader := tar.NewReader(gzReader)

	for {
		header, err := tarReader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}

		targetPath := filepath.Join(targetDir, header.Name)

		switch header.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(targetPath, 0755); err != nil {
				return err
			}
		case tar.TypeReg:
			if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
				return err
			}

			file, err := os.Create(targetPath)
			if err != nil {
				return err
			}

			if _, err := io.Copy(file, tarReader); err != nil {
				file.Close()
				return err
			}
			file.Close()

			if err := os.Chmod(targetPath, os.FileMode(header.Mode)); err != nil {
				return err
			}
		}
	}

	return nil
}

func generateBackupID() string {
	return fmt.Sprintf("bk-%s-%s", time.Now().Format("20060102150405"), randomString(6))
}

func randomString(n int) string {
	const letters = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, n)
	for i := range b {
		b[i] = letters[time.Now().UnixNano()%int64(len(letters))]
		time.Sleep(1 * time.Nanosecond)
	}
	return string(b)
}
