# Log Analyzer - 日志分析系统

一个基于 Go + Elasticsearch 的日志分析系统，支持 Syslog/Winlog 接收、规则引擎事件关联、告警和事件链展示。

## 功能特性

- 📥 **多源日志接收**：支持 Syslog (UDP/TCP) 和 Windows Event Log
- 🔍 **Elasticsearch 存储**：高效的日志存储和检索
- 🎯 **规则引擎**：类 Drools 的规则引擎，支持 JavaScript 条件表达式
- 🔗 **事件关联**：支持计数 (count) 和序列 (sequence) 两种关联模式
  - 计数模式：检测指定时间窗口内事件发生次数
  - 序列模式：检测事件序列（如多次失败后成功登录）
- 🚨 **实时告警**：WebSocket 实时推送告警
- 📊 **前端展示**：React 单页应用，展示告警、事件链、规则管理

## 内置规则

1. **暴力破解检测**（高优先级）
   - 检测多次登录失败后成功登录的模式
   - 5分钟时间窗口，序列模式

2. **多次登录失败**（中优先级）
   - 检测同一用户5分钟内超过5次登录失败
   - 计数模式

## 项目结构

```
.
├── cmd/
│   └── server/
│       └── main.go          # 主程序入口
├── internal/
│   ├── api/                 # REST API 和 WebSocket
│   ├── config/              # 配置管理
│   ├── es/                  # Elasticsearch 客户端
│   ├── input/               # 日志输入 (Syslog/Winlog)
│   ├── models/              # 数据模型
│   └── rules/               # 规则引擎
├── frontend/                # React 前端应用
├── docker-compose.yml       # Elasticsearch + Kibana
├── config.yaml              # 配置文件
└── go.mod
```

## 快速开始

### 1. 启动依赖服务

```bash
docker-compose up -d
```

这将启动 Elasticsearch (9200) 和 Kibana (5601)。

### 2. 启动后端服务

```bash
# 安装依赖
go mod download

# 启动服务
go run cmd/server/main.go
```

服务将在以下端口启动：
- HTTP API: 8080
- Syslog: 5140 (UDP/TCP)
- Winlog HTTP: 5985

### 3. 启动前端开发服务

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

访问 http://localhost:3000 查看前端界面。

## API 接口

### 告警管理

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/alerts` | 获取告警列表 |
| GET | `/api/alerts/:id` | 获取告警详情 |
| PUT | `/api/alerts/:id/status` | 更新告警状态 |

### 事件管理

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/events` | 获取事件列表 |
| GET | `/api/events/:id` | 获取事件详情 |

### 规则管理

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/rules` | 获取规则列表 |
| POST | `/api/rules` | 创建规则 |
| GET | `/api/rules/:id` | 获取规则详情 |
| PUT | `/api/rules/:id` | 更新规则 |
| DELETE | `/api/rules/:id` | 删除规则 |

### 模拟接口

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/simulate/login-failed` | 模拟登录失败 |
| POST | `/api/simulate/login-success` | 模拟登录成功 |
| POST | `/api/simulate/brute-force` | 模拟暴力破解攻击 |

### WebSocket

- 路径: `/api/ws`
- 实时接收新告警通知

## 规则配置示例

### 计数模式规则

```json
{
  "name": "多次登录失败检测",
  "description": "5分钟内同一用户登录失败超过5次",
  "severity": "medium",
  "enabled": true,
  "event_type": "login_failed",
  "condition": "true",
  "correlation": {
    "type": "count",
    "group_by_field": "username",
    "time_window_seconds": 300,
    "min_count": 5
  },
  "action": "create_alert"
}
```

### 序列模式规则

```json
{
  "name": "暴力破解成功检测",
  "description": "多次登录失败后成功登录",
  "severity": "high",
  "enabled": true,
  "event_type": "login",
  "condition": "event.type == 'login_failed'",
  "correlation": {
    "type": "sequence",
    "group_by_field": "username",
    "time_window_seconds": 300,
    "event_sequence": [
      { "event_type": "login_failed", "filters": {} },
      { "event_type": "login_success", "filters": {} }
    ]
  },
  "action": "create_alert"
}
```

## 条件表达式

规则条件使用 JavaScript 表达式，支持以下变量：

- `event.type` - 事件类型
- `event.hostname` - 主机名
- `event.source` - 日志来源 (syslog/winlog)
- `event.attributes` - 事件属性（如 username, source_ip 等）

示例：
```javascript
event.type == 'login_failed' && event.attributes.username != 'root'
```

## 发送 Syslog 测试

```bash
# 使用 logger 命令发送 syslog
logger -n localhost -P 5140 -p auth.warning "Failed password for admin from 192.168.1.100"

# 使用 netcat
echo "<34>1 2024-01-01T00:00:00Z server01 sshd - - Failed password for admin" | nc -u localhost 5140
```

## 技术栈

**后端：**
- Go 1.21
- Elasticsearch 8.x
- Gin (HTTP 框架)
- Otto (JavaScript 解释器)
- Zap (日志库)

**前端：**
- React 18
- Vite
- Tailwind CSS
- React Router
- Axios
- Lucide Icons

## 演示

1. 启动所有服务后，访问 http://localhost:3000
2. 点击"模拟暴力破解攻击"按钮
3. 观察告警列表，将看到新生成的告警
4. 点击告警查看事件链详情

## 配置说明

编辑 `config.yaml` 自定义配置：

```yaml
server:
  http_port: 8080      # API 端口
  syslog_port: 5140    # Syslog 端口
  winlog_port: 5985    # Winlog HTTP 端口

elasticsearch:
  url: http://localhost:9200
  index_prefix: log_analyzer

rules:
  default_rules_dir: ./rules
  event_window_seconds: 300  # 事件关联默认窗口

logging:
  level: info
```
