package dbconnector

import (
	"context"
	"database/sql"
	"fmt"
	"net"
	"strings"
	"sync"
	"time"

	_ "github.com/go-sql-driver/mysql"
	_ "github.com/lib/pq"
)

type DBConfig struct {
	DBType       string
	Host         string
	Port         int
	User         string
	Password     string
	Database     string
	MaxOpenConns int
	MaxIdleConns int
}

type RunningQuery struct {
	ID          int64
	User        string
	Host        string
	DB          string
	Command     string
	Time        int
	State       string
	Info        string
	Progress    float64
}

type DBConnector struct {
	config     DBConfig
	db         *sql.DB
	mu         sync.RWMutex
	isConnected bool
}

type Killer struct {
	connectors     map[string]*DBConnector
	autoKill       bool
	killThreshold  time.Duration
	dryRun         bool
	killedCount    uint64
	mu             sync.Mutex
}

func NewDBConnector(config DBConfig) *DBConnector {
	return &DBConnector{
		config: config,
	}
}

func (c *DBConnector) Connect() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	var dsn string
	var driver string

	switch strings.ToLower(c.config.DBType) {
	case "mysql":
		dsn = fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?charset=utf8mb4&parseTime=true",
			c.config.User, c.config.Password, c.config.Host, c.config.Port, c.config.Database)
		driver = "mysql"
	case "postgres", "pg":
		dsn = fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=disable",
			c.config.Host, c.config.Port, c.config.User, c.config.Password, c.config.Database)
		driver = "postgres"
	default:
		return fmt.Errorf("unsupported database type: %s", c.config.DBType)
	}

	db, err := sql.Open(driver, dsn)
	if err != nil {
		return fmt.Errorf("failed to open database: %w", err)
	}

	db.SetMaxOpenConns(c.config.MaxOpenConns)
	db.SetMaxIdleConns(c.config.MaxIdleConns)
	db.SetConnMaxLifetime(time.Hour)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return fmt.Errorf("failed to ping database: %w", err)
	}

	c.db = db
	c.isConnected = true
	return nil
}

func (c *DBConnector) Close() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.db != nil {
		err := c.db.Close()
		c.db = nil
		c.isConnected = false
		return err
	}
	return nil
}

func (c *DBConnector) IsConnected() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.isConnected
}

func (c *DBConnector) GetRunningQueries(ctx context.Context) ([]RunningQuery, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if !c.isConnected {
		return nil, fmt.Errorf("not connected to database")
	}

	var queries []RunningQuery

	switch strings.ToLower(c.config.DBType) {
	case "mysql":
		return c.getMySQLProcessList(ctx)
	case "postgres", "pg":
		return c.getPGStatActivity(ctx)
	}

	return queries, nil
}

func (c *DBConnector) getMySQLProcessList(ctx context.Context) ([]RunningQuery, error) {
	rows, err := c.db.QueryContext(ctx, "SHOW FULL PROCESSLIST")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var queries []RunningQuery
	for rows.Next() {
		var q RunningQuery
		var db sql.NullString
		var info sql.NullString
		var progress sql.NullFloat64

		err := rows.Scan(&q.ID, &q.User, &q.Host, &db, &q.Command, &q.Time, &q.State, &info)
		if err != nil {
			continue
		}

		q.DB = db.String
		q.Info = info.String
		q.Progress = progress.Float64

		if q.Info != "" && q.Command == "Query" {
			queries = append(queries, q)
		}
	}

	return queries, nil
}

func (c *DBConnector) getPGStatActivity(ctx context.Context) ([]RunningQuery, error) {
	query := `
		SELECT 
			pid, usename, client_addr, datname, 
			state, EXTRACT(EPOCH FROM (now() - query_start))::integer as duration,
			query
		FROM pg_stat_activity 
		WHERE state = 'active' 
		AND pid != pg_backend_pid()
		AND query IS NOT NULL
	`

	rows, err := c.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var queries []RunningQuery
	for rows.Next() {
		var q RunningQuery
		var clientAddr sql.NullString
		var db sql.NullString

		err := rows.Scan(&q.ID, &q.User, &clientAddr, &db, &q.State, &q.Time, &q.Info)
		if err != nil {
			continue
		}

		q.Host = clientAddr.String
		q.DB = db.String
		q.Command = "Query"

		if q.Info != "" && len(q.Info) > 0 {
			queries = append(queries, q)
		}
	}

	return queries, nil
}

func (c *DBConnector) KillQuery(ctx context.Context, queryID int64) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if !c.isConnected {
		return fmt.Errorf("not connected to database")
	}

	switch strings.ToLower(c.config.DBType) {
	case "mysql":
		_, err := c.db.ExecContext(ctx, fmt.Sprintf("KILL %d", queryID))
		return err
	case "postgres", "pg":
		_, err := c.db.ExecContext(ctx, fmt.Sprintf("SELECT pg_terminate_backend(%d)", queryID))
		return err
	}

	return fmt.Errorf("unsupported database type")
}

func NewKiller() *Killer {
	return &Killer{
		connectors:    make(map[string]*DBConnector),
		autoKill:      false,
		killThreshold: 5 * time.Minute,
		dryRun:        true,
	}
}

func (k *Killer) AddConnector(name string, config DBConfig) error {
	conn := NewDBConnector(config)
	if err := conn.Connect(); err != nil {
		return err
	}
	k.connectors[name] = conn
	return nil
}

func (k *Killer) SetAutoKill(enabled bool, threshold time.Duration, dryRun bool) {
	k.mu.Lock()
	defer k.mu.Unlock()
	k.autoKill = enabled
	k.killThreshold = threshold
	k.dryRun = dryRun
}

func (k *Killer) CheckAndKill(ctx context.Context) ([]RunningQuery, error) {
	k.mu.Lock()
	defer k.mu.Unlock()

	if !k.autoKill {
		return nil, nil
	}

	var killedQueries []RunningQuery

	for name, conn := range k.connectors {
		if !conn.IsConnected() {
			continue
		}

		queries, err := conn.GetRunningQueries(ctx)
		if err != nil {
			continue
		}

		for _, q := range queries {
			execTime := time.Duration(q.Time) * time.Second
			if execTime >= k.killThreshold {
				if !k.dryRun {
					if err := conn.KillQuery(ctx, q.ID); err != nil {
						continue
					}
				}
				k.killedCount++
				killedQueries = append(killedQueries, q)
			}
		}
	}

	return killedQueries, nil
}

func (k *Killer) GetKilledCount() uint64 {
	k.mu.Lock()
	defer k.mu.Unlock()
	return k.killedCount
}

func (k *Killer) Close() {
	for _, conn := range k.connectors {
		conn.Close()
	}
}

func FormatConnectionString(serverIP net.IP, serverPort uint16) string {
	return fmt.Sprintf("%s:%d", serverIP, serverPort)
}
