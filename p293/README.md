# LMA (Local Mobility Anchor) - 本地移动锚点模拟

这是一个用Go实现的本地移动锚点（LMA）模拟器，用于处理来自移动接入网关（MAG）发送的代理绑定更新（PBU）请求，建立移动节点（MN）的IPv6前缀与MAG地址的映射关系，并通过Web界面展示绑定缓存。

## 功能特性

- ✅ 处理代理绑定更新 (PBU) 请求
- ✅ 维护MN IPv6前缀与MAG地址的绑定缓存
- ✅ 绑定缓存自动过期清理
- ✅ Web界面展示绑定缓存
- ✅ RESTful API接口
- ✅ CORS跨域支持

## 项目结构

```
p293/
├── cmd/
│   └── lma/
│       └── main.go          # 主程序入口
├── internal/
│   ├── cache/
│   │   └── cache.go         # 绑定缓存实现
│   └── handler/
│       └── handler.go       # HTTP请求处理器
├── static/
│   └── index.html           # 前端展示页面
├── go.mod
└── README.md
```

## 快速开始

### 编译和运行

```bash
# 编译
go build -o lma-server ./cmd/lma

# 运行
./lma-server
```

或者直接运行：

```bash
go run ./cmd/lma
```

服务器将在 `:8080` 端口启动。

## API 接口

### 1. 发送代理绑定更新 (PBU)

**POST** `/pbu`

请求体：

```json
{
    "mn_prefix": "2001:db8:1::/64",
    "mag_address": "2001:db8:100::1",
    "lifetime": 3600
}
```

响应：

```json
{
    "status": "success",
    "message": "PBU processed successfully"
}
```

### 2. 获取所有绑定缓存

**GET** `/bindings`

响应：

```json
[
    {
        "mn_prefix": "2001:db8:1::/64",
        "mag_address": "2001:db8:100::1",
        "created_at": "2026-05-30T21:43:12.83389+08:00",
        "updated_at": "2026-05-30T21:43:12.83389+08:00",
        "lifetime": 3600
    }
]
```

### 3. Web 界面

**GET** `/`

在浏览器中访问查看绑定缓存管理界面。

## 使用示例

### 使用 curl 测试

```bash
# 发送 PBU 请求
curl -X POST http://localhost:8080/pbu \
  -H "Content-Type: application/json" \
  -d '{"mn_prefix":"2001:db8:1::/64","mag_address":"2001:db8:100::1","lifetime":3600}'

# 获取绑定缓存
curl http://localhost:8080/bindings
```

### 使用 Web 界面

打开浏览器访问：http://localhost:8080/

## 技术实现

### 绑定缓存 (Binding Cache)

- 线程安全的内存存储
- 支持添加、更新、查询、删除操作
- 自动过期清理（每分钟检查一次）
- 基于读写锁保证并发安全

### PMIPv6 概念说明

- **LMA (Local Mobility Anchor)**: 本地移动锚点，是移动节点的家乡代理
- **MAG (Mobile Access Gateway)**: 移动接入网关，负责管理移动节点的接入
- **PBU (Proxy Binding Update)**: 代理绑定更新，MAG向LMA发送的绑定更新请求
- **MN (Mobile Node)**: 移动节点
