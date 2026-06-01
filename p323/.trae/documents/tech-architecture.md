## 1. 架构设计

```mermaid
flowchart TB
    subgraph "前端层"
        "FE[React 前端]"
    end
    subgraph "后端层"
        "WS[WebSocket 服务器]"
        "BR[REPL 桥接管理器]"
        "UART[UART 连接器]"
        "TELNET[Telnet 连接器]"
    end
    subgraph "设备层"
        "DEV1[MicroPython 设备 - UART]"
        "DEV2[MicroPython 设备 - Telnet]"
    end
    "FE" --> "|WebSocket| WS"
    "WS" --> "BR"
    "BR" --> "UART"
    "BR" --> "TELNET"
    "UART" --> "|串口通信| DEV1"
    "TELNET" --> "|TCP 连接| DEV2"
    "DEV1" --> "|串口数据| UART"
    "DEV2" --> "|Telnet 数据| TELNET"
    "UART" --> "BR"
    "TELNET" --> "BR"
    "BR" --> "WS"
    "WS" --> "|WebSocket 推送| FE"
```

## 2. 技术说明

- **前端**：React@18 + Tailwind CSS@3 + Vite + Zustand
- **初始化工具**：vite-init（react-express-ts 模板）
- **后端**：Express@4 + ws（WebSocket 库）+ serialport（串口通信）+ net（Telnet 内置模块）
- **数据库**：无需数据库，连接配置存储在 localStorage

## 3. 路由定义

| 路由 | 用途 |
|------|------|
| / | 主页面，包含连接管理和 REPL 终端 |

## 4. API 定义

### 4.1 WebSocket 消息协议

```typescript
type ClientMessage =
  | { type: 'connect'; transport: 'uart' | 'telnet'; config: UartConfig | TelnetConfig }
  | { type: 'disconnect' }
  | { type: 'command'; data: string }
  | { type: 'interrupt' }
  | { type: 'soft_reset' }

type ServerMessage =
  | { type: 'connected'; deviceInfo?: string }
  | { type: 'disconnected' }
  | { type: 'output'; data: string }
  | { type: 'error'; message: string }
  | { type: 'status'; state: 'connecting' | 'connected' | 'disconnected' | 'error' }

interface UartConfig {
  path: string
  baudRate: number
}

interface TelnetConfig {
  host: string
  port: number
  password?: string
}
```

## 5. 服务器架构图

```mermaid
flowchart LR
    "WS Handler" --> "REPL Bridge Manager"
    "REPL Bridge Manager" --> "UART Transport"
    "REPL Bridge Manager" --> "Telnet Transport"
    "UART Transport" --> "serialport"
    "Telnet Transport" --> "net.Socket"
```

### 5.1 核心模块

- **WS Handler**：处理 WebSocket 连接和消息收发
- **REPL Bridge Manager**：管理 REPL 连接生命周期，转发命令和输出
- **UART Transport**：基于 serialport 库的串口通信适配器
- **Telnet Transport**：基于 Node.js net 模块的 Telnet 通信适配器

## 6. 数据模型

无需数据库，所有配置数据存储在浏览器 localStorage 中：

- `connectionHistory`：连接历史记录列表
- `lastConnection`：上次成功连接的配置
