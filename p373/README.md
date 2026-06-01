# MQTT over QUIC Broker

基于 Go 和 quic-go 实现的 MQTT over QUIC Broker，支持客户端网络切换（WiFi → 蜂窝）时连接不中断，维持 MQTT 会话。

## 特性

- ✅ **MQTT over QUIC**: 基于 QUIC 协议传输 MQTT 消息
- ✅ **连接迁移**: 客户端切换网络时保持连接不中断
- ✅ **会话保持**: 持久化 MQTT 会话和订阅信息
- ✅ **实时监控**: WebSocket 实时推送连接状态和消息
- ✅ **Web 控制台**: 可视化展示客户端状态、事件日志和消息流

## 架构

```
┌─────────────────┐     QUIC      ┌─────────────────┐
│   MQTT Client   │ ───────────── │  QUIC Listener  │
└─────────────────┘               └────────┬────────┘
                                           │
                                 ┌─────────▼─────────┐
                                 │  MQTT Protocol    │
                                 │  Handler          │
                                 └─────────┬─────────┘
                                           │
                                 ┌─────────▼─────────┐
                                 │  Session Manager  │
                                 └─────────┬─────────┘
                                           │
                        ┌──────────────────┼──────────────────┐
                        │                  │                  │
              ┌─────────▼────────┐ ┌──────▼──────┐ ┌──────────▼─────────┐
              │  Message Queue   │ │  Pub/Sub    │ │  WebSocket Hub     │
              └──────────────────┘ └─────────────┘ └──────────┬─────────┘
                                                               │
                                                      ┌────────▼────────┐
                                                      │  Web Dashboard  │
                                                      └─────────────────┘
```

## 快速开始

### 1. 生成 TLS 证书（已自动生成）

```bash
openssl req -x509 -newkey rsa:2048 -keyout certs/server.key -out certs/server.crt -days 365 -nodes
```

### 2. 启动 Broker

```bash
go run cmd/broker/main.go
```

Broker 启动后会监听：
- **QUIC**: `:1883` - MQTT over QUIC 端口
- **HTTP**: `:8080` - Web 控制台和 WebSocket 端口

### 3. 打开 Web 控制台

浏览器访问: `http://localhost:8888`

## 使用测试客户端

### 发布者模式

```bash
go run cmd/client/main.go -mode pub -id publisher-001 -topic test/topic -interval 2
```

### 订阅者模式

```bash
go run cmd/client/main.go -mode sub -id subscriber-001 -topic test/topic
```

### 网络迁移测试模式

模拟 WiFi → 蜂窝网络切换，验证会话保持：

```bash
go run cmd/client/main.go -mode migration -id mobile-client -topic test/data
```

## 项目结构

```
p373/
├── cmd/
│   ├── broker/
│   │   └── main.go          # Broker 主程序
│   └── client/
│       └── main.go          # 测试客户端
├── internal/
│   ├── mqtt/
│   │   └── packet.go        # MQTT 协议编解码
│   ├── quic/
│   │   └── server.go        # QUIC 服务器和连接处理
│   ├── session/
│   │   └── manager.go       # 会话管理
│   └── websocket/
│       └── hub.go           # WebSocket 推送
├── certs/
│   ├── server.crt           # TLS 证书
│   └── server.key           # TLS 私钥
└── web/
    └── index.html           # Web 控制台
```

## MQTT 支持的消息类型

| 类型 | 说明 |
|------|------|
| CONNECT | 连接请求 |
| CONNACK | 连接确认 |
| PUBLISH | 发布消息 |
| PUBACK | 发布确认 |
| SUBSCRIBE | 订阅请求 |
| SUBACK | 订阅确认 |
| PINGREQ | 心跳请求 |
| PINGRESP | 心跳响应 |
| DISCONNECT | 断开连接 |

## 网络迁移原理

### QUIC Connection Migration

QUIC 协议原生支持连接迁移，核心机制：

1. **连接 ID (Connection ID)**: QUIC 使用连接ID而非四元组标识连接
2. **地址验证**: 客户端从新地址发送数据时，服务器验证后更新路径
3. **无缝切换**: 应用层无感知，连接状态保持

### 实现要点

```go
// 服务器配置支持连接迁移
quicConfig := &quic.Config{
    EnableDatagrams:    true,
    Allow0RTT:          true,
    MaxIdleTimeout:     30 * time.Second,
}
```

### 会话保持

1. 客户端使用相同的 ClientID 重连
2. Broker 根据 ClientID 查找现有会话
3. 恢复订阅关系和消息队列
4. 发送排队的离线消息

## Web 控制台功能

### 实时状态面板

- **总客户端数**: 历史连接过的客户端总数
- **在线客户端数**: 当前活跃的连接数
- **监控连接数**: WebSocket 监控前端数量

### 客户端列表

显示每个客户端的：
- 客户端 ID
- 连接状态（在线/离线）
- 当前网络地址
- 连接 ID
- 订阅数量
- 消息队列长度

### 事件日志

记录：
- 客户端连接事件
- 客户端断开事件
- 网络路径切换事件
- 连接迁移详情

### 消息流

实时展示：
- 发布的消息
- 接收的消息
- 主题和载荷内容
- 时间戳

## 测试场景

### 场景 1: 基础发布订阅

```bash
# 终端 1: 启动 broker
go run cmd/broker/main.go

# 终端 2: 启动订阅者
go run cmd/client/main.go -mode sub -id sub1 -topic sensor/data

# 终端 3: 启动发布者
go run cmd/client/main.go -mode pub -id pub1 -topic sensor/data -interval 1
```

观察 Web 控制台：
- 客户端列表显示两个客户端
- 消息流显示发布和接收的消息
- 事件日志记录连接事件

### 场景 2: 网络切换

```bash
# 终端 1: 启动 broker
go run cmd/broker/main.go

# 终端 2: 运行迁移测试
go run cmd/client/main.go -mode migration -id device-001 -topic sensor/data
```

观察 Web 控制台：
- 首先建立 WiFi 连接
- 5秒后切换到蜂窝连接
- 事件日志显示 "Network path changed"
- 消息继续接收，无中断
- 会话和订阅保持不变

### 场景 3: 离线消息

```bash
# 1. 订阅者连接（非 clean session）
go run cmd/client/main.go -mode sub -id sub1 -topic test/offline -clean=false

# 2. 断开订阅者（Ctrl+C）

# 3. 发布几条消息
go run cmd/client/main.go -mode pub -id pub1 -topic test/offline -interval 1

# 4. 重新连接订阅者
go run cmd/client/main.go -mode sub -id sub1 -topic test/offline -clean=false

# 订阅者将收到离线期间的消息
```

## 性能调优

### 会话超时

```go
quicConfig := &quic.Config{
    MaxIdleTimeout: 30 * time.Second,  // 空闲超时
    KeepAlivePeriod: 10 * time.Second, // 心跳间隔
}
```

### 消息队列限制

```go
// 每个客户端最多缓存 1000 条消息
if len(s.MessageQueue) > 1000 {
    s.MessageQueue = s.MessageQueue[1:]
}
```

## 安全说明

- 当前使用自签名证书，生产环境请使用正规 CA 证书
- 可添加用户名密码认证
- 可添加 TLS 客户端证书认证
- 可添加 ACL 访问控制

## 扩展功能建议

- [ ] MQTT 5.0 完整支持
- [ ] 持久化存储（Redis/数据库）
- [ ] 集群部署
- [ ] 流量控制和 QoS 1/2 完整实现
- [ ] 保留消息支持
- [ ] 遗嘱消息支持
- [ ] 共享订阅支持

## 故障排查

### 连接失败

- 检查防火墙是否开放 UDP 端口 1883
- 检查 TLS 证书是否正确
- 查看 broker 日志

### WebSocket 无法连接

- 检查 8080 端口是否被占用
- 确认 broker HTTP 服务正常启动
- 检查浏览器控制台错误信息

### 消息丢失

- 确认 QoS 级别设置
- 检查订阅主题是否匹配
- 查看消息队列是否溢出

## License

MIT
