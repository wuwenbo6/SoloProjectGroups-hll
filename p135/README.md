# sFlow 流量分析系统

一个基于 Go + Vue3 的实时 sFlow 流量分析系统，支持 Top N 流量排行、ASN 过滤和历史数据查询。

## 功能特性

- 📡 **sFlow 报文接收**: UDP 6343 端口接收 sFlow v5 报文
- 🔍 **深度解析**: 解析源/目的 IP、端口、协议类型、字节数、包数
- ⚡ **流处理引擎**: 滑动窗口实时统计，支持 Top N IP 对和应用排行
- 📊 **实时图表**: WebSocket 实时推送，ECharts 可视化展示
- 💾 **历史存储**: SQLite 持久化存储，支持历史数据查询
- 🏷️ **ASN 过滤**: 支持按 ASN 过滤流量，内置常用 ASN 库
- 🎨 **现代化 UI**: 深色主题，响应式设计，实时更新

## 系统架构

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  sFlow 报文     │────▶│  UDP 接收器     │────▶│  报文解析器     │
│  (UDP 6343)     │     └─────────────────┘     └─────────────────┘
└─────────────────┘                                  │
                                                     ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  前端展示       │◀────│  WebSocket      │◀────│  流处理引擎     │
│  (Vue3+ECharts) │     │  推送          │     │  (滑动窗口)     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                     │
                                                     ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  历史查询       │────▶│  REST API       │────▶│  SQLite 存储    │
│  (时间范围)     │     │  /api/*         │     │  (持久化)       │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## 快速开始

### 方式一: Docker 部署 (推荐)

```bash
# 克隆项目后执行
chmod +x start-docker.sh
./start-docker.sh

# 或者手动执行
cd frontend && npm install && npm run build && cd ..
docker-compose up -d --build
```

访问: http://localhost

### 方式二: 本地运行

#### 前置要求
- Go 1.21+
- Node.js 18+
- SQLite3

#### 启动

```bash
chmod +x start.sh
./start.sh
```

或者手动分步执行:

```bash
# 1. 构建前端
cd frontend
npm install
npm run build
cd ..

# 2. 构建后端
cd backend
go mod tidy
go build -o sflow-analyzer ./cmd/main.go
cd ..

# 3. 启动服务
mkdir -p data
./backend/sflow-analyzer -mock true
```

访问: http://localhost:8080

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/stats` | 获取系统统计信息 |
| GET | `/api/topn` | 获取实时 Top N 数据 |
| GET | `/api/historical` | 查询历史流记录 |
| GET | `/api/historical/topn` | 查询历史 Top N |
| GET | `/api/historical/traffic` | 查询流量趋势 |
| GET | `/api/asns` | 获取 ASN 列表 |
| POST | `/api/filter/asn` | 设置 ASN 过滤 |
| GET | `/api/filter/asn` | 获取当前 ASN 过滤 |
| POST | `/api/mock` | 发送模拟流量 |
| GET | `/api/ws` | WebSocket 实时数据 |

### API 使用示例

```bash
# 获取实时 Top 10
curl http://localhost:8080/api/topn?limit=10

# 查询最近1小时历史 Top N，过滤 ASN 15169 (Google)
curl "http://localhost:8080/api/historical/topn?start=$(date -u -v-1H +%Y-%m-%dT%H:%M:%SZ)&limit=10&asn=15169"

# 查询流量趋势
curl "http://localhost:8080/api/historical/traffic?start=$(date -u -v-6H +%Y-%m-%dT%H:%M:%SZ)"

# 设置 ASN 过滤
curl -X POST http://localhost:8080/api/filter/asn -H "Content-Type: application/json" -d '{"asn": 15169}'

# 发送模拟流量
curl -X POST http://localhost:8080/api/mock -H "Content-Type: application/json" -d '{"count": 100}'
```

## 命令行参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `-sflow-addr` | `:6343` | sFlow UDP 监听地址 |
| `-http-addr` | `:8080` | HTTP API 监听地址 |
| `-db` | `./sflow.db` | SQLite 数据库路径 |
| `-window` | `5s` | 滑动窗口时间 |
| `-windows` | `60` | 保留窗口数量 |
| `-topn` | `10` | Top N 数量 |
| `-mock` | `true` | 是否启用模拟数据生成 |

## 项目结构

```
p135/
├── backend/                    # Go 后端
│   ├── cmd/
│   │   └── main.go            # 主程序入口
│   ├── internal/
│   │   ├── sflow/              # sFlow 协议解析
│   │   │   ├── parser.go       # 报文解析器
│   │   │   ├── receiver.go     # UDP 接收器
│   │   │   └── asn.go          # ASN 解析器
│   │   ├── stream/             # 流处理引擎
│   │   │   └── processor.go    # 滑动窗口 & Top N
│   │   ├── storage/            # 数据存储
│   │   │   └── sqlite.go       # SQLite 实现
│   │   └── api/                # API 层
│   │       └── server.go       # HTTP & WebSocket
│   └── pkg/
│       └── types/              # 类型定义
│           └── types.go
├── frontend/                   # Vue3 前端
│   ├── src/
│   │   ├── components/         # Vue 组件
│   │   │   ├── StatsOverview.vue
│   │   │   ├── TrafficChart.vue
│   │   │   ├── TopNChart.vue
│   │   │   └── TopNTable.vue
│   │   ├── App.vue             # 主组件
│   │   ├── main.js             # 入口
│   │   ├── api.js              # API 封装
│   │   └── assets/
│   │       └── style.css       # 样式
│   ├── package.json
│   ├── vite.config.js
│   └── index.html
├── docker-compose.yml          # Docker 编排
├── start.sh                    # 本地启动脚本
├── start-docker.sh             # Docker 启动脚本
└── README.md
```

## 配置 sFlow 发送

在网络设备上配置 sFlow 导出到本系统的 UDP 6343 端口。示例 (Cisco):

```
sflow collector 1 ip 192.168.1.100 port 6343
sflow collector 1 datagram-size 1400
sflow sampler 1 rate 100
sflow poller 1 interval 30
```

## 内置 ASN 列表

系统内置了常用的 ASN 映射:

| ASN | 组织 |
|-----|------|
| 15169 | Google LLC |
| 13335 | Cloudflare Inc |
| 14618 | Amazon.com Inc |
| 8075 | Microsoft Corporation |
| 32934 | Facebook Inc |
| 42962 | Netflix Inc |
| 54113 | Fastly Inc |
| 36459 | GitHub Inc |
| 37963 | Alibaba Group |
| 45090 | Tencent Inc |
| 64512 | Private-Use Network |

## 性能指标

- 单核 CPU 可处理 ~100k pps 的 sFlow 报文
- 内存占用: 滑动窗口 60 × 5s = 5分钟数据，约 50MB
- 磁盘占用: 每百万条流记录约 50MB

## 许可证

MIT License
