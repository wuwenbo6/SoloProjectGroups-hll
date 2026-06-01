# Swarm Cluster Manager

一个基于 Go + Docker SDK 的 Docker Swarm 集群管理系统，支持边缘节点自动注册、容器部署、故障迁移和资源监控。

## 最近更新

### 2024-05-24 新增功能

**功能 1: GPU 支持 (NVIDIA Docker)**
- ✅ 节点 GPU 资源注册和监控 (数量、类型、使用率、显存)
- ✅ 服务 GPU 资源需求配置 (NVIDIA runtime)
- ✅ GPU 节点自动标记和调度约束
- ✅ 故障迁移时考虑 GPU 资源可用性
- ✅ 边缘节点代理自动检测 NVIDIA GPU

**功能 2: 任务优先级**
- ✅ 服务优先级配置 (1-10级)
- ✅ 故障迁移时优先级加权调度
- ✅ 高优先级服务优先分配资源
- ✅ 前端优先级滑块可视化配置

**功能 3: 集群报告导出**
- ✅ JSON 格式完整报告导出
- ✅ Markdown 格式报告导出
- ✅ 集群概览统计
- ✅ 节点详细信息列表
- ✅ 服务详细信息列表 (按优先级排序)
- ✅ 智能建议和警告
- ✅ 前端一键导出按钮

### 2024-05-24 问题修复

**问题 1: 节点离线后任务未自动迁移**
- ✅ 添加故障防抖机制：节点离线后等待 3 个心跳周期确认故障
- ✅ 添加幂等性保护：防止同一节点重复处理故障迁移
- ✅ 并发安全：使用互斥锁确保迁移过程不冲突
- ✅ Swarm 原生集成：通过更新 Placement Constraints 让 Swarm 调度器重新调度
- ✅ 状态跟踪：记录故障时间和处理状态

**问题 2: 监控数据采集频率过高导致网络拥塞**
- ✅ 前端轮询从 5 秒降低到 15 秒
- ✅ 后台标签页自动降低到 60 秒（页面不可见时）
- ✅ 部署历史数据每 3 次轮询才获取一次
- ✅ 边缘节点代理默认心跳从 30 秒增加到 60 秒
- ✅ 代理添加自适应频率：失败时切换到快速模式，成功后恢复

## 功能特性

### 核心功能
- **节点管理**: 边缘节点自动注册与心跳检测，支持 GPU 资源
- **服务部署**: 通过 Docker Swarm API 部署和管理容器服务，支持优先级和 GPU 需求
- **故障迁移**: 节点故障自动检测与服务重新调度，考虑 GPU 资源和优先级
- **资源监控**: 实时监控节点 CPU/内存/GPU 使用情况
- **历史记录**: 节点状态和部署操作历史记录
- **GPU 支持**: 集成 NVIDIA Docker，支持 GPU 资源调度和监控
- **任务优先级**: 1-10 级优先级配置，高优先级服务优先调度
- **报告导出**: 支持 JSON/Markdown 格式的集群状态报告导出

### 技术栈
- **后端**: Go + Gin + GORM + SQLite
- **前端**: React + Material-UI + Recharts
- **容器**: Docker + Docker Swarm
- **代理**: Python 边缘节点代理

## 项目结构

```
.
├── backend/                 # 后端服务
│   ├── cmd/
│   │   └── main.go         # 主程序入口
│   ├── internal/
│   │   ├── api/            # REST API 处理器
│   │   ├── docker/         # Docker SDK 封装
│   │   ├── health/         # 节点健康检查
│   │   ├── failover/       # 故障迁移逻辑
│   │   └── models/         # 数据库模型
│   ├── pkg/
│   │   └── config/         # 配置管理
│   ├── Dockerfile
│   └── go.mod
├── frontend/               # 前端应用
│   ├── src/
│   │   ├── components/     # React 组件
│   │   ├── services/       # API 服务
│   │   └── App.jsx
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
├── edge-agent/             # 边缘节点代理
│   ├── agent.py
│   └── requirements.txt
└── docker-compose.yml
```

## 快速开始

### 方式一：Docker Compose 部署

```bash
# 启动服务
docker-compose up -d --build

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f
```

访问 http://localhost 查看前端界面

### 方式二：本地开发

#### 启动后端服务

```bash
cd backend

# 安装依赖
go mod download

# 运行服务
go run cmd/main.go
```

后端服务将在 http://localhost:8080 启动

#### 启动前端服务

```bash
cd frontend

# 安装依赖
npm install --legacy-peer-deps

# 启动开发服务器
npm run dev
```

前端服务将在 http://localhost:5173 启动

## 使用指南

### 1. 注册边缘节点

#### 使用边缘节点代理

```bash
cd edge-agent

# 安装依赖
pip install -r requirements.txt

# 启动代理
python agent.py --manager http://localhost:8080 --name edge-node-1 --role worker
```

#### 通过 API 手动注册

```bash
curl -X POST http://localhost:8080/api/v1/nodes/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "node-1",
    "hostname": "worker-01",
    "ip_address": "192.168.1.100",
    "role": "worker",
    "cpu_cores": 4,
    "memory_mb": 8192,
    "cpu_used": 25.5,
    "memory_used": 2048
  }'
```

### 2. 部署服务

通过前端界面或 API 部署服务：

```bash
curl -X POST http://localhost:8080/api/v1/services \
  -H "Content-Type: application/json" \
  -d '{
    "name": "web-service",
    "image": "nginx:alpine",
    "replicas": 3,
    "ports": [{"host_port": 8080, "container_port": 80, "protocol": "tcp"}],
    "env": ["DEBUG=true"]
  }'
```

### 3. 查看集群状态

- 访问前端仪表盘查看节点资源使用情况
- 查看服务运行状态和副本数
- 浏览部署历史记录

## API 文档

### 节点管理 API

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/v1/nodes/register` | 注册节点 |
| POST | `/api/v1/nodes/heartbeat` | 发送心跳 |
| GET | `/api/v1/nodes` | 获取所有节点 |
| GET | `/api/v1/nodes/:id` | 获取节点详情 |
| GET | `/api/v1/nodes/:id/history` | 获取节点历史 |
| DELETE | `/api/v1/nodes/:id` | 删除节点 |

### 服务管理 API

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/v1/services` | 创建服务 |
| GET | `/api/v1/services` | 获取所有服务 |
| GET | `/api/v1/services/:id` | 获取服务详情 |
| DELETE | `/api/v1/services/:id` | 删除服务 |

### 集群管理 API

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/v1/sync` | 同步 Swarm 集群状态 |
| GET | `/api/v1/deployments/history` | 获取部署历史 |
| POST | `/api/v1/failover/:node_id` | 触发故障迁移 |
| GET | `/api/v1/health` | 健康检查 |

## 配置选项

### 环境变量

| 变量 | 默认值 | 描述 |
|------|--------|------|
| `PORT` | `8080` | 服务端口 |
| `DATABASE_PATH` | `swarm_manager.db` | SQLite 数据库路径 |
| `HEARTBEAT_INTERVAL` | `30` | 心跳检查间隔（秒） |
| `NODE_TIMEOUT` | `120` | 节点超时时间（秒） |
| `FAILOVER_ENABLED` | `true` | 是否启用故障迁移 |

## 故障迁移机制

1. **节点检测**: 系统定期检查节点心跳时间
2. **故障判定**: 超过 `NODE_TIMEOUT` 未收到心跳标记为离线
3. **服务迁移**: 故障节点上的服务自动迁移到健康节点
4. **节点选择**: 基于 CPU/内存负载选择最优目标节点
5. **历史记录**: 所有故障迁移操作记录到数据库

## 与 Docker Swarm 集成

本系统可以与现有 Docker Swarm 集群集成：

1. 确保管理节点可以访问 Docker Socket
2. 挂载 `/var/run/docker.sock` 到后端容器
3. 调用 `/api/v1/sync` 同步现有集群状态

## 开发说明

### 数据库模型

- **Node**: 节点基本信息和实时状态
- **NodeHistory**: 节点状态历史记录
- **Service**: 服务配置和运行状态
- **DeploymentHistory**: 部署操作历史

### 扩展开发

1. 添加新的 API 端点到 `internal/api/handlers.go`
2. 在 `internal/api/router.go` 注册路由
3. 添加新的业务逻辑到相应的模块

## 许可证

MIT License
