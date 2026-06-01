# LISP Map-Server (Go + LISP 库)

一个基于Go语言实现的LISP（Locator/ID Separation Protocol）映射服务器（Map-Server），支持响应Map-Request消息并转发Map-Reply消息。包含Web前端用于展示和管理EID到RLOC的映射表。

## 项目结构

```
p276/
├── cmd/
│   ├── server/          # 服务器主程序
│   │   └── main.go
│   └── client/          # LISP协议测试客户端
│       └── main.go
├── internal/
│   ├── lisp/            # LISP协议编解码库
│   │   └── lisp.go
│   ├── mapserver/       # 映射服务器核心逻辑
│   │   └── mapserver.go
│   ├── server/          # UDP服务器实现
│   │   └── udp_server.go
│   └── api/             # HTTP API接口
│       └── api.go
├── web/                 # 前端页面
│   └── index.html
├── go.mod
└── README.md
```

## 功能特性

### 后端功能
- ✅ LISP协议Map-Request消息解码
- ✅ LISP协议Map-Reply消息编码
- ✅ UDP服务器监听端口4342（LISP控制端口）
- ✅ EID-RLOC映射存储与查询
- ✅ 支持CIDR前缀匹配
- ✅ 多RLOC支持（优先级、权重）
- ✅ 请求统计与缓存命中率统计
- ✅ RESTful API接口

### 前端功能
- ✅ 美观的渐变UI设计
- ✅ EID-RLOC映射表展示
- ✅ 实时服务器统计信息
- ✅ EID查询功能
- ✅ 添加/删除映射
- ✅ 响应式设计，支持移动端
- ✅ 自动刷新统计数据

## 快速开始

### 环境要求
- Go 1.16+

### 编译项目

```bash
# 下载依赖
go mod tidy

# 编译服务器
go build -o bin/server ./cmd/server

# 编译测试客户端
go build -o bin/client ./cmd/client
```

### 启动服务器

```bash
./bin/server
```

服务器启动后：
- UDP (LISP控制): `:4342`
- HTTP API/Web UI: `http://localhost:8080`

### 使用Web界面

打开浏览器访问 `http://localhost:8080`，你将看到：

1. **统计面板**：显示总请求数、总回复数、缓存命中/未命中、命中率、运行时间
2. **映射表**：展示所有EID-RLOC映射
3. **查询功能**：输入EID地址查询对应的RLOC
4. **添加映射**：点击"+ 添加映射"按钮添加新的EID-RLOC映射
5. **删除映射**：点击每行的"删除"按钮删除映射

### 使用测试客户端

```bash
# 查询默认EID (10.1.1.1)
./bin/client

# 查询指定EID
./bin/client -eid 10.1.1.2

# 指定服务器地址
./bin/client -server 192.168.1.100:4342 -eid 10.1.1.1

# 完整参数
./bin/client \
  -server 127.0.0.1:4342 \
  -eid 10.1.1.1 \
  -source 192.168.1.1 \
  -itr 192.168.1.1 \
  -timeout 5
```

## API接口

### 获取所有映射
```
GET /api/mappings
```

响应示例：
```json
{
  "success": true,
  "data": [
    {
      "eid": "10.1.1.1",
      "eid_mask_len": 32,
      "rlocs": [
        {"ip": "192.168.1.10", "priority": 1, "weight": 100}
      ],
      "ttl": 1440,
      "query_count": 0
    }
  ]
}
```

### 查询EID映射
```
GET /api/query?eid=10.1.1.1
```

### 添加映射
```
POST /api/mappings/add
Content-Type: application/json

{
  "eid": "10.3.0.1",
  "mask_len": 32,
  "ttl": 1440,
  "rlocs": [
    {"ip": "192.168.5.10", "priority": 1, "weight": 100}
  ]
}
```

### 删除映射
```
POST /api/mappings/delete
Content-Type: application/json

{
  "eid": "10.3.0.1",
  "mask_len": 32
}
```

### 获取服务器统计
```
GET /api/stats
```

响应示例：
```json
{
  "success": true,
  "data": {
    "total_requests": 10,
    "total_replies": 5,
    "cache_hits": 8,
    "cache_misses": 2,
    "hit_rate": "80.00%",
    "uptime": "5m30s",
    "start_time": "2024-01-01T00:00:00Z"
  }
}
```

## 默认映射数据

服务器启动时预置以下映射：

| EID          | 掩码 | RLOCs                                  |
|--------------|------|----------------------------------------|
| 10.1.1.1     | /32  | 192.168.1.10 (P:1, W:100)              |
| 10.1.1.2     | /32  | 192.168.1.20 (P:1, W:100)              |
| 10.1.2.0     | /24  | 192.168.2.10 (P:1, W:50), 192.168.2.11 (P:2, W:50) |
| 10.2.0.0     | /16  | 192.168.3.10 (P:1, W:100)              |
| 172.16.0.1   | /32  | 10.0.0.1 (P:1, W:100), 10.0.0.2 (P:2, W:50) |

## LISP协议实现

本项目实现了LISP协议的核心控制消息：

### Map-Request 消息格式
```
0                   1                   2                   3
0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|Type=1 |P|S|p|M|       Record Count            |   Reserved    |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                         Nonce                                 |
|                                                               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|   Source EID AFI (1=IPv4, 2=IPv6)    |   Mask Length | Resd  |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                     Source EID Address                        |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|   ITR-RLOC AFI                |   |   |   |   |   |   | Resd  |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                     ITR-RLOC Address                          |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                     EID Records                               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

### Map-Reply 消息格式
```
0                   1                   2                   3
0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|Type=2 |P|E|S|       Record Count            |   Reserved    |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                         Nonce                                 |
|                                                               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                     Mapping Records                           |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

## 测试验证

### 测试LISP协议功能

1. 启动服务器：
```bash
./bin/server
```

2. 在另一个终端运行测试客户端：
```bash
./bin/client -eid 10.1.1.1
```

预期输出：
```
Sending Map-Request for EID: 10.1.1.1
  Source EID: 192.168.1.1
  ITR RLOC:   192.168.1.1
  Nonce:      0x1234567890abcdef
Sending 52 bytes...
Received 76 bytes in 123.456µs
Map-Reply received:
  Type:         2
  Nonce:        0x1234567890abcdef
  RecordCount:  1
  Record 0:
    TTL:          1440 minutes
    LocatorCount: 1
    EID:          10.1.1.1/32
    ACT:          0
    Authoritative:1
    RLOC 0:
      IP:        192.168.1.10
      Priority:  1
      Weight:    100
      MPriority: 255
      MWeight:   0

=== Summary ===
Query:    10.1.1.1
Status:   FOUND
RLOCs:    192.168.1.10 (P:1, W:100)
RTT:      123.456µs
```

### 测试前缀匹配

查询10.1.2.5（应该匹配10.1.2.0/24）：
```bash
./bin/client -eid 10.1.2.5
```

## 技术栈

- **后端**: Go 1.16+
- **网络协议**: UDP (LISP控制), HTTP (API/Web)
- **前端**: 原生HTML/CSS/JavaScript (无需构建)
- **数据存储**: 内存map（可扩展为持久化存储）

## 扩展建议

- [ ] 支持Map-Register消息处理
- [ ] 支持Map-Notify消息
- [ ] 持久化存储（Redis, SQL）
- [ ] IPv6完整支持
- [ ] LISP数据平面（隧道封装/解封装）
- [ ] 分布式部署支持
- [ ] TLS加密API接口
- [ ] 用户认证与权限管理

## License

MIT License
