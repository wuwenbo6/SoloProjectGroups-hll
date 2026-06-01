package storage

import (
	"database/sql"
	"fmt"
	"sync"
	"time"

	_ "github.com/mattn/go-sqlite3"

	"sflow-analyzer/internal/sflow"
	"sflow-analyzer/pkg/types"
)

type Storage struct {
	db          *sql.DB
	mu          sync.Mutex
	asnResolver *sflow.ASNResolver
	buffer      []types.FlowRecord
	bufferSize  int
	flushTicker *time.Ticker
	wg          sync.WaitGroup
	running     bool
}

func NewStorage(dbPath string, asnResolver *sflow.ASNResolver) (*Storage, error) {
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}

	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)

	s := &Storage{
		db:          db,
		asnResolver: asnResolver,
		buffer:      make([]types.FlowRecord, 0, 1000),
		bufferSize:  1000,
	}

	if err := s.initSchema(); err != nil {
		db.Close()
		return nil, err
	}

	return s, nil
}

func (s *Storage) initSchema() error {
	schema := `
	CREATE TABLE IF NOT EXISTS flow_records (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		timestamp DATETIME NOT NULL,
		src_ip TEXT NOT NULL,
		dst_ip TEXT NOT NULL,
		src_port INTEGER NOT NULL,
		dst_port INTEGER NOT NULL,
		protocol INTEGER NOT NULL,
		protocol_str TEXT NOT NULL,
		bytes INTEGER NOT NULL,
		packets INTEGER NOT NULL,
		src_asn INTEGER NOT NULL,
		dst_asn INTEGER NOT NULL
	);

	CREATE INDEX IF NOT EXISTS idx_flow_timestamp ON flow_records(timestamp);
	CREATE INDEX IF NOT EXISTS idx_flow_src_asn ON flow_records(src_asn);
	CREATE INDEX IF NOT EXISTS idx_flow_dst_asn ON flow_records(dst_asn);
	CREATE INDEX IF NOT EXISTS idx_flow_src_ip ON flow_records(src_ip);
	CREATE INDEX IF NOT EXISTS idx_flow_dst_ip ON flow_records(dst_ip);

	CREATE TABLE IF NOT EXISTS topn_hourly (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		hour DATETIME NOT NULL,
		type TEXT NOT NULL,
		key TEXT NOT NULL,
		bytes INTEGER NOT NULL,
		packets INTEGER NOT NULL,
		asn_filter INTEGER DEFAULT 0,
		UNIQUE(hour, type, key, asn_filter)
	);

	CREATE INDEX IF NOT EXISTS idx_topn_hour ON topn_hourly(hour);
	CREATE INDEX IF NOT EXISTS idx_topn_type ON topn_hourly(type);
	`

	_, err := s.db.Exec(schema)
	return err
}

func (s *Storage) Start() {
	s.running = true
	s.flushTicker = time.NewTicker(5 * time.Second)
	s.wg.Add(1)
	go s.flushLoop()
}

func (s *Storage) Stop() {
	s.running = false
	if s.flushTicker != nil {
		s.flushTicker.Stop()
	}
	s.wg.Wait()
	s.flushBuffer()
	s.db.Close()
}

func (s *Storage) Store(record types.FlowRecord) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.buffer = append(s.buffer, record)

	if len(s.buffer) >= s.bufferSize {
		s.flushBufferLocked()
	}
}

func (s *Storage) StoreBatch(records []types.FlowRecord) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.buffer = append(s.buffer, records...)

	if len(s.buffer) >= s.bufferSize {
		s.flushBufferLocked()
	}
}

func (s *Storage) flushLoop() {
	defer s.wg.Done()

	for s.running {
		<-s.flushTicker.C
		s.flushBuffer()
	}
}

func (s *Storage) flushBuffer() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.flushBufferLocked()
}

func (s *Storage) flushBufferLocked() {
	if len(s.buffer) == 0 {
		return
	}

	tx, err := s.db.Begin()
	if err != nil {
		return
	}

	stmt, err := tx.Prepare(`
		INSERT INTO flow_records (
			timestamp, src_ip, dst_ip, src_port, dst_port,
			protocol, protocol_str, bytes, packets, src_asn, dst_asn
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		tx.Rollback()
		return
	}
	defer stmt.Close()

	for _, record := range s.buffer {
		_, err := stmt.Exec(
			record.Timestamp,
			record.SrcIP,
			record.DstIP,
			record.SrcPort,
			record.DstPort,
			record.Protocol,
			record.ProtocolStr,
			record.Bytes,
			record.Packets,
			record.SrcASN,
			record.DstASN,
		)
		if err != nil {
			tx.Rollback()
			return
		}
	}

	if err := tx.Commit(); err != nil {
		return
	}

	s.buffer = s.buffer[:0]
}

func (s *Storage) QueryHistorical(query types.HistoricalQuery) ([]types.FlowRecord, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var rows *sql.Rows
	var err error

	baseSQL := `
		SELECT timestamp, src_ip, dst_ip, src_port, dst_port,
		       protocol, protocol_str, bytes, packets, src_asn, dst_asn
		FROM flow_records
		WHERE timestamp >= ? AND timestamp <= ?
	`

	args := []interface{}{query.StartTime, query.EndTime}

	if query.ASNFilter != 0 {
		baseSQL += ` AND (src_asn = ? OR dst_asn = ?)`
		args = append(args, query.ASNFilter, query.ASNFilter)
	}

	baseSQL += ` ORDER BY timestamp DESC`

	if query.Limit > 0 {
		baseSQL += ` LIMIT ?`
		args = append(args, query.Limit)
	}

	rows, err = s.db.Query(baseSQL, args...)
	if err != nil {
		return nil, fmt.Errorf("query historical: %w", err)
	}
	defer rows.Close()

	var records []types.FlowRecord
	for rows.Next() {
		var rec types.FlowRecord
		err := rows.Scan(
			&rec.Timestamp, &rec.SrcIP, &rec.DstIP,
			&rec.SrcPort, &rec.DstPort, &rec.Protocol,
			&rec.ProtocolStr, &rec.Bytes, &rec.Packets,
			&rec.SrcASN, &rec.DstASN,
		)
		if err != nil {
			return nil, err
		}
		records = append(records, rec)
	}

	return records, rows.Err()
}

func (s *Storage) QueryTopNHistorical(query types.HistoricalQuery) (*types.TopNResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	whereClause := "WHERE timestamp >= ? AND timestamp <= ?"
	args := []interface{}{query.StartTime, query.EndTime}

	if query.ASNFilter != 0 {
		whereClause += " AND (src_asn = ? OR dst_asn = ?)"
		args = append(args, query.ASNFilter, query.ASNFilter)
	}

	ipPairsSQL := fmt.Sprintf(`
		SELECT src_ip, dst_ip, SUM(bytes) as total_bytes, SUM(packets) as total_packets,
		       src_asn, dst_asn
		FROM flow_records
		%s
		GROUP BY src_ip, dst_ip
		ORDER BY total_bytes DESC
		LIMIT ?
	`, whereClause)

	ipArgs := append(append([]interface{}{}, args...), query.Limit)
	ipRows, err := s.db.Query(ipPairsSQL, ipArgs...)
	if err != nil {
		return nil, fmt.Errorf("query ip pairs: %w", err)
	}
	defer ipRows.Close()

	var ipPairs []types.IPPairStats
	for ipRows.Next() {
		var stats types.IPPairStats
		err := ipRows.Scan(&stats.SrcIP, &stats.DstIP, &stats.Bytes, &stats.Packets, &stats.SrcASN, &stats.DstASN)
		if err != nil {
			return nil, err
		}
		ipPairs = append(ipPairs, stats)
	}

	appsSQL := fmt.Sprintf(`
		SELECT dst_port, protocol, protocol_str, SUM(bytes) as total_bytes, SUM(packets) as total_packets
		FROM flow_records
		%s
		GROUP BY dst_port, protocol
		ORDER BY total_bytes DESC
		LIMIT ?
	`, whereClause)

	appArgs := append(append([]interface{}{}, args...), query.Limit)
	appRows, err := s.db.Query(appsSQL, appArgs...)
	if err != nil {
		return nil, fmt.Errorf("query apps: %w", err)
	}
	defer appRows.Close()

	var apps []types.AppStats
	for appRows.Next() {
		var stats types.AppStats
		err := appRows.Scan(&stats.Port, &stats.Protocol, &stats.ProtocolStr, &stats.Bytes, &stats.Packets)
		if err != nil {
			return nil, err
		}
		stats.AppName = sflow.PortToAppName(stats.Port, stats.Protocol)
		apps = append(apps, stats)
	}

	return &types.TopNResult{
		IPPairs: ipPairs,
		Apps:    apps,
	}, nil
}

func (s *Storage) QueryTrafficOverTime(query types.HistoricalQuery) ([]map[string]interface{}, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	timeBucket := "10 minutes"
	if query.EndTime.Sub(query.StartTime) > 24*time.Hour {
		timeBucket = "1 hour"
	} else if query.EndTime.Sub(query.StartTime) > 7*24*time.Hour {
		timeBucket = "1 day"
	}

	whereClause := "WHERE timestamp >= ? AND timestamp <= ?"
	args := []interface{}{query.StartTime, query.EndTime}

	if query.ASNFilter != 0 {
		whereClause += " AND (src_asn = ? OR dst_asn = ?)"
		args = append(args, query.ASNFilter, query.ASNFilter)
	}

	sql := fmt.Sprintf(`
		SELECT 
			strftime('%%Y-%%m-%%d %%H:%%M:%%S', datetime(timestamp, 'unixepoch', '-' || (strftime('%%M', timestamp) %% 10) || ' minutes')) as time_bucket,
			SUM(bytes) as total_bytes,
			SUM(packets) as total_packets
		FROM flow_records
		%s
		GROUP BY time_bucket
		ORDER BY time_bucket
	`, whereClause)

	rows, err := s.db.Query(sql, args...)
	if err != nil {
		return nil, fmt.Errorf("query traffic over time: %w", err)
	}
	defer rows.Close()

	var result []map[string]interface{}
	for rows.Next() {
		var timeBucket string
		var bytes uint64
		var packets uint32

		err := rows.Scan(&timeBucket, &bytes, &packets)
		if err != nil {
			return nil, err
		}

		result = append(result, map[string]interface{}{
			"time":    timeBucket,
			"bytes":   bytes,
			"packets": packets,
		})
	}

	return result, rows.Err()
}

func (s *Storage) GetStats() map[string]interface{} {
	s.mu.Lock()
	defer s.mu.Unlock()

	var totalRecords int64
	var totalBytes int64
	var earliestTime, latestTime string

	s.db.QueryRow("SELECT COUNT(*) FROM flow_records").Scan(&totalRecords)
	s.db.QueryRow("SELECT SUM(bytes) FROM flow_records").Scan(&totalBytes)
	s.db.QueryRow("SELECT MIN(timestamp) FROM flow_records").Scan(&earliestTime)
	s.db.QueryRow("SELECT MAX(timestamp) FROM flow_records").Scan(&latestTime)

	return map[string]interface{}{
		"total_records":  totalRecords,
		"total_bytes":    totalBytes,
		"earliest_time":  earliestTime,
		"latest_time":    latestTime,
		"buffer_size":    len(s.buffer),
	}
}

func (s *Storage) GetASNResolver() *sflow.ASNResolver {
	return s.asnResolver
}
