# CoAP Gateway

基于Go实现的CoAP网关服务，支持CoAP over TCP (RFC 8323) 与HTTP REST API的双向转换，以及观察者模式（CoAP Observe -> HTTP SSE）。

## 功能特性

- **CoAP over TCP (RFC 8323) 服务端**：监听CoAP设备连接
- **HTTP REST API 服务端**：前端通过HTTP访问设备
- **双向协议转换**：
  - HTTP请求 -> CoAP请求 -> 设备 -> CoAP响应 -> HTTP响应
  - CoAP通知 -> HTTP SSE事件
- **观察者模式**：CoAP Observe 订阅转换为 HTTP SSE 推送
- **路由管理**：SQLite数据库存储设备路由表
- **设备管理**：设备注册、在线状态管理

## 架构设计

```
┌─────────────┐         ┌───────────────┐         ┌─────────────┐
│   HTTP      │  HTTP   │   Gateway     │  CoAP   │   CoAP      │
│   Client    │────────▶│   (HTTP API)  │────────▶│   Device    │
│             │         │               │         │             │
│  (Browser)  │◀────────│ (CoAP Server) │◀────────│ (Sensor/    │
│             │   SSE   │               │ Observe │  Actuator)  │
└─────────────┘         └───────────────┘         └─────────────┘
```

## 目录结构

```
.
├── cmd/
│   ├── gateway/              # 网关主程序
│   │   └── main.go
│   └── device-simulator/     # CoAP设备模拟器
│       └── main.go
├── internal/
│   ├── config/               # 配置管理
│   ├── database/             # 数据库层
│   ├── coap/                 # CoAP服务
│   │   ├── server.go
│   │   └── observe.go
│   ├── http/                 # HTTP服务
│   │   └── server.go
│   ├── converter/            # 协议转换器
│   └── models/               # 数据模型
├── pkg/
│   └── utils/                # 工具函数
├── config.yaml               # 配置文件
├── go.mod
└── README.md
```

## 快速开始

### 安装Go

```bash
# macOS
brew install go

# 或从官网下载
# https://go.dev/dl/
```

### 构建项目

```bash
# 安装依赖
go mod download

# 构建网关
go build -o bin/gateway ./cmd/gateway

# 构建设备模拟器
go build -o bin/device-simulator ./cmd/device-simulator
```

### 运行网关

```bash
# 使用默认配置
./bin/gateway

# 指定配置文件
./bin/gateway -config ./config.yaml
```

### 运行设备模拟器

```bash
# 启动设备1
./bin/device-simulator -device-id dev-001 -gateway 127.0.0.1:5683

# 启动设备2（另一个终端）
./bin/device-simulator -device-id dev-002 -gateway 127.0.0.1:5683
```

## API 文档

### 1. 健康检查

```http
GET /api/health
```

响应：
```json
{
  "status": "ok",
  "time": "2024-01-01T00:00:00Z"
}
```

### 2. 设备管理

#### 列出所有设备

```http
GET /api/devices
```

#### 获取单个设备

```http
GET /api/devices/:id
```

#### 创建设备

```http
POST /api/devices
Content-Type: application/json

{
  "device_id": "dev-001",
  "name": "Temperature Sensor",
  "type": "sensor"
}
```

### 3. 路由管理

#### 列出所有路由

```http
GET /api/routes
```

#### 创建路由

```http
POST /api/routes
Content-Type: application/json

{
  "device_id": "dev-001",
  "coap_path": "/sensor/temperature",
  "http_path": "/api/v1/devices/dev-001/temperature",
  "method": "GET",
  "description": "Get temperature from device",
  "is_observable": true
}
```

#### 删除路由

```http
DELETE /api/routes/:id
```

### 4. 动态路由访问（HTTP -> CoAP）

创建路由后，可以通过HTTP访问设备资源：

```http
# 读取温度传感器
GET /api/v1/devices/dev-001/temperature

# 控制设备
POST /api/v1/devices/dev-001/actuator
Content-Type: application/json

{"action": "on"}
```

### 5. SSE 观察者模式

```http
GET /api/sse/devices/:id/:path
Accept: text/event-stream
```

示例：
```bash
curl -N http://localhost:8080/api/sse/devices/dev-001/sensor/temperature
```

响应（SSE事件流）：
```
event: connected
data: Subscribed to device dev-001, path /sensor/temperature

event: device_data
id: 12345
data: {"device_id":"dev-001","path":"/sensor/temperature","payload":"{\"temperature\":22.5}","timestamp":12345}

event: device_data
id: 12346
data: {"device_id":"dev-001","path":"/sensor/temperature","payload":"{\"temperature\":23.0}","timestamp":12346}
```

### 6. 统计信息

```http
GET /api/stats
```

响应：
```json
{
  "connected_devices": 2,
  "observe_subscriptions": 3,
  "sse_subscribers": 5
}
```

### 7. 订阅列表

```http
GET /api/subscriptions
```

## CoAP 设备协议

### 设备注册

设备连接后需要发送注册请求：

```coap
METHOD: POST
PATH: /register
QUERY: id=dev-001
```

### CoAP Observe 订阅

```coap
METHOD: GET
PATH: /sensor/temperature
OBSERVE: 0
```

### 取消订阅

```coap
METHOD: GET
PATH: /sensor/temperature
OBSERVE: 1
```

## 配置说明

```yaml
server:
  coap:
    tcp:
      host: "0.0.0.0"
      port: 5683
    udp:
      host: "0.0.0.0"
      port: 5683
  http:
    host: "0.0.0.0"
    port: 8080

database:
  path: "./coap_gateway.db"

gateway:
  timeout: 30                    # 请求超时时间（秒）
  max_connections: 1000          # 最大连接数
  observe_timeout: 3600          # Observe订阅超时时间（秒）

log:
  level: "debug"                 # debug, info, warn, error
  format: "console"              # console, json
```

## 使用示例

### 完整工作流程

1. **启动网关**
```bash
./bin/gateway
```

2. **注册设备（设备端）**
```bash
# 启动设备模拟器
./bin/device-simulator -device-id dev-001
```

3. **创建路由（管理端）**
```bash
curl -X POST http://localhost:8080/api/routes \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "dev-001",
    "coap_path": "/sensor/temperature",
    "http_path": "/api/v1/devices/dev-001/temp",
    "method": "GET",
    "is_observable": true
  }'
```

4. **HTTP 访问设备（前端）**
```bash
# 单次请求
curl http://localhost:8080/api/v1/devices/dev-001/temp

# 响应：{"temperature":22.5,"unit":"C"}
```

5. **SSE 实时订阅（前端）**
```bash
curl -N http://localhost:8080/api/sse/devices/dev-001/sensor/temperature

# 实时接收设备推送的数据
```

## 数据库表结构

### devices 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | 主键 |
| device_id | TEXT | 设备唯一标识 |
| name | TEXT | 设备名称 |
| type | TEXT | 设备类型 |
| status | TEXT | 在线状态 |
| last_seen | DATETIME | 最后活跃时间 |
| remote_addr | TEXT | 远程地址 |
| protocol | TEXT | 协议类型 |

### routes 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | 主键 |
| device_id | TEXT | 关联设备ID |
| coap_path | TEXT | CoAP资源路径 |
| http_path | TEXT | HTTP访问路径 |
| method | TEXT | HTTP方法 |
| description | TEXT | 描述 |
| is_observable | BOOLEAN | 是否支持观察 |

### observe_subscriptions 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | 主键 |
| route_id | TEXT | 关联路由ID |
| device_id | TEXT | 设备ID |
| coap_path | TEXT | CoAP路径 |
| token | TEXT | CoAP令牌 |
| sequence_number | INTEGER | 序列号 |
| status | TEXT | 订阅状态 |
| expires_at | DATETIME | 过期时间 |

## 依赖库

- [gin-gonic/gin](https://github.com/gin-gonic/gin) - HTTP Web框架
- [plgd-dev/go-coap](https://github.com/plgd-dev/go-coap) - CoAP协议库
- [mattn/go-sqlite3](https://github.com/mattn/go-sqlite3) - SQLite驱动
- [spf13/viper](https://github.com/spf13/viper) - 配置管理
- [uber-go/zap](https://github.com/uber-go/zap) - 日志库
- [google/uuid](https://github.com/google/uuid) - UUID生成

## License

MIT
