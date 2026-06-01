package database

import (
	"os"
	"path/filepath"
	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

type StreamStatus string

const (
	StatusStopped StreamStatus = "stopped"
	StatusStarting StreamStatus = "starting"
	StatusRunning  StreamStatus = "running"
	StatusError    StreamStatus = "error"
)

type Stream struct {
	ID          string       `gorm:"primaryKey" json:"id"`
	Name        string       `json:"name"`
	RTSPURL     string       `json:"rtsp_url"`
	Enabled     bool         `json:"enabled"`
	Status      StreamStatus `json:"status"`
	ErrorMsg    string       `json:"error_msg,omitempty"`
	ViewerCount int          `json:"viewer_count"`
	CreatedAt   time.Time    `json:"created_at"`
	UpdatedAt   time.Time    `json:"updated_at"`
	LastRestart time.Time    `json:"last_restart,omitempty"`
	RestartCount int         `json:"restart_count"`
}

type StreamLog struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	StreamID  string    `json:"stream_id"`
	Message   string    `json:"message"`
	Level     string    `json:"level"`
	CreatedAt time.Time `json:"created_at"`
}

type Recording struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	StreamID  string    `json:"stream_id" gorm:"index"`
	FileName  string    `json:"file_name"`
	FilePath  string    `json:"file_path"`
	FileSize  int64     `json:"file_size"`
	Duration  float64   `json:"duration"`
	StartTime time.Time `json:"start_time" gorm:"index"`
	EndTime   time.Time `json:"end_time"`
	CreatedAt time.Time `json:"created_at"`
}

type Snapshot struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	StreamID  string    `json:"stream_id" gorm:"index"`
	FileName  string    `json:"file_name"`
	FilePath  string    `json:"file_path"`
	FileSize  int64     `json:"file_size"`
	Width     int       `json:"width"`
	Height    int       `json:"height"`
	CreatedAt time.Time `json:"created_at" gorm:"index"`
}

type DB struct {
	*gorm.DB
}

func New(dbPath string) (*DB, error) {
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, err
	}

	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{})
	if err != nil {
		return nil, err
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}
	sqlDB.SetMaxOpenConns(1)

	if err := db.AutoMigrate(&Stream{}, &StreamLog{}, &Recording{}, &Snapshot{}); err != nil {
		return nil, err
	}

	return &DB{db}, nil
}

func (db *DB) CreateStream(stream *Stream) error {
	return db.Create(stream).Error
}

func (db *DB) GetStream(id string) (*Stream, error) {
	var stream Stream
	err := db.First(&stream, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &stream, nil
}

func (db *DB) GetAllStreams() ([]Stream, error) {
	var streams []Stream
	err := db.Find(&streams).Error
	return streams, err
}

func (db *DB) UpdateStreamStatus(id string, status StreamStatus, errorMsg ...string) error {
	updates := map[string]interface{}{
		"status":     status,
		"updated_at": time.Now(),
	}
	if len(errorMsg) > 0 {
		updates["error_msg"] = errorMsg[0]
	}
	return db.Model(&Stream{}).Where("id = ?", id).Updates(updates).Error
}

func (db *DB) UpdateViewerCount(id string, count int) error {
	return db.Model(&Stream{}).Where("id = ?", id).Update("viewer_count", count).Error
}

func (db *DB) IncrementRestartCount(id string) error {
	return db.Model(&Stream{}).Where("id = ?", id).Updates(map[string]interface{}{
		"restart_count": gorm.Expr("restart_count + 1"),
		"last_restart":  time.Now(),
	}).Error
}

func (db *DB) AddLog(streamID, message, level string) error {
	return db.Create(&StreamLog{
		StreamID: streamID,
		Message:  message,
		Level:    level,
	}).Error
}

func (db *DB) GetStreamLogs(streamID string, limit int) ([]StreamLog, error) {
	var logs []StreamLog
	err := db.Where("stream_id = ?", streamID).Order("created_at DESC").Limit(limit).Find(&logs).Error
	return logs, err
}

func (db *DB) CreateRecording(rec *Recording) error {
	return db.Create(rec).Error
}

func (db *DB) GetRecordings(streamID string, offset, limit int) ([]Recording, int64, error) {
	var recordings []Recording
	var total int64

	query := db.Model(&Recording{})
	if streamID != "" {
		query = query.Where("stream_id = ?", streamID)
	}

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	err := query.Order("start_time DESC").Offset(offset).Limit(limit).Find(&recordings).Error
	return recordings, total, err
}

func (db *DB) GetRecording(id uint) (*Recording, error) {
	var rec Recording
	err := db.First(&rec, id).Error
	if err != nil {
		return nil, err
	}
	return &rec, nil
}

func (db *DB) DeleteRecording(id uint) error {
	return db.Delete(&Recording{}, id).Error
}

func (db *DB) CreateSnapshot(snap *Snapshot) error {
	return db.Create(snap).Error
}

func (db *DB) GetSnapshots(streamID string, offset, limit int) ([]Snapshot, int64, error) {
	var snapshots []Snapshot
	var total int64

	query := db.Model(&Snapshot{})
	if streamID != "" {
		query = query.Where("stream_id = ?", streamID)
	}

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	err := query.Order("created_at DESC").Offset(offset).Limit(limit).Find(&snapshots).Error
	return snapshots, total, err
}

func (db *DB) GetSnapshot(id uint) (*Snapshot, error) {
	var snap Snapshot
	err := db.First(&snap, id).Error
	if err != nil {
		return nil, err
	}
	return &snap, nil
}

func (db *DB) DeleteSnapshot(id uint) error {
	return db.Delete(&Snapshot{}, id).Error
}
