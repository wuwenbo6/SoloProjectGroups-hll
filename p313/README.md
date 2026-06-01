# PCEP 路径计算服务器

基于 Go 语言实现的 PCEP (Path Computation Element Protocol) 服务器，支持使用 CSPF (Constrained Shortest Path First) 算法计算满足带宽约束的 LSP 路径。

## 功能特性

- **PCEP 协议支持**: 实现了 PCEP v1 协议，包括 Open、Keepalive、PCReq、PCRep 消息
- **CSPF 路径计算**: 基于 Dijkstra 算法的约束最短路径优先计算
- **带宽约束**: 支持基于链路可用带宽的路径筛选
- **拓扑可视化**: 前端 Web 界面展示网络拓扑和计算路径
- **REST API**: 提供 HTTP API 供外部调用

## 项目结构

```
p313/
├── cmd/
│   └── server/
│       └── main.go          # 主程序入口
├── pkg/
│   ├── pcep/
│   │   ├── messages.go      # PCEP 消息解析与构建
│   │   └── server.go        # PCEP 服务器核心逻辑
│   ├── topology/
│   │   └── topology.go      # 网络拓扑数据结构
│   └── cspf/
│       └── cspf.go          # CSPF 路径计算算法
├── web/
│   └── static/
│       └── index.html       # 前端可视化页面
├── config/
│   └── topology.json        # 拓扑配置文件
├── start.sh                 # 启动脚本
└── go.mod
```

## 快速开始

### 启动服务器

```bash
# 方式1: 使用启动脚本
./start.sh

# 方式2: 手动构建运行
go mod tidy
go build -o bin/pcep-server ./cmd/server
./bin/pcep-server
```

### 访问服务

- **Web 界面**: http://localhost:9090
- **PCEP 协议端口**: 4189
- **REST API**: http://localhost:9090/api

## REST API 文档

### 1. 获取拓扑信息

```bash
GET /api/topology
```

响应示例：
```json
{
  "nodes": [...],
  "links": [...]
}
```

### 2. 计算路径

```bash
POST /api/compute-path
Content-Type: application/json

{
  "source": "R1",
  "target": "R6",
  "bandwidth": 100
}
```

响应示例：
```json
{
  "success": true,
  "nodes": ["R1", "R3", "R6"],
  "links": ["L2", "L8"],
  "metric": 25
}
```

### 3. 预留带宽

```bash
POST /api/reserve-bandwidth
Content-Type: application/json

{
  "links": ["L2", "L8"],
  "bandwidth": 100
}
```

### 4. 获取统计信息

```bash
GET /api/stats
```

## 拓扑配置

编辑 `config/topology.json` 文件自定义网络拓扑：

```json
{
  "nodes": [
    {
      "id": "R1",
      "name": "R1",
      "ip": "10.0.0.1",
      "x": 20,
      "y": 50
    }
  ],
  "links": [
    {
      "id": "L1",
      "source": "R1",
      "target": "R2",
      "bandwidth": 1000,
      "reserved_bw": 0,
      "metric": 10,
      "latency": 5
    }
  ]
}
```

## PCEP 协议使用

服务器监听 4189 端口（PCEP 标准端口），支持 PCEP v1 协议。

支持的消息类型：
- Open (1): 会话建立
- Keepalive (2): 会话保活
- PCReq (3): 路径计算请求
- PCRep (4): 路径计算响应
- Close (7): 会话关闭

## CSPF 算法说明

CSPF (Constrained Shortest Path First) 算法基于 Dijkstra 最短路径算法，增加了约束条件：

1. **带宽约束**: 只考虑满足带宽需求的链路
2. **排除约束**: 可指定排除特定链路
3. **度量优化**: 选择总度量值最小的路径

算法流程：
1. 构建满足约束条件的邻接表
2. 使用优先队列实现 Dijkstra 算法
3. 记录路径回溯信息
4. 从目标节点回溯得到完整路径

## 默认拓扑

默认包含 6 个节点和 9 条链路的测试拓扑：

```
    R2 ---- R5
   /  \    /  \
R1      R4      R6
   \  /    \  /
    R3 ----
```

## 技术栈

- **后端**: Go 1.21+
- **Web 框架**: Gin
- **前端**: 原生 HTML5 Canvas + JavaScript
- **协议**: PCEP (RFC 5440)

## 许可证

MIT License
