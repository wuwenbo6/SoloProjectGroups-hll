# dbprobe - eBPF-based Database Query Monitor

`dbprobe` is a high-performance CLI tool that uses eBPF (extended Berkeley Packet Filter) to monitor MySQL and PostgreSQL database queries at the kernel level. It captures slow queries, extracts SQL statements, and exports metrics to Prometheus.

## Features

- **eBPF-powered**: Low-overhead kernel-level tracing using kprobes
- **Dual database support**: Works with both MySQL (port 3306) and PostgreSQL (port 5432)
- **TLS Encryption Support**: Monitor encrypted connections using uprobes
- **SQL Analysis & Index Suggestions**: Automatically analyze slow queries and suggest indexes
- **Auto-Kill Stuck Queries**: Automatically terminate long-running queries
- **Slow Query Log Export**: Export logs in multiple formats (MySQL, PostgreSQL, CSV, JSON)
- **Log Rotation**: Automatic log rotation with configurable size and count
- **Prometheus integration**: Exports metrics for monitoring and alerting
- **Real-time output**: Console output with detailed query information
- **Ring Buffer**: High-performance ring buffer for high-concurrency scenarios
- **Loss Detection**: Built-in event loss detection and statistics

## Requirements

- Linux kernel >= 5.8 (with BPF and kprobe support)
- Root privileges (required for loading eBPF programs)
- Clang/LLVM 14+ (for compiling eBPF programs)
- Go 1.21+

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd dbprobe

# Install dependencies
make deps

# Build the project
make build
```

## Usage

### Basic Usage (Plaintext Connections)

```bash
# Monitor with default 100ms threshold
sudo ./dbprobe

# Monitor with custom threshold (e.g., 500ms)
sudo ./dbprobe -t 500ms

# Show all queries, not just slow ones
sudo ./dbprobe -a

# Custom Prometheus exporter address
sudo ./dbprobe -p :9100
```

### TLS Encrypted Connections

**Method 1: Hook database internal functions (Recommended)**

This captures queries directly from the database process before encryption:

```bash
# MySQL - hook dispatch_command function
sudo ./dbprobe --uprobe-mysql --mysql-binary /usr/sbin/mysqld

# PostgreSQL - hook exec_simple_query function
sudo ./dbprobe --uprobe-postgres --postgres-binary /usr/bin/postgres
```

**Method 2: Hook SSL library functions**

This captures data after SSL decryption:

```bash
# Find your OpenSSL library path
ldconfig -p | grep libssl

# Hook SSL_read/SSL_write
sudo ./dbprobe --uprobe-ssl --ssl-binary /usr/lib/x86_64-linux-gnu/libssl.so.3
```

### SQL Analysis & Index Suggestions

```bash
# Enabled by default, shows index suggestions for slow queries
sudo ./dbprobe

# Disable analysis
sudo ./dbprobe --no-analysis --no-index-suggest
```

### Slow Query Log Export

```bash
# Export in MySQL slow log format (default)
sudo ./dbprobe --slowlog --slowlog-path ./slowquery.log

# Export in PostgreSQL format
sudo ./dbprobe --slowlog --slowlog-format postgres

# Export as CSV for analysis in spreadsheet
sudo ./dbprobe --slowlog --slowlog-format csv

# Export as JSON
sudo ./dbprobe --slowlog --slowlog-format json

# Custom rotation: 50MB files, keep 10 rotations
sudo ./dbprobe --slowlog --slowlog-rotation 52428800 --slowlog-rotation-count 10
```

### Auto-Kill Long-Running Queries

```bash
# Dry-run mode (recommended to test first - doesn't actually kill)
sudo ./dbprobe --auto-kill --auto-kill-threshold 5m \
  --auto-kill-db-type mysql --auto-kill-host 127.0.0.1 \
  --auto-kill-user root --auto-kill-password secret

# Actual kill mode (use with caution!)
sudo ./dbprobe --auto-kill --auto-kill-dry-run=false \
  --auto-kill-threshold 10m --auto-kill-check-interval 1m \
  --auto-kill-db-type postgres --auto-kill-port 5432 \
  --auto-kill-user postgres
```

### Combined Mode (All Features)

```bash
sudo ./dbprobe \
  --threshold 100ms \
  --uprobe-mysql \
  --slowlog --slowlog-path /var/log/dbprobe/slow.log \
  --slowlog-format mysql \
  --auto-kill --auto-kill-threshold 5m \
  --auto-kill-db-type mysql \
  --auto-kill-user root \
  --auto-kill-password ${DB_PASSWORD}
```

### Command Line Options

```
Basic Options:
  -t, --threshold duration      Threshold for slow query detection (default 100ms)
  -p, --prometheus string       Prometheus metrics exporter address (default ":9090")
  -a, --all                     Show all queries, not just slow ones
  -f, --format string           Output format: text, json (default "text")

Tracing Options:
      --kprobes                 Enable kernel probes (default true)
      --uprobe-ssl              Enable SSL uprobes (SSL_read/SSL_write)
      --uprobe-mysql            Enable MySQL function uprobes (dispatch_command)
      --uprobe-postgres         Enable PostgreSQL function uprobes (exec_simple_query)
      --mysql-binary string     Path to MySQL binary (default "/usr/sbin/mysqld")
      --postgres-binary string  Path to PostgreSQL binary (default "/usr/bin/postgres")
      --ssl-binary string       Path to SSL library

Analysis Options:
      --analysis                Enable SQL query analysis (default true)
      --index-suggest           Show index suggestions for slow queries (default true)

Slow Log Options:
      --slowlog                  Enable slow query log export
      --slowlog-path string      Slow query log file path (default "./slowquery.log")
      --slowlog-format string    Format: mysql, postgres, csv, json (default "mysql")
      --slowlog-rotation int     Rotation size in bytes (default 100MB)
      --slowlog-rotation-count int  Number of rotated files (default 5)

Auto-Kill Options:
      --auto-kill                Enable auto-kill for long-running queries
      --auto-kill-threshold duration  Kill queries running longer than this (default 5m)
      --auto-kill-dry-run        Dry-run mode (default true)
      --auto-kill-db-type        Database type: mysql, postgres (default "mysql")
      --auto-kill-host string    Database host (default "127.0.0.1")
      --auto-kill-port int       Database port (default 3306)
      --auto-kill-user string    Database user (default "root")
      --auto-kill-password       Database password
      --auto-kill-db string      Database name
      --auto-kill-interval duration  Check interval (default 30s)

Statistics Options:
      --stats                    Show periodic statistics (default true)
      --stats-interval duration  Statistics display interval (default 10s)
```

## Output Examples

### Console Output with Analysis

```
[14:30:45.123] ⚠️ SLOW [kernel_kprobe]
  Duration: 245.3ms
  Database: mysql (mydb)
  Client:   192.168.1.100:54321
  Server:   192.168.1.50:3306
  Process:  mysql (PID: 12345)
  SQL:      SELECT u.*, o.order_date FROM users u JOIN orders o ON u.id = o.user_id WHERE o.status = 'pending' ORDER BY o.order_date DESC
  💡 建议 #1 (置信度: 高)
     表: users
     列: id, status
     原因: WHERE/JOIN 条件涉及 2 列，建议创建复合索引
  💡 建议 #2 (置信度: 中)
     表: orders
     列: status, order_date
     原因: WHERE + ORDER BY 组合查询，建议创建覆盖索引避免文件排序

📊 Stats: Total=156 Slow=12 | Kernel=120 Uprobe=36 SSL=0 | Lost=0 | Killed=2
```

### MySQL Slow Log Format

```
# Time: 2024-01-15T14:30:45.123456Z
# User@Host: mysql[mysql] @ 192.168.1.100 [192.168.1.100]
# Schema:   mydb
# Query_time: 0.245300  Lock_time: 0.000000 Rows_sent: 0  Rows_examined: 0
# DB_type: mysql
# Server: 192.168.1.50:3306
# Index suggestions: 2
#   1. Table: users, Columns: id, status - WHERE/JOIN 条件涉及 2 列
#   2. Table: orders, Columns: status, order_date - WHERE + ORDER BY 组合查询
SET timestamp=1705329045;
SELECT u.*, o.order_date FROM users u JOIN orders o ON u.id = o.user_id WHERE o.status = 'pending' ORDER BY o.order_date DESC;
```

### Auto-Kill Output

```
🔫 Auto-killed 2 long-running queries:
  - ID: 1234, User: app_user, Time: 325s, SQL: SELECT * FROM huge_table WHERE ...
  - ID: 1235, User: report_user, Time: 612s, SQL: SELECT COUNT(*) FROM ... JOIN ...
```

## SQL Analysis & Index Suggestions

The built-in analyzer examines queries and provides:

### Analysis Features

| Feature | Description |
|---------|-------------|
| Query Type Detection | SELECT, INSERT, UPDATE, DELETE, etc. |
| Table Extraction | Identifies all tables involved |
| Column Analysis | Extracts WHERE, JOIN, ORDER BY, GROUP BY columns |
| Pattern Detection | Detects SELECT *, missing WHERE, full scans |
| Complexity Rating | Rates query complexity |

### Index Suggestion Logic

1. **WHERE + JOIN Columns**: Suggest composite indexes for filter conditions
2. **WHERE + ORDER BY**: Suggest covering indexes to avoid filesort
3. **GROUP BY Columns**: Suggest indexes to speed up grouping
4. **Multi-table Joins**: Remind to check join column indexes

### Confidence Levels

- **High**: Strong signal from query patterns
- **Medium**: Good suggestion but verify with EXPLAIN
- **Low**: General recommendation, needs schema context

## Auto-Kill Feature

### Safety Features

1. **Dry-Run Mode (Default)**: Never actually kills queries, just logs
2. **Configurable Threshold**: Only kill queries exceeding your threshold
3. **Check Interval**: Control how frequently to check (default 30s)

### Best Practices

1. Always test with `--auto-kill-dry-run=true` first
2. Start with a high threshold (e.g., 30 minutes) and gradually lower
3. Monitor the killed queries count in stats
4. Use dedicated low-privilege user for kill operations

### Required Permissions

**MySQL**: `PROCESS` and `SUPER` or `CONNECTION_ADMIN` privileges

**PostgreSQL**: `pg_signal_backend` role or superuser

## Slow Log Formats

### MySQL Format
Compatible with `mysqldumpslow` and `pt-query-digest` tools.

### PostgreSQL Format
Matches PostgreSQL's standard log format.

### CSV Format
```
timestamp,query_time,db_type,database,client_ip,server_ip,sql
"2024-01-15T14:30:45.123Z",0.245300,mysql,mydb,192.168.1.100,192.168.1.50,"SELECT * FROM users"
```

### JSON Format
```json
{
  "timestamp": "2024-01-15T14:30:45.123Z",
  "query_time": 0.2453,
  "db_type": "mysql",
  "database": "mydb",
  "client_ip": "192.168.1.100",
  "server_ip": "192.168.1.50",
  "sql": "SELECT * FROM users",
  "is_ssl": false,
  "over_threshold": true,
  "suggestions": [...]
}
```

## Prometheus Metrics

The following metrics are exported at `http://localhost:9090/metrics`:

| Metric Name | Type | Description |
|-------------|------|-------------|
| `dbprobe_queries_total` | Counter | Total number of database queries observed |
| `dbprobe_query_duration_seconds` | Histogram | Query execution duration distribution |
| `dbprobe_slow_queries_total` | Counter | Total number of slow queries (over threshold) |
| `dbprobe_active_connections` | Gauge | Number of active database connections |
| `dbprobe_lost_events_total` | Counter | Total number of lost events (ring buffer overflow) |

All metrics include labels for `db_type`, `database`, `client_ip`, and `server_ip`.

## How It Works

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Kernel Space                               │
│  ┌──────────┐     ┌──────────┐     ┌─────────────────────────────────┐  │
│  │ kprobe   │────▶│ eBPF     │────▶│ BPF Ring Buffer (64MB default) │  │
│  │ uprobe   │     │ Program  │     │                                 │  │
│  └──────────┘     └──────────┘     └──────────────┬──────────────────┘  │
└───────────────────────────────────────────────────┼─────────────────────┘
                                                    │
┌───────────────────────────────────────────────────┼─────────────────────┐
│                              User Space           │                     │
│  ┌──────────┐     ┌──────────┐     ┌─────────────▼───────────────┐     │
│  │ Protocol │◀────│ Tracker  │◀────│ Go eBPF Ringbuf Reader      │     │
│  │ Parser   │     │          │     │ (multiple goroutines)       │     │
│  └────┬─────┘     └────┬─────┘     └─────────────────────────────┘     │
│       │                │                                               │
│  ┌────▼─────┐     ┌────▼─────────┐     ┌─────────────────────────┐     │
│  │ Analyzer │     │ Console      │────▶│ Slow Log Exporter       │     │
│  │ (Index)  │     │ Output       │     │ (MySQL/PG/CSV/JSON)     │     │
│  └────┬─────┘     └──────────────┘     └─────────────────────────┘     │
│       │                                                                 │
│  ┌────▼─────┐     ┌─────────────────┐     ┌─────────────────────────┐  │
│  │ Auto-Kill│     │ Prometheus      │     │ Database Connector      │  │
│  │ (Killer) │     │ Exporter        │     │ (for processlist)       │  │
│  └──────────┘     └─────────────────┘     └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

## High Concurrency Performance Tuning

If you see "ring buffer full" warnings, try these optimizations:

### 1. Use Direct Uprobes (Best for TLS)

Direct uprobes have the lowest overhead and highest throughput:

```bash
# Highest performance - hook database functions directly
sudo ./dbprobe --no-kprobes --uprobe-mysql
```

### 2. Reduce Processing Overhead

- Only monitor slow queries (omit `-a` flag)
- Disable analysis: `--no-analysis --no-index-suggest`
- Disable statistics: `--no-stats`

### 3. Understanding Loss Rates

- **< 0.1%**: Normal for high concurrency
- **0.1-1%**: Acceptable for most use cases
- **> 1%**: Consider tuning or using uprobes

## Troubleshooting

### "Permission denied" error

Ensure you're running with root privileges:
```bash
sudo ./dbprobe
```

### "Error loading BPF objects"

Check kernel version and BPF configuration:
```bash
# Check kernel version
uname -r

# Verify BPF support
zcat /proc/config.gz | grep -E 'CONFIG_BPF|CONFIG_KPROBE|CONFIG_BPF_SYSCALL'
```

### No queries captured (plaintext)

- Verify database is running on standard ports (3306/5432)
- Check firewall/network configuration
- Ensure traffic is TCP-based

### No queries captured (TLS)

- Verify you're using `--uprobe-mysql` or `--uprobe-postgres`
- Check binary paths match your system:
  ```bash
  which mysqld
  which postgres
  ```

### Auto-kill not working

- Verify database connection and credentials
- Check user has sufficient privileges
- Test with dry-run mode first

### Slow log not written

- Check directory permissions
- Verify disk space
- Check log rotation settings

## Limitations

- Only works on Linux with kernel >= 5.8
- Requires root privileges
- Index suggestions are heuristic-based, always verify with EXPLAIN
- Large queries may be truncated (4KB default)
- Prepared statement parameters may not be fully resolved

## Development

```bash
# Run tests
make test

# Format code
make fmt

# Run linter
make lint

# Clean build artifacts
make clean

# Generate eBPF Go bindings
make generate
```

## License

Dual BSD/GPL (required for eBPF programs)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
