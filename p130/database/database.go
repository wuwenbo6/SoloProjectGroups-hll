package database

import (
	"database/sql"
	"fmt"
	"log"
	"time"

	_ "modernc.org/sqlite"
)

type SIPMessage struct {
	ID         int64     `json:"id"`
	CallID     string    `json:"call_id"`
	Method     string    `json:"method"`
	StatusCode int       `json:"status_code"`
	FromUser   string    `json:"from_user"`
	ToUser     string    `json:"to_user"`
	FromHost   string    `json:"from_host"`
	ToHost     string    `json:"to_host"`
	SourceIP   string    `json:"source_ip"`
	DestIP     string    `json:"dest_ip"`
	SourcePort int       `json:"source_port"`
	DestPort   int       `json:"dest_port"`
	RawMessage string    `json:"raw_message"`
	Timestamp  time.Time `json:"timestamp"`
}

type RTPStream struct {
	ID           int64     `json:"id"`
	CallID       string    `json:"call_id"`
	SSRC         uint32    `json:"ssrc"`
	SourceIP     string    `json:"source_ip"`
	DestIP       string    `json:"dest_ip"`
	SourcePort   int       `json:"source_port"`
	DestPort     int       `json:"dest_port"`
	PayloadType  uint8     `json:"payload_type"`
	Codec        string    `json:"codec"`
	TotalPackets int       `json:"total_packets"`
	LostPackets  int       `json:"lost_packets"`
	LossRate     float64   `json:"loss_rate"`
	MaxJitter    float64   `json:"max_jitter_ms"`
	AvgJitter    float64   `json:"avg_jitter_ms"`
	MOSScore     float64   `json:"mos_score"`
	FirstSeq     uint16    `json:"first_seq"`
	LastSeq      uint16    `json:"last_seq"`
	StartTime    time.Time `json:"start_time"`
	EndTime      time.Time `json:"end_time"`
	Duration     int64     `json:"duration_ms"`
}

type RTPReport struct {
	ID            int64     `json:"id"`
	CallID        string    `json:"call_id"`
	SSRC          uint32    `json:"ssrc"`
	SequenceNum   uint16    `json:"sequence_num"`
	Timestamp     uint32    `json:"rtp_timestamp"`
	ArrivalTime   time.Time `json:"arrival_time"`
	Jitter        float64   `json:"jitter_ms"`
	IsLost        bool      `json:"is_lost"`
	PayloadSize   int       `json:"payload_size"`
}

type Alert struct {
	ID          int64     `json:"id"`
	AlertType   string    `json:"alert_type"`
	Severity    string    `json:"severity"`
	Message     string    `json:"message"`
	SourceIP    string    `json:"source_ip"`
	User        string    `json:"user"`
	CallID      string    `json:"call_id,omitempty"`
	Count       int       `json:"count"`
	Details     string    `json:"details"`
	Timestamp   time.Time `json:"timestamp"`
	Acknowledged bool     `json:"acknowledged"`
}

type CallSummary struct {
	CallID       string     `json:"call_id"`
	FromUser     string     `json:"from_user"`
	ToUser       string     `json:"to_user"`
	StartTime    time.Time  `json:"start_time"`
	EndTime      *time.Time `json:"end_time,omitempty"`
	Status       string     `json:"status"`
	MessageCount int        `json:"message_count"`
	Duration     *int64     `json:"duration_ms,omitempty"`
	MOSScore     *float64   `json:"avg_mos,omitempty"`
}

type Database struct {
	db *sql.DB
}

func New(path string) (*Database, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}

	d := &Database{db: db}
	if err := d.initSchema(); err != nil {
		db.Close()
		return nil, err
	}

	return d, nil
}

func (d *Database) initSchema() error {
	schema := `
	CREATE TABLE IF NOT EXISTS sip_messages (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		call_id TEXT NOT NULL,
		method TEXT,
		status_code INTEGER DEFAULT 0,
		from_user TEXT,
		to_user TEXT,
		from_host TEXT,
		to_host TEXT,
		source_ip TEXT,
		dest_ip TEXT,
		source_port INTEGER,
		dest_port INTEGER,
		raw_message TEXT NOT NULL,
		timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS rtp_streams (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		call_id TEXT NOT NULL,
		ssrc INTEGER NOT NULL,
		source_ip TEXT,
		dest_ip TEXT,
		source_port INTEGER,
		dest_port INTEGER,
		payload_type INTEGER,
		codec TEXT,
		total_packets INTEGER DEFAULT 0,
		lost_packets INTEGER DEFAULT 0,
		loss_rate REAL DEFAULT 0,
		max_jitter REAL DEFAULT 0,
		avg_jitter REAL DEFAULT 0,
		mos_score REAL DEFAULT 0,
		first_seq INTEGER,
		last_seq INTEGER,
		start_time DATETIME,
		end_time DATETIME,
		duration_ms INTEGER DEFAULT 0
	);

	CREATE TABLE IF NOT EXISTS rtp_reports (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		call_id TEXT NOT NULL,
		ssrc INTEGER NOT NULL,
		sequence_num INTEGER,
		rtp_timestamp INTEGER,
		arrival_time DATETIME,
		jitter_ms REAL DEFAULT 0,
		is_lost BOOLEAN DEFAULT 0,
		payload_size INTEGER DEFAULT 0
	);

	CREATE TABLE IF NOT EXISTS alerts (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		alert_type TEXT NOT NULL,
		severity TEXT NOT NULL,
		message TEXT NOT NULL,
		source_ip TEXT,
		user TEXT,
		call_id TEXT,
		count INTEGER DEFAULT 1,
		details TEXT,
		timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
		acknowledged BOOLEAN DEFAULT 0
	);

	CREATE INDEX IF NOT EXISTS idx_call_id ON sip_messages(call_id);
	CREATE INDEX IF NOT EXISTS idx_timestamp ON sip_messages(timestamp);
	CREATE INDEX IF NOT EXISTS idx_method ON sip_messages(method);
	
	CREATE INDEX IF NOT EXISTS idx_rtp_call_id ON rtp_streams(call_id);
	CREATE INDEX IF NOT EXISTS idx_rtp_ssrc ON rtp_streams(ssrc);
	CREATE INDEX IF NOT EXISTS idx_rtp_call_time ON rtp_streams(call_id, start_time);
	
	CREATE INDEX IF NOT EXISTS idx_rtp_report_call ON rtp_reports(call_id, ssrc);
	
	CREATE INDEX IF NOT EXISTS idx_alerts_time ON alerts(timestamp);
	CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts(alert_type);
	CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
	`

	_, err := d.db.Exec(schema)
	return err
}

func (d *Database) InsertMessage(msg *SIPMessage) (int64, error) {
	query := `INSERT INTO sip_messages 
		(call_id, method, status_code, from_user, to_user, from_host, to_host, 
		 source_ip, dest_ip, source_port, dest_port, raw_message, timestamp)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

	result, err := d.db.Exec(query,
		msg.CallID, msg.Method, msg.StatusCode, msg.FromUser, msg.ToUser,
		msg.FromHost, msg.ToHost, msg.SourceIP, msg.DestIP,
		msg.SourcePort, msg.DestPort, msg.RawMessage, msg.Timestamp,
	)
	if err != nil {
		return 0, fmt.Errorf("insert message: %w", err)
	}

	return result.LastInsertId()
}

func (d *Database) InsertRTPReport(r *RTPReport) (int64, error) {
	query := `INSERT INTO rtp_reports 
		(call_id, ssrc, sequence_num, rtp_timestamp, arrival_time, jitter_ms, is_lost, payload_size)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`

	result, err := d.db.Exec(query,
		r.CallID, r.SSRC, r.SequenceNum, r.Timestamp,
		r.ArrivalTime, r.Jitter, r.IsLost, r.PayloadSize,
	)
	if err != nil {
		return 0, fmt.Errorf("insert rtp report: %w", err)
	}

	return result.LastInsertId()
}

func (d *Database) UpsertRTPStream(s *RTPStream) error {
	query := `SELECT id FROM rtp_streams WHERE call_id = ? AND ssrc = ?`
	var existingID int64
	err := d.db.QueryRow(query, s.CallID, s.SSRC).Scan(&existingID)

	if err == sql.ErrNoRows {
		insertQuery := `INSERT INTO rtp_streams 
			(call_id, ssrc, source_ip, dest_ip, source_port, dest_port, 
			 payload_type, codec, total_packets, lost_packets, loss_rate,
			 max_jitter, avg_jitter, mos_score, first_seq, last_seq, 
			 start_time, end_time, duration_ms)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		_, err := d.db.Exec(insertQuery,
			s.CallID, s.SSRC, s.SourceIP, s.DestIP, s.SourcePort, s.DestPort,
			s.PayloadType, s.Codec, s.TotalPackets, s.LostPackets, s.LossRate,
			s.MaxJitter, s.AvgJitter, s.MOSScore, s.FirstSeq, s.LastSeq,
			s.StartTime, s.EndTime, s.Duration,
		)
		return err
	}

	if err != nil {
		return fmt.Errorf("query rtp stream: %w", err)
	}

	updateQuery := `UPDATE rtp_streams SET 
		total_packets = ?, lost_packets = ?, loss_rate = ?,
		max_jitter = ?, avg_jitter = ?, mos_score = ?,
		last_seq = ?, end_time = ?, duration_ms = ?
		WHERE id = ?`
	_, err = d.db.Exec(updateQuery,
		s.TotalPackets, s.LostPackets, s.LossRate,
		s.MaxJitter, s.AvgJitter, s.MOSScore,
		s.LastSeq, s.EndTime, s.Duration, existingID,
	)
	return err
}

func (d *Database) InsertAlert(a *Alert) (int64, error) {
	query := `INSERT INTO alerts 
		(alert_type, severity, message, source_ip, user, call_id, count, details, timestamp)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`

	result, err := d.db.Exec(query,
		a.AlertType, a.Severity, a.Message, a.SourceIP, a.User,
		a.CallID, a.Count, a.Details, a.Timestamp,
	)
	if err != nil {
		return 0, fmt.Errorf("insert alert: %w", err)
	}

	return result.LastInsertId()
}

func (d *Database) GetRTPStreamsByCallID(callID string) ([]*RTPStream, error) {
	query := `SELECT id, call_id, ssrc, source_ip, dest_ip, source_port, dest_port,
		payload_type, codec, total_packets, lost_packets, loss_rate,
		max_jitter, avg_jitter, mos_score, first_seq, last_seq,
		start_time, end_time, duration_ms
		FROM rtp_streams WHERE call_id = ? ORDER BY start_time ASC`

	rows, err := d.db.Query(query, callID)
	if err != nil {
		return nil, fmt.Errorf("query rtp streams: %w", err)
	}
	defer rows.Close()

	var streams []*RTPStream
	for rows.Next() {
		s := &RTPStream{}
		err := rows.Scan(&s.ID, &s.CallID, &s.SSRC, &s.SourceIP, &s.DestIP,
			&s.SourcePort, &s.DestPort, &s.PayloadType, &s.Codec,
			&s.TotalPackets, &s.LostPackets, &s.LossRate,
			&s.MaxJitter, &s.AvgJitter, &s.MOSScore,
			&s.FirstSeq, &s.LastSeq, &s.StartTime, &s.EndTime, &s.Duration)
		if err != nil {
			return nil, fmt.Errorf("scan rtp stream: %w", err)
		}
		streams = append(streams, s)
	}

	return streams, rows.Err()
}

func (d *Database) GetRTPReportsByCallID(callID string, ssrc uint32) ([]*RTPReport, error) {
	query := `SELECT id, call_id, ssrc, sequence_num, rtp_timestamp, arrival_time,
		jitter_ms, is_lost, payload_size
		FROM rtp_reports WHERE call_id = ? AND ssrc = ? ORDER BY sequence_num ASC`

	rows, err := d.db.Query(query, callID, ssrc)
	if err != nil {
		return nil, fmt.Errorf("query rtp reports: %w", err)
	}
	defer rows.Close()

	var reports []*RTPReport
	for rows.Next() {
		r := &RTPReport{}
		err := rows.Scan(&r.ID, &r.CallID, &r.SSRC, &r.SequenceNum, &r.Timestamp,
			&r.ArrivalTime, &r.Jitter, &r.IsLost, &r.PayloadSize)
		if err != nil {
			return nil, fmt.Errorf("scan rtp report: %w", err)
		}
		reports = append(reports, r)
	}

	return reports, rows.Err()
}

func (d *Database) GetAlerts(severity string, limit, offset int) ([]*Alert, error) {
	query := `SELECT id, alert_type, severity, message, source_ip, user, 
		call_id, count, details, timestamp, acknowledged
		FROM alerts`
	var args []interface{}

	if severity != "" && severity != "all" {
		query += " WHERE severity = ?"
		args = append(args, severity)
	}

	query += " ORDER BY timestamp DESC LIMIT ? OFFSET ?"
	args = append(args, limit, offset)

	rows, err := d.db.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("query alerts: %w", err)
	}
	defer rows.Close()

	var alerts []*Alert
	for rows.Next() {
		a := &Alert{}
		err := rows.Scan(&a.ID, &a.AlertType, &a.Severity, &a.Message, &a.SourceIP,
			&a.User, &a.CallID, &a.Count, &a.Details, &a.Timestamp, &a.Acknowledged)
		if err != nil {
			return nil, fmt.Errorf("scan alert: %w", err)
		}
		alerts = append(alerts, a)
	}

	return alerts, rows.Err()
}

func (d *Database) AcknowledgeAlert(id int64) error {
	_, err := d.db.Exec("UPDATE alerts SET acknowledged = 1 WHERE id = ?", id)
	return err
}

func (d *Database) GetMessagesByCallID(callID string) ([]*SIPMessage, error) {
	query := `SELECT id, call_id, method, status_code, from_user, to_user, from_host, to_host,
		source_ip, dest_ip, source_port, dest_port, raw_message, timestamp
		FROM sip_messages WHERE call_id = ? ORDER BY timestamp ASC`

	rows, err := d.db.Query(query, callID)
	if err != nil {
		return nil, fmt.Errorf("query messages: %w", err)
	}
	defer rows.Close()

	var messages []*SIPMessage
	for rows.Next() {
		m := &SIPMessage{}
		err := rows.Scan(&m.ID, &m.CallID, &m.Method, &m.StatusCode, &m.FromUser, &m.ToUser,
			&m.FromHost, &m.ToHost, &m.SourceIP, &m.DestIP, &m.SourcePort, &m.DestPort,
			&m.RawMessage, &m.Timestamp)
		if err != nil {
			return nil, fmt.Errorf("scan message: %w", err)
		}
		messages = append(messages, m)
	}

	return messages, rows.Err()
}

func (d *Database) SearchCalls(keyword string, limit, offset int) ([]*CallSummary, error) {
	query := `
		SELECT 
			m.call_id,
			MAX(CASE WHEN m.method = 'INVITE' THEN m.from_user END) as from_user,
			MAX(CASE WHEN m.method = 'INVITE' THEN m.to_user END) as to_user,
			MIN(m.timestamp) as start_time,
			CASE 
				WHEN MAX(CASE WHEN m.method = 'BYE' THEN 1 ELSE 0 END) = 1 THEN 'completed'
				WHEN MAX(CASE WHEN m.status_code = 200 THEN 1 ELSE 0 END) = 1 THEN 'answered'
				ELSE 'in_progress'
			END as status,
			COUNT(DISTINCT m.id) as message_count,
			AVG(r.mos_score) as mos_score,
			MAX(r.duration_ms) as duration_ms
		FROM sip_messages m
		LEFT JOIN rtp_streams r ON m.call_id = r.call_id
		WHERE m.call_id LIKE ? OR m.from_user LIKE ? OR m.to_user LIKE ?
		GROUP BY m.call_id
		ORDER BY MIN(m.timestamp) DESC
		LIMIT ? OFFSET ?
	`

	pattern := "%" + keyword + "%"
	rows, err := d.db.Query(query, pattern, pattern, pattern, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("search calls: %w", err)
	}
	defer rows.Close()

	var calls []*CallSummary
	for rows.Next() {
		c := &CallSummary{}
		var mos sql.NullFloat64
		var duration sql.NullInt64
		err := rows.Scan(&c.CallID, &c.FromUser, &c.ToUser, &c.StartTime, &c.Status, &c.MessageCount, &mos, &duration)
		if err != nil {
			return nil, fmt.Errorf("scan call: %w", err)
		}
		if mos.Valid {
			c.MOSScore = &mos.Float64
		}
		if duration.Valid {
			c.Duration = &duration.Int64
		}
		calls = append(calls, c)
	}

	return calls, rows.Err()
}

func (d *Database) GetRecentCalls(limit, offset int) ([]*CallSummary, error) {
	query := `
		SELECT 
			m.call_id,
			MAX(CASE WHEN m.method = 'INVITE' THEN m.from_user END) as from_user,
			MAX(CASE WHEN m.method = 'INVITE' THEN m.to_user END) as to_user,
			MIN(m.timestamp) as start_time,
			CASE 
				WHEN MAX(CASE WHEN m.method = 'BYE' THEN 1 ELSE 0 END) = 1 THEN 'completed'
				WHEN MAX(CASE WHEN m.status_code = 200 THEN 1 ELSE 0 END) = 1 THEN 'answered'
				ELSE 'in_progress'
			END as status,
			COUNT(DISTINCT m.id) as message_count,
			AVG(r.mos_score) as mos_score,
			MAX(r.duration_ms) as duration_ms
		FROM sip_messages m
		LEFT JOIN rtp_streams r ON m.call_id = r.call_id
		GROUP BY m.call_id
		ORDER BY MIN(m.timestamp) DESC
		LIMIT ? OFFSET ?
	`

	rows, err := d.db.Query(query, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("get recent calls: %w", err)
	}
	defer rows.Close()

	var calls []*CallSummary
	for rows.Next() {
		c := &CallSummary{}
		var mos sql.NullFloat64
		var duration sql.NullInt64
		err := rows.Scan(&c.CallID, &c.FromUser, &c.ToUser, &c.StartTime, &c.Status, &c.MessageCount, &mos, &duration)
		if err != nil {
			return nil, fmt.Errorf("scan call: %w", err)
		}
		if mos.Valid {
			c.MOSScore = &mos.Float64
		}
		if duration.Valid {
			c.Duration = &duration.Int64
		}
		calls = append(calls, c)
	}

	return calls, rows.Err()
}

func (d *Database) Close() error {
	return d.db.Close()
}

func (d *Database) Ping() error {
	return d.db.Ping()
}

func (d *Database) GetCallFlow(callID string) ([]*SIPMessage, error) {
	messages, err := d.GetMessagesByCallID(callID)
	if err != nil {
		return nil, err
	}
	if len(messages) == 0 {
		return nil, fmt.Errorf("no messages found for call_id: %s", callID)
	}
	return messages, nil
}

func (d *Database) GetDB() *sql.DB {
	return d.db
}

func init() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)
}
