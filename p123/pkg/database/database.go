package database

import (
	"database/sql"
	"os"
	"path/filepath"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

type Database struct {
	db *sql.DB
}

type Session struct {
	ID          string
	UserID      string
	UserName    string
	IsController bool
	ConnectedAt time.Time
	LastActive  time.Time
}

type Recording struct {
	ID         string
	SessionID  string
	StartTime  time.Time
	EndTime    time.Time
	FilePath   string
	FileSize   int64
	Resolution string
}

func New(dbPath string) (*Database, error) {
	if err := os.MkdirAll(filepath.Dir(dbPath), 0755); err != nil {
		return nil, err
	}

	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return nil, err
	}

	d := &Database{db: db}
	if err := d.initSchema(); err != nil {
		return nil, err
	}

	return d, nil
}

func (d *Database) initSchema() error {
	schema := `
	CREATE TABLE IF NOT EXISTS sessions (
		id TEXT PRIMARY KEY,
		user_id TEXT,
		user_name TEXT,
		is_controller BOOLEAN,
		connected_at DATETIME,
		last_active DATETIME
	);

	CREATE TABLE IF NOT EXISTS recordings (
		id TEXT PRIMARY KEY,
		session_id TEXT,
		start_time DATETIME,
		end_time DATETIME,
		file_path TEXT,
		file_size INTEGER,
		resolution TEXT,
		FOREIGN KEY(session_id) REFERENCES sessions(id)
	);

	CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(last_active);
	CREATE INDEX IF NOT EXISTS idx_recordings_session ON recordings(session_id);
	`

	_, err := d.db.Exec(schema)
	return err
}

func (d *Database) AddSession(s *Session) error {
	_, err := d.db.Exec(`
		INSERT INTO sessions (id, user_id, user_name, is_controller, connected_at, last_active)
		VALUES (?, ?, ?, ?, ?, ?)
	`, s.ID, s.UserID, s.UserName, s.IsController, s.ConnectedAt, s.LastActive)
	return err
}

func (d *Database) UpdateSessionActive(sessionID string) error {
	_, err := d.db.Exec(`
		UPDATE sessions SET last_active = ? WHERE id = ?
	`, time.Now(), sessionID)
	return err
}

func (d *Database) SetController(sessionID string, isController bool) error {
	_, err := d.db.Exec(`
		UPDATE sessions SET is_controller = ? WHERE id = ?
	`, isController, sessionID)
	return err
}

func (d *Database) RemoveSession(sessionID string) error {
	_, err := d.db.Exec("DELETE FROM sessions WHERE id = ?", sessionID)
	return err
}

func (d *Database) GetActiveSessions() ([]*Session, error) {
	rows, err := d.db.Query(`
		SELECT id, user_id, user_name, is_controller, connected_at, last_active
		FROM sessions ORDER BY connected_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sessions []*Session
	for rows.Next() {
		s := &Session{}
		err := rows.Scan(&s.ID, &s.UserID, &s.UserName, &s.IsController, &s.ConnectedAt, &s.LastActive)
		if err != nil {
			return nil, err
		}
		sessions = append(sessions, s)
	}
	return sessions, nil
}

func (d *Database) GetControllerSession() (*Session, error) {
	var s Session
	err := d.db.QueryRow(`
		SELECT id, user_id, user_name, is_controller, connected_at, last_active
		FROM sessions WHERE is_controller = 1 LIMIT 1
	`).Scan(&s.ID, &s.UserID, &s.UserName, &s.IsController, &s.ConnectedAt, &s.LastActive)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &s, err
}

func (d *Database) AddRecording(r *Recording) error {
	_, err := d.db.Exec(`
		INSERT INTO recordings (id, session_id, start_time, end_time, file_path, file_size, resolution)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, r.ID, r.SessionID, r.StartTime, r.EndTime, r.FilePath, r.FileSize, r.Resolution)
	return err
}

func (d *Database) GetRecordings() ([]*Recording, error) {
	rows, err := d.db.Query(`
		SELECT id, session_id, start_time, end_time, file_path, file_size, resolution
		FROM recordings ORDER BY start_time DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var recordings []*Recording
	for rows.Next() {
		r := &Recording{}
		err := rows.Scan(&r.ID, &r.SessionID, &r.StartTime, &r.EndTime, &r.FilePath, &r.FileSize, &r.Resolution)
		if err != nil {
			return nil, err
		}
		recordings = append(recordings, r)
	}
	return recordings, nil
}

func (d *Database) CleanupSessions(timeout time.Duration) error {
	cutoff := time.Now().Add(-timeout)
	_, err := d.db.Exec("DELETE FROM sessions WHERE last_active < ?", cutoff)
	return err
}

func (d *Database) Close() error {
	return d.db.Close()
}
