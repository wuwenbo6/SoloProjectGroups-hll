package tracker

import (
	"fmt"
	"net"
	"sync"
	"sync/atomic"
	"time"

	"dbprobe/pkg/ebpf"
	"dbprobe/pkg/mysql"
	"dbprobe/pkg/postgres"
)

const (
	DBTypeMySQL    = "mysql"
	DBTypePostgres = "postgres"
)

type QueryEvent struct {
	Timestamp     time.Time
	Duration      time.Duration
	SQL           string
	Database      string
	DBType        string
	ClientIP      net.IP
	ClientPort    uint16
	ServerIP      net.IP
	ServerPort    uint16
	Pid           uint32
	ProcessName   string
	OverThreshold bool
	IsSSL         bool
	Source        string
}

type Stats struct {
	TotalQueries   uint64
	SlowQueries    uint64
	KernelEvents   uint64
	UprobeEvents   uint64
	SSLEvents      uint64
	LostEvents     uint64
	PendingQueries uint64
}

type pendingQuery struct {
	SQL        string
	Database   string
	DBType     string
	ClientIP   net.IP
	ClientPort uint16
	ServerIP   net.IP
	ServerPort uint16
	Pid        uint32
	Comm       string
	StartTime  time.Time
}

type Tracker struct {
	mysqlParser     *mysql.Parser
	postgresParser  *postgres.Parser
	pendingQueries  map[string]*pendingQuery
	mu              sync.RWMutex
	threshold       time.Duration
	queryChan       chan QueryEvent
	stopChan        chan struct{}
	stats           Stats
	statsMu         sync.Mutex
}

func NewTracker(threshold time.Duration) *Tracker {
	return &Tracker{
		mysqlParser:    mysql.NewParser(),
		postgresParser: postgres.NewParser(),
		pendingQueries: make(map[string]*pendingQuery),
		threshold:      threshold,
		queryChan:      make(chan QueryEvent, 10000),
		stopChan:       make(chan struct{}),
	}
}

func (t *Tracker) ProcessEvent(event ebpf.Event) {
	t.statsMu.Lock()
	switch event.EventType {
	case ebpf.EVENT_TYPE_KERNEL:
		t.stats.KernelEvents++
	case ebpf.EVENT_TYPE_UPROBE_SSL_READ, ebpf.EVENT_TYPE_UPROBE_SSL_WRITE:
		t.stats.SSLEvents++
	case ebpf.EVENT_TYPE_UPROBE_MYSQL_QUERY, ebpf.EVENT_TYPE_UPROBE_PG_QUERY:
		t.stats.UprobeEvents++
	}
	t.statsMu.Unlock()

	if event.EventType == ebpf.EVENT_TYPE_UPROBE_MYSQL_QUERY || 
	   event.EventType == ebpf.EVENT_TYPE_UPROBE_PG_QUERY {
		t.processDirectQuery(event)
		return
	}

	if event.EventType == ebpf.EVENT_TYPE_UPROBE_SSL_READ || 
	   event.EventType == ebpf.EVENT_TYPE_UPROBE_SSL_WRITE {
		t.processSSLEvent(event)
		return
	}

	t.processKernelEvent(event)
}

func (t *Tracker) processDirectQuery(event ebpf.Event) {
	var sql string
	var dbType string

	if event.EventType == ebpf.EVENT_TYPE_UPROBE_MYSQL_QUERY {
		if len(event.Data) < 1 {
			return
		}
		sql = string(event.Data)
		dbType = DBTypeMySQL
	} else {
		sql = string(event.Data)
		dbType = DBTypePostgres
	}

	sql = cleanString(sql)
	if sql == "" {
		return
	}

	queryEvent := QueryEvent{
		Timestamp:     event.ReceivedAt,
		Duration:      event.Duration,
		SQL:           sql,
		Database:      "",
		DBType:        dbType,
		ClientIP:      event.SrcIP,
		ClientPort:    event.SrcPort,
		ServerIP:      event.DstIP,
		ServerPort:    event.DstPort,
		Pid:           event.Pid,
		ProcessName:   event.Comm,
		OverThreshold: event.Duration >= t.threshold,
		IsSSL:         false,
		Source:        "direct_uprobe",
	}

	t.statsMu.Lock()
	t.stats.TotalQueries++
	if queryEvent.OverThreshold {
		t.stats.SlowQueries++
	}
	t.statsMu.Unlock()

	select {
	case t.queryChan <- queryEvent:
	default:
	}
}

func (t *Tracker) processSSLEvent(event ebpf.Event) {
	dbType := t.detectDBTypeFromComm(event.Comm)
	if dbType == "" {
		return
	}

	var sql string
	var database string

	switch dbType {
	case DBTypeMySQL:
		if !t.mysqlParser.IsQueryPacket(event.Data) {
			return
		}
		query, err := t.mysqlParser.Parse(event.Data)
		if err != nil {
			return
		}
		sql = query.SQL
		database = query.Database

	case DBTypePostgres:
		if !t.postgresParser.IsQueryPacket(event.Data) {
			return
		}
		query, err := t.postgresParser.Parse(event.Data)
		if err != nil {
			return
		}
		sql = query.SQL
		database = query.Database
	}

	if sql == "" {
		return
	}

	queryEvent := QueryEvent{
		Timestamp:     event.ReceivedAt,
		Duration:      event.Duration,
		SQL:           sql,
		Database:      database,
		DBType:        dbType,
		ClientIP:      event.SrcIP,
		ClientPort:    event.SrcPort,
		ServerIP:      event.DstIP,
		ServerPort:    event.DstPort,
		Pid:           event.Pid,
		ProcessName:   event.Comm,
		OverThreshold: event.Duration >= t.threshold,
		IsSSL:         true,
		Source:        "ssl_uprobe",
	}

	t.statsMu.Lock()
	t.stats.TotalQueries++
	if queryEvent.OverThreshold {
		t.stats.SlowQueries++
	}
	t.statsMu.Unlock()

	select {
	case t.queryChan <- queryEvent:
	default:
	}
}

func (t *Tracker) processKernelEvent(event ebpf.Event) {
	dbType := t.detectDBType(event)
	if dbType == "" {
		return
	}

	connKey := t.getConnectionKey(event)

	if event.Direction == 1 {
		t.processRequest(event, dbType, connKey)
	} else {
		t.processResponse(event, dbType, connKey)
	}
}

func (t *Tracker) detectDBType(event ebpf.Event) string {
	if event.SrcPort == ebpf.MYSQL_PORT || event.DstPort == ebpf.MYSQL_PORT {
		return DBTypeMySQL
	}
	if event.SrcPort == ebpf.POSTGRES_PORT || event.DstPort == ebpf.POSTGRES_PORT {
		return DBTypePostgres
	}
	return ""
}

func (t *Tracker) detectDBTypeFromComm(comm string) string {
	if comm == "mysqld" || comm == "mysql" {
		return DBTypeMySQL
	}
	if comm == "postgres" || comm == "postmaster" {
		return DBTypePostgres
	}
	return ""
}

func (t *Tracker) getConnectionKey(event ebpf.Event) string {
	if event.SrcPort == ebpf.MYSQL_PORT || event.SrcPort == ebpf.POSTGRES_PORT {
		return fmt.Sprintf("%s:%d-%s:%d", event.DstIP, event.DstPort, event.SrcIP, event.SrcPort)
	}
	return fmt.Sprintf("%s:%d-%s:%d", event.SrcIP, event.SrcPort, event.DstIP, event.DstPort)
}

func (t *Tracker) processRequest(event ebpf.Event, dbType string, connKey string) {
	var sql string
	var database string

	switch dbType {
	case DBTypeMySQL:
		if !t.mysqlParser.IsQueryPacket(event.Data) {
			return
		}
		query, parseErr := t.mysqlParser.Parse(event.Data)
		if parseErr != nil {
			return
		}
		sql = query.SQL
		database = query.Database

	case DBTypePostgres:
		if !t.postgresParser.IsQueryPacket(event.Data) {
			return
		}
		query, parseErr := t.postgresParser.Parse(event.Data)
		if parseErr != nil {
			return
		}
		sql = query.SQL
		database = query.Database
	}

	if sql == "" {
		return
	}

	clientIP, clientPort, serverIP, serverPort := t.getAddresses(event, dbType)

	t.mu.Lock()
	t.pendingQueries[connKey] = &pendingQuery{
		SQL:        sql,
		Database:   database,
		DBType:     dbType,
		ClientIP:   clientIP,
		ClientPort: clientPort,
		ServerIP:   serverIP,
		ServerPort: serverPort,
		Pid:        event.Pid,
		Comm:       event.Comm,
		StartTime:  event.ReceivedAt,
	}
	t.statsMu.Lock()
	t.stats.PendingQueries = uint64(len(t.pendingQueries))
	t.statsMu.Unlock()
	t.mu.Unlock()
}

func (t *Tracker) processResponse(event ebpf.Event, dbType string, connKey string) {
	t.mu.Lock()
	pending, exists := t.pendingQueries[connKey]
	if exists {
		delete(t.pendingQueries, connKey)
	}
	t.statsMu.Lock()
	t.stats.PendingQueries = uint64(len(t.pendingQueries))
	t.statsMu.Unlock()
	t.mu.Unlock()

	if !exists {
		return
	}

	duration := event.ReceivedAt.Sub(pending.StartTime)
	if event.Duration > 0 {
		duration = event.Duration
	}

	overThreshold := duration >= t.threshold

	queryEvent := QueryEvent{
		Timestamp:     event.ReceivedAt,
		Duration:      duration,
		SQL:           pending.SQL,
		Database:      pending.Database,
		DBType:        pending.DBType,
		ClientIP:      pending.ClientIP,
		ClientPort:    pending.ClientPort,
		ServerIP:      pending.ServerIP,
		ServerPort:    pending.ServerPort,
		Pid:           pending.Pid,
		ProcessName:   pending.Comm,
		OverThreshold: overThreshold,
		IsSSL:         false,
		Source:        "kernel_kprobe",
	}

	t.statsMu.Lock()
	t.stats.TotalQueries++
	if overThreshold {
		t.stats.SlowQueries++
	}
	t.statsMu.Unlock()

	select {
	case t.queryChan <- queryEvent:
	default:
	}
}

func (t *Tracker) getAddresses(event ebpf.Event, dbType string) (net.IP, uint16, net.IP, uint16) {
	serverPort := ebpf.MYSQL_PORT
	if dbType == DBTypePostgres {
		serverPort = ebpf.POSTGRES_PORT
	}

	if event.SrcPort == uint16(serverPort) {
		return event.DstIP, event.DstPort, event.SrcIP, event.SrcPort
	}
	return event.SrcIP, event.SrcPort, event.DstIP, event.DstPort
}

func (t *Tracker) QueryEvents() <-chan QueryEvent {
	return t.queryChan
}

func (t *Tracker) AddLostEvents(count uint64) {
	t.statsMu.Lock()
	defer t.statsMu.Unlock()
	t.stats.LostEvents += count
}

func (t *Tracker) GetStats() Stats {
	t.statsMu.Lock()
	defer t.statsMu.Unlock()
	return t.stats
}

func (t *Tracker) Stop() {
	close(t.stopChan)
	close(t.queryChan)
}

func (t *Tracker) CleanupOldQueries(timeout time.Duration) {
	t.mu.Lock()
	defer t.mu.Unlock()

	now := time.Now()
	for key, pending := range t.pendingQueries {
		if now.Sub(pending.StartTime) > timeout {
			delete(t.pendingQueries, key)
		}
	}

	t.statsMu.Lock()
	t.stats.PendingQueries = uint64(len(t.pendingQueries))
	t.statsMu.Unlock()
}

func (t *Tracker) SetThreshold(threshold time.Duration) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.threshold = threshold
}

func (t *Tracker) GetThreshold() time.Duration {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return t.threshold
}

func cleanString(s string) string {
	for i := 0; i < len(s); i++ {
		if s[i] == 0 {
			s = s[:i]
			break
		}
	}
	s = string([]byte(s))
	return s
}
