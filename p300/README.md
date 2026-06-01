# SIP TLS 服务器

一个支持双向TLS认证的SIP服务器，使用Go语言实现。

## 功能特性

- ✅ TLS 1.2+ 加密传输
- ✅ 双向证书认证（客户端必须提供有效证书）
- ✅ 自签名CA证书生成
- ✅ 服务器/客户端证书自动签发
- ✅ SIP REGISTER 注册功能
- ✅ SIP INVITE 呼叫处理
- ✅ Web前端界面管理
- ✅ 在线用户列表查看

## 项目结构

```
p300/
├── main.go                 # 主入口文件
├── go.mod                  # Go模块定义
├── pkg/
│   ├── certgen/            # 证书生成模块
│   │   └── certgen.go
│   ├── sipserver/          # SIP服务器核心
│   │   └── server.go
│   └── api/                # HTTP API服务器
│       └── api.go
├── cmd/
│   └── sipclient/          # SIP测试客户端
│       └── main.go
├── frontend/               # 前端界面
│   ├── index.html
│   └── app.js
└── certs/                  # 证书目录（自动生成）
    ├── ca.crt              # CA根证书
    ├── ca.key
    ├── server.crt          # 服务器证书
    ├── server.key
    └── clients/            # 客户端证书目录
        └── <username>/
            ├── client.crt
            └── client.key
```

## 快速开始

### 1. 启动服务器

```bash
# 下载依赖
go mod tidy

# 启动服务器
go run main.go
```

服务器将在以下端口监听：
- SIP TLS: `5061`
- HTTP API: `8080`

### 2. 生成客户端证书

打开浏览器访问: `http://localhost:8080`

在"证书生成"标签页输入用户名（如 `alice`），点击"生成证书"。

证书将保存到 `certs/clients/alice/` 目录下。

### 3. 使用测试客户端连接

```bash
# 注册用户
go run cmd/sipclient/main.go -username alice

# 注册并发起呼叫
go run cmd/sipclient/main.go -username alice --call bob
```

## 双向认证流程

1. **TLS握手阶段**:
   - 服务器向客户端发送服务器证书
   - 客户端验证服务器证书（由自签名CA签发）
   - 服务器要求客户端提供证书
   - 客户端发送客户端证书
   - 服务器验证客户端证书（必须由同一CA签发）
   - 握手完成，建立安全连接

2. **SIP消息阶段**:
   - 所有SIP消息通过加密的TLS通道传输
   - 服务器根据客户端证书的CommonName识别用户身份

## API接口

### 生成客户端证书

```
POST /api/generate-cert
Content-Type: application/json

{
    "username": "alice"
}
```

响应：
```json
{
    "success": true,
    "certPEM": "-----BEGIN CERTIFICATE-----...",
    "keyPEM": "-----BEGIN PRIVATE KEY-----...",
    "caPEM": "-----BEGIN CERTIFICATE-----...",
    "message": "Certificate generated successfully"
}
```

### 获取在线用户列表

```
GET /api/registrations
```

响应：
```json
{
    "alice": {
        "User": "alice",
        "Contact": "sip:alice@localhost",
        "Expires": "2024-01-01T12:00:00Z",
        "LastSeen": "2024-01-01T11:00:00Z"
    }
}
```

## 命令行参数

### 服务器

```bash
go run main.go \
    -sip-addr ":5061" \
    -http-addr ":8080" \
    -certs-dir "./certs"
```

### 客户端

```bash
go run cmd/sipclient/main.go \
    -server "localhost:5061" \
    -username "alice" \
    -certs-dir "./certs"
```

## 安全说明

- 本项目使用自签名证书，适用于测试和开发环境
- 生产环境请使用受信任的CA签发的证书
- 私钥文件权限设置为 `0600`，确保安全
- 客户端证书的CommonName作为用户身份标识

## SIP方法支持

- [x] REGISTER - 用户注册
- [x] INVITE - 发起呼叫
- [x] BYE - 结束呼叫
- [x] ACK - 确认响应
- [ ] OPTIONS
- [ ] CANCEL
- [ ] INFO
- [ ] MESSAGE

## 浏览器限制说明

由于浏览器的安全限制，无法直接从浏览器使用客户端证书建立原始TCP TLS连接。因此：

1. **Web前端** 用于：
   - 生成客户端证书
   - 查看在线用户列表
   - 管理界面

2. **Go测试客户端** 用于：
   - 实际的SIP TLS连接测试
   - 演示双向认证流程
   - 发送REGISTER和INVITE请求

## 常见问题

**Q: 如何重置所有证书？**
A: 删除 `certs` 目录，重启服务器会自动重新生成。

**Q: 客户端连接失败，显示TLS握手错误？**
A: 确保客户端证书已生成，并且证书目录路径正确。

**Q: 如何使用其他SIP客户端？**
A: 配置SIP客户端使用TLS传输（sips://），导入客户端证书和CA证书。
