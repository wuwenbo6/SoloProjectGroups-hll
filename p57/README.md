# 实时行情 K线系统 (Go + RabbitMQ + React)

一个高性能的实时行情展示系统，采用分布式架构，通过 RabbitMQ 的 fanout 交换器实现行情数据的多播分发。

## 🏗️ 系统架构

```
┌─────────────────┐
│  行情模拟服务   │  模拟交易所实时行情数据
│  (Market Feed)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ RabbitMQ Fanout │  广播消息到所有绑定队列
│   Exchange      │
└───────┬─────────┘
        │
   ┌────┴────┐
   ▼         ▼
┌──────┐  ┌──────┐
│Gateway│  │Gateway│  WebSocket 网关（多实例）
└───┬───┘  └───┬───┘
    │           │
    └─────┬─────┘
          ▼
    ┌──────────┐
    │  React   │  前端展示 K线图和实时成交
    │  前端    │
    └──────────┘
```

## ✨ 功能特性

- **实时行情模拟**：模拟 5 个交易对的实时价格变动
- **K线数据聚合**：自动生成 1 分钟 K线数据
- **订单簿 Level 2**：10 档买卖盘口数据实时展示
- **行情快照**：最新价、涨跌、成交量等统计数据
- **Fanout 广播**：RabbitMQ fanout 交换器实现消息多播
- **多网关支持**：可运行多个 WebSocket 网关实例
- **订阅管理**：支持按交易对订阅/取消订阅
- **历史数据**：PostgreSQL 持久化存储历史 K线
- **故障转移**：前端自动切换可用网关
- **快照持久化**：服务重启后恢复行情状态
- **交易导出**：支持 CSV/JSON 格式导出交易日志

## 🛠️ 技术栈

**后端**
- Go 1.21
- Gin (HTTP 框架)
- Gorilla WebSocket
- RabbitMQ (amqp091-go)
- PostgreSQL (pgx)

**前端**
- React 18
- Lightweight Charts (TradingView 开源 K线库)
- WebSocket API

## 📦 前置要求

- Docker & Docker Compose
- Go 1.21+
- Node.js 16+
- npm 或 yarn

## 🚀 快速开始

### 一键启动

```bash
./start.sh
```

该脚本会自动：
1. 启动 RabbitMQ 和 PostgreSQL (Docker)
2. 启动行情模拟服务
3. 启动两个 WebSocket 网关实例
4. 安装前端依赖并启动 React 开发服务器

### 手动启动

#### 1. 启动基础设施

```bash
docker-compose up -d
```

#### 2. 启动行情模拟服务

```bash
cd backend
go mod download
cd cmd/marketfeed
go run main.go
```

#### 3. 启动 WebSocket 网关（第一个实例）

```bash
cd backend/cmd/gateway
go run main.go -port 8081 -instance 1
```

#### 4. 启动 WebSocket 网关（第二个实例，可选）

```bash
cd backend/cmd/gateway
go run main.go -port 8082 -instance 2
```

#### 5. 启动前端

```bash
cd frontend
npm install
npm start
```

## 🌐 访问地址

| 服务 | 地址 | 用户名/密码 |
|------|------|------------|
| 前端页面 | http://localhost:3000 | - |
| RabbitMQ 管理 | http://localhost:15672 | admin / admin123 |
| PostgreSQL | localhost:5432 | trader / trader123 |
| WebSocket 网关 1 | ws://localhost:8081/ws | - |
| WebSocket 网关 2 | ws://localhost:8082/ws | - |

## 📡 WebSocket API

### 消息格式

**订阅交易对**
```json
{
  "action": "subscribe",
  "symbol": "BTCUSDT"
}
```

**取消订阅**
```json
{
  "action": "unsubscribe",
  "symbol": "BTCUSDT"
}
```

**订阅全部**
```json
{
  "action": "subscribe_all"
}
```

**获取历史数据**
```json
{
  "action": "get_history",
  "symbol": "BTCUSDT",
  "interval": "1m"
}
```

### 服务端推送消息

**K线数据**
```json
{
  "type": "kline",
  "data": {
    "symbol": "BTCUSDT",
    "interval": "1m",
    "openTime": 1700000000000,
    "open": 65000.0,
    "high": 65100.0,
    "low": 64900.0,
    "close": 65050.0,
    "volume": 125.5,
    "closeTime": 1700000059999
  }
}
```

**成交数据**
```json
{
  "type": "trade",
  "data": {
    "symbol": "BTCUSDT",
    "price": 65050.0,
    "quantity": 0.5,
    "tradeTime": 1700000000000,
    "isBuyerMaker": false,
    "tradeId": "uuid-string"
  }
}
```

**订单簿 Level 2**
```json
{
  "type": "orderbook",
  "data": {
    "symbol": "BTCUSDT",
    "bids": [
      { "price": 65000.0, "quantity": 1.5 },
      { "price": 64999.0, "quantity": 2.3 }
    ],
    "asks": [
      { "price": 65001.0, "quantity": 1.2 },
      { "price": 65002.0, "quantity": 0.8 }
    ],
    "lastUpdate": 1700000000000
  }
}
```

**行情快照**
```json
{
  "type": "snapshot",
  "data": {
    "symbol": "BTCUSDT",
    "lastPrice": 65000.0,
    "openPrice": 64000.0,
    "highPrice": 65500.0,
    "lowPrice": 63800.0,
    "volume": 1250.5,
    "quoteVolume": 81282500.0,
    "priceChange": 1000.0,
    "changePercent": 1.56,
    "timestamp": 1700000000000
  }
}
```

## 🌐 HTTP API

### 获取订单簿
```
GET /api/orderbook/:symbol
```

### 获取行情快照
```
GET /api/snapshot/:symbol
```

### 获取所有交易对快照
```
GET /api/snapshots
```

### 导出交易日志
```
POST /api/export/trades
Content-Type: application/json

{
  "symbol": "BTCUSDT",
  "format": "csv",
  "startTime": 1700000000000,
  "endTime": 1700086400000
}
```

### 下载导出文件
```
GET /api/export/download/:filename
```

## 📁 项目结构

```
.
├── backend/
│   ├── cmd/
│   │   ├── marketfeed/      # 行情模拟服务
│   │   └── gateway/         # WebSocket 网关
│   ├── internal/
│   │   ├── types/           # 数据类型定义
│   │   ├── rabbitmq/        # RabbitMQ 连接管理
│   │   ├── database/        # PostgreSQL 数据库层
│   │   ├── market/          # 行情模拟器
│   │   └── gateway/         # WebSocket 网关逻辑
│   ├── scripts/
│   │   └── init.sql         # 数据库初始化脚本
│   ├── go.mod
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── App.js           # 主应用组件
│   │   ├── index.js         # 入口文件
│   │   └── index.css        # 样式
│   ├── public/
│   └── package.json
├── docker-compose.yml
├── start.sh
└── README.md
```

## 💡 设计说明

### Fanout 交换器

使用 RabbitMQ 的 fanout 交换器有以下优势：

1. **广播模式**：一条消息发送到交换器，所有绑定的队列都能收到
2. **解耦**：行情生产者不需要知道有多少消费者
3. **水平扩展**：可随时增加新的网关实例

### 多网关架构

每个 WebSocket 网关实例：
- 绑定独立的临时队列到 fanout 交换器
- 维护自己的客户端连接池
- 独立处理订阅逻辑

这种设计支持：
- 负载均衡（可在网关前加 Nginx）
- 高可用（一个实例挂了不影响其他）
- 水平扩展（按需增加实例）

## 🔧 配置说明

### 环境变量 (backend/.env)

```env
RABBITMQ_URL=amqp://admin:admin123@localhost:5672/
DB_URL=postgres://trader:trader123@localhost:5432/market_data?sslmode=disable
MARKET_FEED_PORT=8080
WS_GATEWAY_PORT=8081
WS_GATEWAY_PORT_2=8082
```

### 可用交易对

- BTCUSDT (比特币)
- ETHUSDT (以太坊)
- BNBUSDT (币安币)
- SOLUSDT (Solana)
- XRPUSDT (瑞波币)

## ⚡ 性能优化说明

### 消息积压解决方案

**问题**：网关消费者处理慢导致 RabbitMQ 消息积压

**优化方案**：

1. **多 Worker 并发处理**
   - 4 个 Worker 线程并行消费消息
   - 客户端分组并行发送，提高吞吐量

2. **QoS 预取机制**
   - `channel.Qos(1000, 0, false)` 预取 1000 条消息
   - 减少网络往返，提高消费速度

3. **大容量消息队列**
   - 内部缓冲队列大小：10,000 条
   - 客户端发送缓冲区：512 条
   - 队列溢出时主动丢弃并 Nack

4. **队列参数优化**
   - `x-max-length: 100000` - 最大队列长度
   - `x-overflow: drop-head` - 溢出策略
   - `x-message-ttl: 60000` - 消息过期时间 60 秒

5. **批量发送优化**
   - WebSocket 批量写入最多 10 条待发消息
   - 减少系统调用次数

6. **监控统计**
   - 每 10 秒输出统计信息
   - 监控：客户端数、队列长度、处理数、丢弃数

### 断线数据丢失解决方案

**问题**：WebSocket 断线后重连丢失数据

**优化方案**：

1. **服务端消息缓存**
   - 使用环形缓冲区 (`container/ring`)
   - 缓存最近 1000 条 K线和成交数据
   - 按交易对分别缓存

2. **重连数据补全**
   - 客户端记录断开时间
   - 重连后自动请求 `get_recent` 获取缺失数据
   - 服务端返回断开时间后的所有数据

3. **客户端数据去重**
   - K线：根据 `openTime` 判断是否已存在
   - 成交：根据时间+价格+数量生成唯一键去重

4. **重连状态管理**
   - 最多重试 10 次
   - 每次重试间隔 3 秒
   - 自动切换可用网关

## 📝 注意事项

1. 行情数据为模拟生成，非真实交易所数据
2. K线每分钟生成一个完整的 K 线柱
3. 历史数据最多返回最近 200 条记录
4. WebSocket 连接超时时间为 60 秒（需心跳）
5. 消息缓存最多保留 5 分钟内的数据

## 🤝 扩展建议

- 添加更多时间周期的 K线（5m, 15m, 1h, 4h, 1d）
- 集成真实交易所 API（Binance, OKX 等）
- 添加成交量柱状图
- 添加技术指标（MA, MACD, RSI 等）
- 实现订单簿深度图
- 添加 Redis 缓存热门数据
- 实现 JWT 认证
