# STUN/TURN 服务器监控服务

一个基于 Go 语言实现的 STUN/TURN 服务器监控服务，支持通过管理端口 API 或日志解析获取服务器状态，并提供 Web 界面展示折线图。数据持久化存储到 InfluxDB。

## 功能特性

- **多种数据采集方式**：
  - 通过管理端口 API 采集（如 `http://localhost:3478/status`）
  - 通过解析服务器日志文件采集
- **告警规则**：
  - 会话数超阈值告警
  - 多级告警级别（warning、error、critical）
  - 告警冷却机制
  - 告警标记已解决
- **报告导出**：
  - 生成 JSON 格式报告
  - 支持导出指定时间范围数据
  - 包含统计摘要和告警信息
- **时间解析**：
  - 统一使用 RFC3339 格式
  - 支持多种时间格式变体（Nginx 格式、ISO 格式等）
  - 自动检测和解析日志中的时间戳
- **数据持久化**：
  - 使用 InfluxDB 2.x 存储时序数据
  - 支持长期数据保留和历史查询
- **监控指标**：
  - 当前会话数
  - 总流量（入站/出站）
  - IP 分布统计
- **Web 监控面板**：
  - 实时数据展示
  - 会话数趋势折线图
  - 流量趋势折线图
  - IP 分布排行
  - 告警记录展示
  - 支持多服务器切换
  - 固定时间范围查询（15分钟、1小时、6小时、24小时、7天、30天）

## 项目结构

```
.
├── cmd/
│   ├── monitor/          # 监控服务主程序
│   └── mock-server/      # 模拟 STUN/TURN 服务器（用于测试）
├── internal/
│   ├── config/           # 配置管理
│   ├── scraper/          # 数据采集模块
│   │   ├── types.go      # 数据类型定义
│   │   ├── api_scraper.go   # API 采集器
│   │   ├── log_scraper.go   # 日志解析采集器
│   │   └── manager.go    # 采集管理器
│   ├── store/            # InfluxDB 存储模块
│   ├── server/           # HTTP API 服务
│   └── timeparser/       # 时间解析模块（支持 RFC3339 及多种变体）
├── static/
│   └── index.html        # 前端监控面板
├── config.yaml           # 配置文件示例
├── go.mod
└── README.md
```

## 快速开始

### 前置条件

- Go 1.21+
- InfluxDB 2.x (运行在 localhost:8086)

### 1. 编译项目

```bash
# 下载依赖
go mod download

# 编译监控服务
go build -o bin/monitor ./cmd/monitor

# 编译模拟服务器（可选，用于测试）
go build -o bin/mock-server ./cmd/mock-server
```

### 2. 配置

修改 `config.yaml` 文件：

```yaml
server:
  listen_addr: ":8080"
  scrape_interval: 10s

influxdb:
  url: "http://localhost:8086"
  token: "my-token"
  org: "my-org"
  bucket: "stun-monitor"

stun_servers:
  - name: "coturn-1"
    type: "api"
    api_url: "http://localhost:3478/status"
    timeout: 5s
  - name: "coturn-2"
    type: "log"
    log_path: "/var/log/turnserver.log"

frontend:
  enable: true
  static_dir: "./static"
```

### 3. 运行

#### 方式一：使用模拟服务器测试

```bash
# 启动模拟 STUN/TURN 服务器
./bin/mock-server -addr :3478

# 启动监控服务
./bin/monitor -config config.yaml
```

#### 方式二：监控真实服务器

确保你的 STUN/TURN 服务器（如 coturn）已启用管理 API 或配置了日志文件，然后修改配置文件后运行：

```bash
./bin/monitor -config config.yaml
```

### 4. 访问监控面板

打开浏览器访问 `http://localhost:8080`

## API 接口

- `GET /api/servers` - 获取所有监控的服务器列表
- `GET /api/metrics/latest` - 获取所有服务器最新指标
- `GET /api/metrics/latest?server=<name>` - 获取指定服务器最新指标
- `GET /api/metrics/history?server=<name>&duration=1h` - 获取指定服务器历史数据（固定时间范围）
- `GET /api/metrics/range?server=<name>&start=<time>&end=<time>` - 获取指定时间范围的历史数据
- `GET /api/metrics/ip-distribution?server=<name>&duration=1h` - 获取 IP 分布统计
- `GET /api/time-ranges` - 获取支持的固定时间范围
- `GET /health` - 健康检查

### 固定时间范围参数

| 参数 | 说明 |
|------|------|
| 15m | 最近15分钟 |
| 1h | 最近1小时 |
| 6h | 最近6小时 |
| 24h | 最近24小时 |
| 7d | 最近7天 |
| 30d | 最近30天 |

## 数据格式

### API 采集格式（STUN/TURN 服务器需返回）

```json
{
  "session_count": 128,
  "total_bytes_in": 1073741824,
  "total_bytes_out": 2147483648,
  "ip_distribution": {
    "192.168.1.100": 45,
    "10.0.0.50": 32
  }
}
```

### 日志解析

日志解析器支持多种时间格式，通过 RFC3339 兼容的正则表达式自动识别：

支持的时间格式示例：
- `2024-01-15T10:30:00Z` (RFC3339)
- `2024-01-15T10:30:00+08:00` (RFC3339 with timezone)
- `2024-01-15T10:30:00.123456` (RFC3339 with microseconds)
- `2024-01-15 10:30:00` (ISO format)
- `15/Jan/2024:10:30:00 +0000` (Nginx format)
- `2024/01/15 10:30:00` (Slash format)
- `Jan 15 10:30:00` (Syslog format)

日志解析器通过正则表达式匹配以下模式：

- 会话创建：`session <id> created`
- 流量统计：`bytes_in=<value> bytes_out=<value>`
- 客户端 IP：`client <ip-address>`

## InfluxDB 数据结构

数据存储为三个 measurement：

### stun_session
- Tags: `server`
- Fields: `session_count` (integer)

### stun_traffic
- Tags: `server`
- Fields: `bytes_in` (integer), `bytes_out` (integer)

### stun_ip_distribution
- Tags: `server`, `ip`
- Fields: `count` (integer)

## 配置说明

### 服务器配置

| 参数 | 说明 | 默认值 |
|------|------|--------|
| listen_addr | 监控服务监听地址 | :8080 |
| scrape_interval | 数据采集间隔 | 10s |

### InfluxDB 配置

| 参数 | 说明 | 默认值 |
|------|------|--------|
| url | InfluxDB 连接地址 | http://localhost:8086 |
| token | 认证 Token | my-token |
| org | 组织名称 | my-org |
| bucket | 存储桶名称 | stun-monitor |

### STUN 服务器配置

| 参数 | 说明 |
|------|------|
| name | 服务器名称（用于展示） |
| type | 采集类型：api 或 log |
| api_url | API 采集时的状态地址 |
| timeout | API 请求超时时间 |
| log_path | 日志文件路径 |

### 告警配置

| 参数 | 说明 | 默认值 |
|------|------|--------|
| enabled | 是否启用告警 | true |
| max_alerts | 最大保留告警数 | 1000 |
| rules | 告警规则列表 | - |

### 告警规则配置

| 参数 | 说明 |
|------|------|
| server_name | 服务器名称（空表示所有服务器） |
| session_threshold | 会话数阈值 |
| level | 告警级别：warning / error / critical |
| duration | 持续时间（预留） |
| cooldown | 告警冷却时间 |

告警配置示例：
```yaml
alert:
  enabled: true
  max_alerts: 1000
  rules:
    - server_name: ""
      session_threshold: 1000
      level: "warning"
      duration: 5m
      cooldown: 5m
    - server_name: ""
      session_threshold: 5000
      level: "error"
      duration: 5m
      cooldown: 10m
    - server_name: ""
      session_threshold: 10000
      level: "critical"
      duration: 1m
      cooldown: 15m
```

## 开发说明

### 本地开发

```bash
# 运行模拟服务器
go run ./cmd/mock-server

# 运行监控服务
go run ./cmd/monitor -config config.yaml
```

### 添加新的采集方式

实现 `scraper.Scraper` 接口：

```go
type Scraper interface {
    Scrape() (*Metrics, error)
    Name() string
}
```

然后在 `scraper/manager.go` 中注册新的采集器类型。

### 时间解析

使用 `timeparser` 包解析多种时间格式：

```go
import "stun-turn-monitor/internal/timeparser"

t, err := timeparser.Parse("2024-01-15T10:30:00Z")
t, err := timeparser.Parse("15/Jan/2024:10:30:00 +0000")
t, err := timeparser.ParseWithLocation("2024-01-15 10:30:00", time.UTC)
```

## License

MIT
