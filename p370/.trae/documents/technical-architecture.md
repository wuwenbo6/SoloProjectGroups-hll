## 1. 架构设计

```mermaid
graph TD
    subgraph Frontend["前端 (React + TypeScript)"]
        UI["UI组件层<br/>(仪表盘、控制面板、日志)"]
        STATE["状态管理<br/>(Zustand)"]
        WS["WebSocket客户端"]
        HTTP["HTTP客户端"]
    end
    
    subgraph Backend["后端 (Python)"]
        API["REST API + WebSocket<br/>(FastAPI)"]
        ISCSI["iSCSI目标器核心<br/>(纯Python实现)"]
        ERL["错误恢复引擎<br/>(ERL=0/1/2)"]
        SIM["故障模拟器"]
        STATS["统计与状态管理"]
    end
    
    subgraph Data["数据层"]
        MEM["内存状态存储<br/>(命令队列、会话状态)"]
        LOGS["环形日志缓冲区"]
    end
    
    UI --> STATE
    STATE --> WS
    STATE --> HTTP
    WS --> API
    HTTP --> API
    API --> ISCSI
    API --> ERL
    API --> SIM
    API --> STATS
    ISCSI --> ERL
    ISCSI --> SIM
    ERL --> STATS
    STATS --> MEM
    STATS --> LOGS
    SIM --> MEM
```

## 2. 技术描述

- **前端**：React@18 + TypeScript + Vite + Tailwind CSS@3 + Zustand + lucide-react
- **初始化工具**：vite-init
- **后端**：Python 3.10+ + FastAPI + uvicorn + websockets
- **iSCSI实现**：纯Python实现，基于RFC 3720规范
- **数据存储**：内存存储（无需持久化数据库），使用asyncio.Queue管理命令队列

## 3. 路由定义

| 路由 | 用途 |
|------|------|
| / | 监控面板（首页） |
| /control | 控制中心 |
| /commands | 命令详情 |
| /api/status | 获取目标器状态 |
| /api/stats | 获取统计数据 |
| /api/erl | 设置ERL级别 |
| /api/fault | 触发/停止故障模拟 |
| /api/target/start | 启动目标器 |
| /api/target/stop | 停止目标器 |
| /ws/logs | 实时日志WebSocket |
| /ws/stats | 统计数据WebSocket |

## 4. API 定义

```typescript
// 状态类型定义
interface TargetStatus {
  isRunning: boolean;
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'recovering' | 'fault';
  erlLevel: 0 | 1 | 2;
  uptime: number;
  initiatorIQN: string | null;
  targetIQN: string;
  listenAddress: string;
}

interface Statistics {
  totalCommands: number;
  successfulCommands: number;
  retransmittedCommands: number;
  failedCommands: number;
  totalRetries: number;
  activeCommands: number;
  faultCount: number;
  recoveryCount: number;
  averageRecoveryTime: number;
}

interface ISCSILogEntry {
  id: string;
  timestamp: number;
  level: 'info' | 'debug' | 'warning' | 'error';
  direction: 'in' | 'out' | 'system';
  pduType?: string;
  message: string;
  connectionId?: string;
}

interface CommandRecord {
  id: string;
  cmdSN: number;
  expStatSN: number;
  opcode: string;
  status: 'pending' | 'active' | 'retransmitting' | 'completed' | 'failed';
  retryCount: number;
  createdAt: number;
  completedAt?: number;
  events: CommandEvent[];
}

interface CommandEvent {
  type: 'created' | 'sent' | 'acked' | 'retransmit' | 'completed' | 'failed';
  timestamp: number;
  connectionId?: string;
  reason?: string;
}

// 请求/响应
interface SetERLRequest {
  level: 0 | 1 | 2;
}

interface TriggerFaultRequest {
  type: 'manual' | 'auto';
  probability?: number;
  duration?: number;
}

interface StartTargetRequest {
  targetIQN?: string;
  listenAddress?: string;
  listenPort?: number;
}
```

## 5. 后端架构

```mermaid
graph TD
    subgraph API["API层 (FastAPI)"]
        REST["REST endpoints"]
        WS["WebSocket endpoints"]
    end
    
    subgraph Service["服务层"]
        TargetService["iSCSI Target Service"]
        RecoveryService["Error Recovery Service"]
        FaultService["Fault Simulation Service"]
        StatsService["Statistics Service"]
    end
    
    subgraph Core["iSCSI核心层"]
        PDU["PDU Parser/Serializer"]
        StateMachine["会话状态机"]
        CommandQueue["命令队列管理"]
        Connection["连接管理器"]
    end
    
    subgraph ERL["错误恢复层"]
        ERL0["ERL=0 - 会话丢弃"]
        ERL1["ERL=1 - 命令重试"]
        ERL2["ERL=2 - 会话恢复"]
    end
    
    REST --> TargetService
    REST --> RecoveryService
    REST --> FaultService
    REST --> StatsService
    WS --> StatsService
    
    TargetService --> StateMachine
    TargetService --> CommandQueue
    TargetService --> Connection
    
    StateMachine --> PDU
    CommandQueue --> PDU
    
    RecoveryService --> ERL0
    RecoveryService --> ERL1
    RecoveryService --> ERL2
    
    FaultService --> Connection
    FaultService --> StatsService
    
    StatsService --> CommandQueue
    StatsService --> Connection
```

## 6. 数据模型

### 6.1 数据模型定义

```mermaid
erDiagram
    SESSION ||--o{ CONNECTION : has
    SESSION ||--o{ COMMAND : contains
    COMMAND ||--o{ CMD_EVENT : has
    CONNECTION ||--o{ PDU_TRANSFER : has
    
    SESSION {
        string session_id PK
        string initiator_iqn
        string target_iqn
        int erl_level
        string state
        int cmd_sn
        int exp_stat_sn
        datetime created_at
    }
    
    CONNECTION {
        string connection_id PK
        string session_id FK
        string state
        string address
        int cid
        datetime connected_at
    }
    
    COMMAND {
        string command_id PK
        string session_id FK
        int cmd_sn
        int exp_stat_sn
        string opcode
        string status
        int retry_count
        datetime created_at
        datetime completed_at
    }
    
    CMD_EVENT {
        string event_id PK
        string command_id FK
        string type
        datetime timestamp
        string connection_id FK
        string reason
    }
    
    PDU_TRANSFER {
        string transfer_id PK
        string connection_id FK
        string direction
        string pdu_type
        int data_length
        datetime timestamp
        boolean is_retransmission
    }
```

### 6.2 核心数据结构

```python
# iSCSI PDU 基础结构（简化版）
class ISCSIPDU:
    opcode: int
    flags: int
    total_ahs_len: int
    data_segment_len: int
    lun: int
    initiator_task_tag: int
    data: bytes

# 会话状态
class SessionState(Enum):
    FREE = "free"
    LOGGED_IN = "logged_in"
    CONTINUE = "continue"
    ERROR_RECOVERY = "error_recovery"
    LOGOUT_REQUEST = "logout_request"

# 连接状态
class ConnectionState(Enum):
    FREE = "free"
    XPT_WAIT = "xpt_wait"
    IN_LOGIN = "in_login"
    LOGGED_IN = "logged_in"
    IN_LOGOUT = "in_logout"
    LOGOUT_REQUESTED = "logout_requested"
    CLEANUP_WAIT = "cleanup_wait"

# 错误恢复级别
class ErrorRecoveryLevel(Enum):
    ERL0 = 0  # 会话丢弃
    ERL1 = 1  # 命令重试
    ERL2 = 2  # 会话恢复
```
