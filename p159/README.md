# VISA SCPI Gateway

通过TCP Socket连接支持VISA的设备（如示波器），转发SCPI命令，并提供HTTP API封装的完整解决方案。

## 功能特性

- 🔌 TCP Socket连接VISA设备（示波器、信号发生器等）
- 📤 SCPI命令转发与响应接收
- 🌐 RESTful HTTP API封装
- 🎨 Web前端界面，支持快速命令发送与响应显示
- ⚡ 常用SCPI命令快速按钮
- 📜 命令历史记录与响应展示
- 📋 **命令队列（FIFO）** - 异步非阻塞命令执行
- 🔄 **长命令分块发送** - 支持大数据量命令传输
- 📊 **实时状态监控** - 命令执行状态实时追踪

## 项目结构

```
p159/
├── client/                 # 前端React应用
│   ├── src/
│   │   ├── components/
│   │   │   ├── ConnectionPanel.tsx  # 设备连接面板
│   │   │   ├── CommandPanel.tsx     # 命令发送面板
│   │   │   └── ResponsePanel.tsx    # 响应显示面板
│   │   ├── services/
│   │   │   └── api.ts               # API调用服务
│   │   ├── types/
│   │   │   └── index.ts             # 类型定义
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
├── server/                 # 后端Node.js服务
│   ├── src/
│   │   ├── controllers/
│   │   │   └── visa.controller.ts    # API控制器
│   │   ├── services/
│   │   │   └── visaDevice.service.ts # VISA设备TCP连接服务
│   │   ├── types/
│   │   │   └── index.ts             # 类型定义
│   │   └── index.ts                 # 服务入口
│   ├── package.json
│   └── tsconfig.json
└── package.json            # 根目录配置
```

## 快速开始

### 安装依赖

```bash
npm install
```

### 启动开发环境

```bash
# 同时启动前后端
npm run dev

# 或分别启动
npm run dev:server   # 后端服务 (端口 3001)
npm run dev:client   # 前端应用 (端口 5173)
```

### 构建生产版本

```bash
npm run build
npm start
```

## API 接口

### 健康检查
```
GET /api/health
```

### 获取设备状态
```
GET /api/device/status
```

### 连接设备
```
POST /api/device/connect
Content-Type: application/json

{
  "host": "192.168.1.100",
  "port": 5555,
  "timeout": 5000,
  "chunkSize": 1024,
  "chunkDelay": 10
}
```

### 断开设备
```
POST /api/device/disconnect
```

### 发送SCPI命令（同步阻塞）
```
POST /api/device/command
Content-Type: application/json

{
  "command": "*IDN?",
  "isQuery": true,
  "timeout": 5000
}
```

### 批量发送命令（同步阻塞）
```
POST /api/device/commands
Content-Type: application/json

{
  "commands": [
    { "command": "*IDN?", "isQuery": true },
    { "command": "MEAS:VOLT:DC?", "isQuery": true }
  ]
}
```

## 命令队列 API（异步非阻塞）

### 入队命令（异步）
```
POST /api/queue/enqueue
Content-Type: application/json

{
  "command": "*IDN?",
  "isQuery": true,
  "timeout": 5000
}

响应:
{
  "success": true,
  "message": "Command enqueued",
  "commandId": "xxx",
  "queueLength": 1
}
```

### 查询命令状态
```
GET /api/queue/status/:id

响应:
{
  "success": true,
  "command": {
    "id": "xxx",
    "command": "*IDN?",
    "status": "completed",
    "response": { "success": true, "response": "..." }
  }
}
```

### 获取队列状态
```
GET /api/queue

响应:
{
  "success": true,
  "queue": {
    "length": 2,
    "isProcessing": true,
    "pending": [...],
    "recent": [...]
  }
}
```

### 清空队列
```
DELETE /api/queue
```

## 命令状态说明

| 状态 | 描述 |
|------|------|
| `pending` | 命令已入队，等待执行 |
| `processing` | 命令正在执行中 |
| `completed` | 命令执行成功 |
| `failed` | 命令执行失败 |

## 常用SCPI命令

| 命令 | 描述 |
|------|------|
| `*IDN?` | 查询设备标识 |
| `*RST` | 设备复位 |
| `*OPC?` | 查询操作完成状态 |
| `SYST:ERR?` | 查询错误信息 |
| `MEAS:VOLT:DC?` | 测量直流电压 |
| `MEAS:CURR:DC?` | 测量直流电流 |

## 技术栈

**后端：**
- Node.js + TypeScript
- Express 4
- TCP Socket (net 模块)

**前端：**
- React 18 + TypeScript
- Vite
- TailwindCSS 3
- Axios

## 核心特性说明

### 命令终止符
所有SCPI命令自动追加 `\r\n` 作为终止符，符合VISA设备标准协议。

### 命令队列（FIFO）
- 命令按入队顺序依次执行
- 支持并发入队，串行执行
- 可随时查询命令执行状态
- 前端自动轮询更新状态（每秒1次）

### 长命令分块发送
- 默认分块大小：1024字节
- 块间延迟：10毫秒
- 可通过连接参数自定义 `chunkSize` 和 `chunkDelay`

## 注意事项

1. 确保VISA设备已开启并支持TCP/IP Socket连接
2. 设备端口号通常为 5555 (Keysight/Agilent) 或其他厂商特定端口
3. SCPI命令末尾自动添加 `\r\n` 作为终止符
4. 异步模式下，命令入队后立即返回，通过轮询获取结果
5. 队列中的命令在设备断开连接时会被清空
