# RADIUS CoA 服务器

一个基于Go语言实现的RADIUS服务器，支持CoA（Change of Authorization）动态授权修改，提供Web管理界面展示在线用户会话和策略调整功能。

## 功能特性

- **RADIUS 认证服务器** (UDP 1812端口)：处理用户认证请求
- **RADIUS 计费服务器** (UDP 1813端口)：处理计费开始/更新/结束请求
- **CoA 服务器** (UDP 3799端口)：支持动态授权修改和用户断开
- **会话管理**：实时跟踪用户在线状态和授权策略
- **策略动态调整**：支持动态修改用户上下行速率限制
- **Web管理界面**：直观展示在线用户，提供策略修改和断开连接操作
- **RESTful API**：提供完整的HTTP API接口供第三方系统集成

## 项目结构

```
radius-coa-server/
├── cmd/
│   └── server/
│       └── main.go              # 主程序入口
├── internal/
│   ├── api/
│   │   └── server.go            # HTTP API服务器
│   ├── coa/
│   │   └── server.go            # CoA服务器实现
│   ├── radius/
│   │   └── server.go            # RADIUS认证/计费服务器
│   └── session/
│       └── session.go           # 会话管理和策略存储
├── web/
│   └── index.html               # 前端管理界面
├── go.mod
├── go.sum
└── README.md
```

## 快速开始

### 环境要求

- Go 1.21+

### 安装依赖

```bash
go mod download
```

### 编译运行

```bash
go run cmd/server/main.go
```

或者编译后运行：

```bash
go build -o radius-coa-server cmd/server/main.go
./radius-coa-server
```

### 服务端口

服务启动后将监听以下端口：

| 服务 | 协议 | 端口 | 说明 |
|------|------|------|------|
| RADIUS 认证 | UDP | 1812 | 处理用户认证请求 |
| RADIUS 计费 | UDP | 1813 | 处理计费请求 |
| CoA | UDP | 3799 | 动态授权修改端口 |
| HTTP API | TCP | 8080 | Web界面和API接口 |

### 默认配置

- RADIUS 共享密钥: `testing123`
- 默认策略: 上行 10Mbps, 下行 50Mbps

## Web管理界面

启动服务后，在浏览器中访问 `http://localhost:8080` 即可打开管理面板。

界面功能：
- 统计概览：显示总会话数、在线用户数、离线用户数、总带宽使用
- 会话列表：展示所有用户会话的详细信息
- 搜索筛选：支持按用户名、IP地址、会话ID搜索
- 状态筛选：可选择只显示在线用户
- 修改策略：动态调整用户的上下行速率
- 断开连接：强制断开指定用户的连接
- 自动刷新：每10秒自动刷新数据

## API 接口

### 获取统计信息

```
GET /api/stats
```

响应示例：
```json
{
  "total_sessions": 5,
  "online_sessions": 3,
  "offline_sessions": 2,
  "total_upload_bw": 31457280,
  "total_download_bw": 157286400
}
```

### 获取会话列表

```
GET /api/sessions
GET /api/sessions?status=online
```

响应示例：
```json
{
  "total": 3,
  "sessions": [
    {
      "id": "user1-192.168.1.1-0-1234567890",
      "username": "user1",
      "nas_ip": "192.168.1.1",
      "nas_port": "0",
      "framed_ip": "10.0.0.1",
      "calling_station_id": "AA:BB:CC:DD:EE:FF",
      "policy": {
        "upload_speed": 10485760,
        "download_speed": 52428800
      },
      "start_time": "2024-01-01T10:00:00Z",
      "last_update": "2024-01-01T10:00:00Z",
      "status": "online"
    }
  ]
}
```

### 获取单个会话详情

```
GET /api/sessions/{id}
```

### 修改用户策略

```
PUT /api/sessions/{id}/policy
Content-Type: application/json

{
  "upload_speed": 20480000,
  "download_speed": 102400000
}
```

> 注意：速率单位为 bps（比特每秒）

响应示例：
```json
{
  "success": true,
  "message": "Policy updated successfully"
}
```

### 断开用户连接

```
POST /api/sessions/{id}/disconnect
```

响应示例：
```json
{
  "success": true,
  "message": "Session disconnected"
}
```

## CoA 协议说明

### CoA 请求 (RFC 3576)

服务器支持接收来自NAS的CoA请求，用于动态更新用户授权信息。

支持的CoA操作：
1. **CoA-Request** (Code 43): 修改用户授权策略
2. **Disconnect-Request** (Code 40): 强制断开用户连接

### Filter-ID 格式

策略信息通过 Filter-ID 属性传递，格式如下：
```
Rate-Limit:up={upload_kbps},down={download_kbps}
```

示例：
```
Rate-Limit:up=10240,down=51200
```

表示上行速率10Mbps，下行速率50Mbps。

## RADIUS 属性说明

### 认证响应属性

- `Session-Id`: 会话唯一标识
- `Filter-Id`: 速率限制策略
- `Vendor-Specific` (Cisco): 速率限制属性

### 计费属性

- `Acct-Status-Type`: 计费状态类型（Start/Interim-Update/Stop）
- `Acct-Session-Id`: 会话ID
- `Framed-IP-Address`: 用户IP地址
- `Calling-Station-Id`: 用户MAC地址

## 测试

可以使用 `radtest` 或 `radclient` 工具进行测试：

### 认证测试

```bash
radtest user1 password123 localhost 1812 testing123
```

### 计费测试

```bash
echo "User-Name=user1,Acct-Status-Type=Start,Acct-Session-Id=test1,Framed-IP-Address=10.0.0.1" | radclient localhost:1813 acct testing123
```

### CoA 测试

```bash
echo "User-Name=user1,Acct-Session-Id=test1,Filter-Id='Rate-Limit:up=20480,down=102400'" | radclient localhost:3799 coa testing123
```

### 断开用户测试

```bash
echo "User-Name=user1,Acct-Session-Id=test1" | radclient localhost:3799 disconnect testing123
```

## 注意事项

1. 这是一个演示项目，生产环境使用前需要：
   - 实现真正的用户认证（如对接数据库或LDAP）
   - 增加持久化存储
   - 增强安全措施（如IP白名单、日志审计）
   - 配置适当的防火墙规则

2. CoA请求的源IP需要在NAS设备上配置正确的RADIUS服务器地址

3. 修改策略后，NAS设备需要支持CoA ACK才能真正生效

## License

MIT License
