# P4 模拟器 (Python + Scapy + React)

一个基于 Python 和 Scapy 的 P4 可编程交换机模拟器，具有 MAC 学习转发流水线和 ingress clone 镜像端口功能。前端使用 React + TypeScript 实时展示原始包和镜像包。

## 功能特性

### 后端 (Python + FastAPI)
- **虚拟交换机**: 5 个端口（4 个普通端口 + 1 个监控端口）
- **MAC 地址学习**: 自动学习源 MAC 地址与端口映射，支持老化机制（默认 300 秒）
- **转发流水线**: 
  - Parser: 解析以太网、IP (v4/v6)、TCP、UDP、ICMP 协议
  - Ingress: MAC 学习 + 转发决策 + ingress clone 镜像
  - Egress: 输出端口处理
- **Ingress Clone 镜像**: 在 ingress 阶段复制数据包到监控端口
- **实时通信**: WebSocket 实时推送数据包、日志、状态更新

### 前端 (React 18 + TypeScript)
- **双列表展示**: 左侧原始包列表（绿色），右侧镜像包列表（橙色）
- **交换机控制面板**: 状态监控、端口列表、MAC 地址表、镜像规则配置
- **测试数据包发送**: 可配置源/目的 MAC、IP、端口、协议、payload
- **数据包详情面板**: 分层展示以太网、IP、传输层、payload、十六进制转储
- **系统控制台**: 实时日志显示
- **赛博朋克风格**: 深色主题 + 网格背景 + 流畅动画

## 项目结构

```
p375/
├── backend/                    # 后端 Python 代码
│   ├── p4_simulator/          # P4 模拟器核心
│   │   ├── __init__.py
│   │   ├── port.py            # 端口管理
│   │   ├── mac_table.py       # MAC 地址表
│   │   ├── mirror.py          # 镜像引擎
│   │   ├── pipeline.py        # 转发流水线
│   │   ├── packet_handler.py  # 数据包解析/创建
│   │   └── switch.py          # 虚拟交换机主类
│   ├── api/                   # FastAPI 接口
│   │   ├── switch.py          # REST API
│   │   └── websocket.py       # WebSocket 服务
│   ├── main.py                # 应用入口
│   └── requirements.txt       # Python 依赖
├── src/                        # 前端 TypeScript 代码
│   ├── components/            # React 组件
│   │   ├── SwitchControl/     # 交换机控制面板
│   │   ├── TrafficMonitor/    # 流量监控
│   │   ├── PacketDetail/      # 数据包详情
│   │   └── Console/           # 控制台
│   ├── hooks/                 # 自定义 Hooks
│   ├── store/                 # Zustand 状态管理
│   ├── types/                 # TypeScript 类型定义
│   ├── utils/                 # 工具函数
│   ├── App.tsx                # 主应用组件
│   └── main.tsx               # 入口文件
├── scripts/                    # 脚本
│   ├── start.sh               # 一键启动脚本
│   ├── start_backend.sh       # 仅启动后端
│   ├── unit_test.py           # 单元测试
│   └── test_traffic.py        # 流量测试
├── package.json
├── tailwind.config.js
└── tsconfig.json
```

## 快速开始

### 环境要求
- Python 3.9+
- Node.js 18+
- npm

### 一键启动

```bash
# 给脚本添加执行权限
chmod +x scripts/*.sh

# 一键启动后端和前端
./scripts/start.sh
```

### 手动启动

**1. 安装依赖**

```bash
# 后端依赖
cd backend
python3 -m pip install -r requirements.txt

# 前端依赖
cd ..
npm install --legacy-peer-deps
```

**2. 启动后端服务**

```bash
cd backend
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

**3. 启动前端服务**

```bash
# 在新终端中
npm run dev
```

### 访问地址

- 前端界面: http://localhost:5173
- 后端 API: http://localhost:8000
- API 文档: http://localhost:8000/docs

## 使用说明

### 1. 查看交换机状态

打开首页后，可以看到：
- 交换机运行状态、运行时间、数据包统计
- 5 个端口的状态（4 个普通端口 + 1 个监控端口）
- MAC 地址表内容
- 镜像规则列表

### 2. 发送测试数据包

1. 在右侧"发送测试数据包"面板中配置参数
2. 选择源端口（建议选择 port-1，已默认配置镜像规则）
3. 设置源/目的 MAC、IP、端口、协议
4. 点击"发送数据包"
5. 观察左侧原始包列表和右侧镜像包列表

### 3. 配置镜像规则

1. 在"镜像规则"面板中
2. 选择源端口（要镜像的端口）
3. 选择方向（ingress/egress/bidirectional）
4. 选择监控端口（通常是 monitor-1）
5. 点击"添加镜像规则"

### 4. 查看数据包详情

1. 点击任意数据包列表中的条目
2. 右侧会展开详情面板
3. 可查看各层协议头、payload、十六进制转储
4. 支持复制 JSON 和下载

## 测试验证

### 运行单元测试

```bash
cd scripts
python3 unit_test.py
```

### 运行流量测试

```bash
cd scripts
python3 test_traffic.py --packets 10
```

测试内容包括：
1. MAC 地址学习
2. Ingress clone 镜像功能
3. 未知目的 MAC 广播（Flooding）
4. MAC 学习后的精准转发

## 技术架构

### 转发流水线

```
  数据包入站
      ↓
  ┌─────────┐
  │ Parser  │ 解析协议头
  └─────────┘
      ↓
  ┌─────────┐
  │ Ingress │ → MAC 学习
  │         │ → 转发决策 (forward/flood)
  │         │ → Ingress Clone (镜像)
  └─────────┘
      ↓
  ┌─────────┐
  │ Egress  │ 输出端口处理
  └─────────┘
      ↓
  数据包出站 + 镜像副本到监控端口
```

### 镜像机制

Ingress Clone 发生在 ingress 流水线阶段，在转发决策之前：
1. 检查是否有 ingress 镜像规则匹配入站端口
2. 创建数据包的精确副本
3. 原始包继续转发流水线处理
4. 镜像副本发送到配置的监控端口

### WebSocket 数据推送

- `/ws/packets`: 实时推送新捕获的数据包（原始包 + 镜像包）
- `/ws/logs`: 推送系统日志、状态更新、MAC 表更新、端口状态变化

## API 文档

### REST API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/switch/status` | 获取交换机状态 |
| GET | `/api/switch/ports` | 获取端口列表 |
| GET | `/api/switch/mac-table` | 获取 MAC 表 |
| DELETE | `/api/switch/mac-table` | 清空 MAC 表 |
| GET | `/api/switch/mirror` | 获取镜像规则 |
| POST | `/api/switch/mirror` | 添加镜像规则 |
| DELETE | `/api/switch/mirror/{id}` | 删除镜像规则 |
| POST | `/api/switch/start` | 启动交换机 |
| POST | `/api/switch/stop` | 停止交换机 |
| POST | `/api/switch/reset` | 重置交换机 |
| POST | `/api/switch/send-packet` | 发送测试数据包 |
| GET | `/api/switch/packets` | 获取历史数据包 |

### WebSocket

连接 `/ws/packets` 接收实时数据包：
```json
{
  "type": "packet",
  "data": {
    "packetType": "original" | "mirror",
    "packet": { ...PacketInfo }
  }
}
```

连接 `/ws/logs` 接收实时日志和更新：
```json
{
  "type": "log" | "status" | "mac_update" | "port_update",
  "data": { ... }
}
```

## 开发说明

### 后端核心类

- `VirtualSwitch`: 虚拟交换机主类，协调整个系统
- `ForwardingPipeline`: 转发流水线实现
- `MacTable`: MAC 地址表，支持老化
- `MirrorEngine`: 镜像规则引擎
- `PacketHandler`: 数据包解析和创建
- `Port`: 端口抽象

### 前端核心状态

使用 Zustand 管理全局状态：
- `originalPackets`: 原始数据包数组（最多 100 条）
- `mirrorPackets`: 镜像数据包数组（最多 100 条）
- `switchStatus`: 交换机状态
- `ports`: 端口列表
- `macTable`: MAC 地址表
- `mirrorRules`: 镜像规则
- `logs`: 系统日志

## License

MIT
