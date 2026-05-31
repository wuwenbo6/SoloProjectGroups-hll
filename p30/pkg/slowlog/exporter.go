package slowlog

import (
	"bufio"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"dbprobe/pkg/analyzer"
	"dbprobe/pkg/tracker"
)

type LogFormat string

const (
	FormatMySQL    LogFormat = "mysql"
	FormatPostgres LogFormat = "postgres"
	FormatCSV       LogFormat = "csv"
	FormatJSON     LogFormat = "json"
)

type Config struct {
	Enabled       bool
	FilePath      string
	Format        LogFormat
	RotationSize    int64
	RotationCount int
	IncludeIndexSuggestions bool
}

type Exporter struct {
	config     Config
	file       *os.File
	writer     *bufio.Writer
	mu         sync.Mutex
	analyzer   *analyzer.Analyzer
	fileSize   int64
	fileIndex  int
}

func NewExporter(config Config) (*Exporter, error) {
	if !config.Enabled {
		return &Exporter{
			config:   config,
			analyzer: analyzer.NewAnalyzer(),
		}, nil
	}

	if config.RotationSize == 0 {
		config.RotationSize = 100 * 1024 * 1024
	}
	if config.RotationCount == 0 {
		config.RotationCount = 5
	}

	e := &Exporter{
		config:   config,
		analyzer: analyzer.NewAnalyzer(),
	}

	if err := e.openLogFile(); err != nil {
		return nil, err
	}

	return e, nil
}

func (e *Exporter) openLogFile() error {
	e.mu.Lock()
	defer e.mu.Unlock()

	if e.file != nil {
		e.file.Close()
	}

	dir := filepath.Dir(e.config.FilePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	file, err := os.OpenFile(e.config.FilePath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}

	stat, err := file.Stat()
	if err != nil {
		file.Close()
		return err
	}

	e.file = file
	e.writer = bufio.NewWriter(file)
	e.fileSize = stat.Size()

	e.writeHeader()
	return nil
}

func (e *Exporter) writeHeader() {
	if e.fileSize == 0 {
		switch e.config.Format {
		case FormatMySQL:
			e.writer.WriteString(fmt.Sprintf("# Time: %s\n", time.Now().Format("2006-01-02T15:04:05.000000Z"))
			e.writer.WriteString("# User@Host: dbprobe[dbprobe] @ localhost []\n")
			e.writer.WriteString("# Schema:   dbprobe\n")
			e.writer.WriteString("# Query_time: 0.000000  Lock_time: 0.000000 Rows_sent: 0  Rows_examined: 0\n")
			e.writer.WriteString("SET timestamp=" + fmt.Sprintf("%d", time.Now().Unix()) + ";\n")
		case FormatCSV:
			e.writer.WriteString("timestamp,query_time,db_type,database,client_ip,server_ip,sql\n")
		}
	}
	e.writer.Flush()
}

func (e *Exporter) Export(event tracker.QueryEvent) error {
	if !e.config.Enabled {
		return nil
	}

	e.mu.Lock()
	defer e.mu.Unlock()

	if e.file == nil {
		return fmt.Errorf("log file not opened")
	}

	var line string
	var err error

	switch e.config.Format {
	case FormatMySQL:
		line, err = e.formatMySQL(event)
	case FormatPostgres:
		line, err = e.formatPostgres(event)
	case FormatCSV:
		line, err = e.formatCSV(event)
	case FormatJSON:
		line, err = e.formatJSON(event)
	default:
		line, err = e.formatMySQL(event)
	}

	if err != nil {
		return err
	}

	n, err := e.writer.WriteString(line + "\n")
	if err != nil {
		return err
	}

	e.fileSize += int64(n)
	e.writer.Flush()

	if e.fileSize >= e.config.RotationSize {
		go e.rotate()
	}

	return nil
}

func (e *Exporter) formatMySQL(event tracker.QueryEvent) (string, error) {
	var sb strings.Builder

	sb.WriteString(fmt.Sprintf("# Time: %s\n", event.Timestamp.UTC().Format("2006-01-02T15:04:05.000000Z"))
	
	user := event.ProcessName
	if user == "" {
		user = "unknown"
	}
	clientIP := formatIP(event.ClientIP)
	serverIP := formatIP(event.ServerIP)
	sb.WriteString(fmt.Sprintf("# User@Host: %s[%s] @ %s [%s]\n", user, user, clientIP, clientIP))
	
	if event.Database != "" {
		sb.WriteString(fmt.Sprintf("# Schema:   %s\n", event.Database))
	}
	
	sb.WriteString(fmt.Sprintf("# Query_time: %.6f  Lock_time: 0.000000 Rows_sent: 0  Rows_examined: 0\n", 
		event.Duration.Seconds()))
	
	sb.WriteString(fmt.Sprintf("# DB_type: %s\n", event.DBType))
	sb.WriteString(fmt.Sprintf("# Server: %s:%d\n", serverIP, event.ServerPort))
	
	if event.IsSSL {
		sb.WriteString("# SSL: Yes\n")
	}
	
	if e.config.IncludeIndexSuggestions {
		analysis := e.analyzer.Analyze(event.SQL)
		if len(analysis.Suggestions) > 0 {
			sb.WriteString(fmt.Sprintf("# Index suggestions: %d\n", len(analysis.Suggestions)))
			for i, s := range analysis.Suggestions {
				sb.WriteString(fmt.Sprintf("#   %d. Table: %s, Columns: %s - %s\n", 
					i+1, s.Table, strings.Join(s.Columns, ", "), s.Reason))
			}
		}
	}
	
	sb.WriteString(fmt.Sprintf("SET timestamp=%d;\n", event.Timestamp.Unix()))
	
	sql := strings.TrimSpace(event.SQL)
	if !strings.HasSuffix(sql, ";") {
		sql += ";"
	}
	sb.WriteString(sql + "\n")

	return sb.String(), nil
}

func (e *Exporter) formatPostgres(event tracker.QueryEvent) (string, error) {
	var sb strings.Builder

	duration := float64(event.Duration.Microseconds()) / 1000.0
	sb.WriteString(fmt.Sprintf("%s [%d-%d] [%s-%s] LOG:  duration: %.3f ms  statement: %s",
		event.Timestamp.Format("2006-01-02 15:04:05.000 UTC"),
		event.Pid,
		event.Tid,
		event.DBType,
		event.Database,
		duration,
		event.SQL,
	))

	return sb.String(), nil
}

func (e *Exporter) formatCSV(event tracker.QueryEvent) (string, error) {
	sql := strings.ReplaceAll(event.SQL, "\"", "\"\"")
	line := fmt.Sprintf("%s,%.6f,%s,%s,%s,%s,\"%s\"",
		event.Timestamp.Format(time.RFC3339Nano),
		event.Duration.Seconds(),
		event.DBType,
		event.Database,
		formatIP(event.ClientIP),
		formatIP(event.ServerIP),
		sql,
	)
	return line, nil
}

func (e *Exporter) formatJSON(event tracker.QueryEvent) (string, error) {
	analysis := e.analyzer.Analyze(event.SQL)
	
	suggestions := make([]string, 0, len(analysis.Suggestions))
	for i, s := range analysis.Suggestions {
		suggestions[i] = fmt.Sprintf("{\"table\":\"%s\",\"columns\":[\"%s\"],\"reason\":\"%s\"}",
			s.Table, strings.Join(s.Columns, "\",\""), s.Reason)
	}

	json := fmt.Sprintf(
		`{"timestamp":"%s","query_time":%.6f,"db_type":"%s","database":"%s",`+
			`"client_ip":"%s","client_port":%d,"server_ip":"%s","server_port":%d,`+
			`"pid":%d,"process":"%s","sql":`+
			`"is_ssl":%t,"over_threshold":%t,"source":"%s",`+
			`"suggestions":[%s]}`,
		event.Timestamp.Format(time.RFC3339Nano),
		event.Duration.Seconds(),
		event.DBType,
		event.Database,
		formatIP(event.ClientIP),
		event.ClientPort,
		formatIP(event.ServerIP),
		event.ServerPort,
		event.Pid,
		event.ProcessName,
		escapeJSON(event.SQL),
		event.IsSSL,
		event.OverThreshold,
		event.Source,
		strings.Join(suggestions, ","),
	)

	return json, nil
}

func (e *Exporter) rotate() {
	e.mu.Lock()
	defer e.mu.Unlock()

	if e.writer != nil {
		e.writer.Flush()
	}
	if e.file != nil {
		e.file.Close()
	}

	for i := e.config.RotationCount - 1; i >= 0; i-- {
		oldPath := fmt.Sprintf("%s.%d", e.config.FilePath, i)
		newPath := fmt.Sprintf("%s.%d", e.config.FilePath, i+1)
		
		if i == 0 {
			oldPath = e.config.FilePath
		}
		
		if _, err := os.Stat(oldPath); err == nil {
			os.Rename(oldPath, newPath)
		}
	}

	e.fileIndex = (e.fileIndex + 1) % e.config.RotationCount

	file, err := os.OpenFile(e.config.FilePath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err == nil {
		e.file = file
		e.writer = bufio.NewWriter(file)
		e.fileSize = 0
		e.writeHeader()
	}
}

func (e *Exporter) Close() error {
	e.mu.Lock()
	defer e.mu.Unlock()

	if e.writer != nil {
		e.writer.Flush()
	}
	if e.file != nil {
		return e.file.Close()
	}
	return nil
}

func formatIP(ip net.IP) string {
	if ip == nil {
		return "unknown"
	}
	return ip.String()
}

func escapeJSON(s string) string {
	s = strings.ReplaceAll(s, "\\", "\\\\")
	s = strings.ReplaceAll(s, "\"", "\\\"")
	s = strings.ReplaceAll(s, "\n", "\\n")
	s = strings.ReplaceAll(s, "\r", "\\r")
	s = strings.ReplaceAll(s, "\t", "\\t")
	return s
}
