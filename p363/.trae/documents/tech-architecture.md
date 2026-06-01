## 1. 架构设计

```mermaid
graph TB
    subgraph "前端层"
        FE["React + TypeScript + Tailwind"]
        WS_CLIENT["WebSocket Client"]
        CHART["Recharts 图表"]
    end
    subgraph "后端层 (Python)"
        API["FastAPI REST"]
        WS_SERVER["FastAPI WebSocket"]
        ENGINE["模拟引擎"]
        DELAY["延迟模拟器"]
        CONSIST["一致性检测器"]
    end
    subgraph "数据层"
        STATE["内存状态 (模拟集群)"]
        LOG["事件日志队列"]
    end
    FE --> API
    FE <--> WS_SERVER
    WS_SERVER --> ENGINE
    API --> ENGINE
    ENGINE --> DELAY
    ENGINE --> CONSIST
    ENGINE --> STATE
    ENGINE --> LOG
    CONSIST --> STATE
```

## 2. 技术说明

- **前端**：React@18 + TypeScript + Tailwind CSS@3 + Vite
- **初始化工具**：vite-init（react-ts模板）
- **后端**：Python FastAPI + WebSocket
- **图表**：Recharts（延迟曲线、同步速率图）
- **数据**：内存模拟，无持久化数据库
- **实时通信**：WebSocket推送同步状态、延迟数据、一致性检测结果

## 3. 路由定义

| 路由 | 用途 |
|------|------|
| / | 仪表盘主页面，展示集群拓扑、同步进度、延迟监控、一致性检测 |
| /console | 控制台页面，参数配置和事件日志 |

## 4. API 定义

### 4.1 REST API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/status | 获取模拟器整体状态 |
| POST | /api/simulate/start | 启动模拟 |
| POST | /api/simulate/stop | 停止模拟 |
| POST | /api/simulate/pause | 暂停模拟 |
| PUT | /api/config | 更新模拟参数配置 |
| GET | /api/config | 获取当前配置 |
| POST | /api/consistency/check | 触发一致性检测 |
| GET | /api/logs | 获取事件日志（分页） |

### 4.2 WebSocket 消息类型

```typescript
interface SyncProgressMessage {
  type: "sync_progress"
  images: Array<{
    id: string
    name: string
    totalBlocks: number
    syncedBlocks: number
    rate: number
    eta: number
  }>
}

interface LatencyMessage {
  type: "latency"
  timestamp: number
  rtt: number
  jitter: number
  packetLoss: number
}

interface ConsistencyMessage {
  type: "consistency"
  inconsistentBlocks: Array<{
    imageId: string
    blockIndex: number
    primaryHash: string
    backupHash: string
  }>
  totalChecked: number
  inconsistentCount: number
}

interface LogMessage {
  type: "log"
  level: "info" | "warn" | "error"
  message: string
  timestamp: number
}

interface ClusterStatusMessage {
  type: "cluster_status"
  primary: { osds: number; poolUsage: number; iops: number }
  backup: { osds: number; poolUsage: number; iops: number }
}
```

### 4.3 配置参数

```typescript
interface SimConfig {
  blockSize: number        // 块大小 (KB), 默认 4096
  imageSize: number        // 镜像大小 (MB), 默认 1024
  imageCount: number       // 镜像数量, 默认 3
  baseLatency: number      // 基础延迟 (ms), 默认 50
  jitterRange: number      // 抖动范围 (ms), 默认 30
  packetLossRate: number   // 丢包率 (0-1), 默认 0.02
  bandwidth: number        // 带宽限制 (MB/s), 默认 100
  primaryOsds: number      // 主集群OSD数量, 默认 6
  backupOsds: number       // 备集群OSD数量, 默认 6
  consistencyInterval: number  // 一致性检测间隔 (s), 默认 5
}
```

## 5. 后端架构图

```mermaid
graph LR
    subgraph "FastAPI"
        ROUTER["API Router"]
        WS_HANDLER["WebSocket Handler"]
    end
    subgraph "模拟引擎"
        SIM["SimulationEngine"]
        PRIMARY["PrimaryCluster"]
        BACKUP["BackupCluster"]
        NETWORK["NetworkSimulator"]
        CHECKER["ConsistencyChecker"]
    end
    ROUTER --> SIM
    WS_HANDLER --> SIM
    SIM --> PRIMARY
    SIM --> BACKUP
    SIM --> NETWORK
    SIM --> CHECKER
    PRIMARY ---|"异步复制"| NETWORK
    NETWORK ---|"传输"| BACKUP
    CHECKER ---|"对比"| PRIMARY
    CHECKER ---|"对比"| BACKUP
```

## 6. 数据模型

### 6.1 核心数据模型

```mermaid
erDiagram
    Cluster ||--o{ OSD : contains
    Cluster ||--o{ Pool : contains
    Pool ||--o{ RBDImage : contains
    RBDImage ||--o{ Block : consists_of
    SyncTask ||--o{ BlockSync : tracks
    ConsistencyReport ||--o{ BlockDiff : reports

    Cluster {
        string id
        string name
        string role
        int osd_count
    }
    OSD {
        string id
        string cluster_id
        float usage
        string status
    }
    Pool {
        string id
        string cluster_id
        string name
        float usage
    }
    RBDImage {
        string id
        string pool_id
        string name
        int size_mb
        int total_blocks
        int synced_blocks
    }
    Block {
        int index
        string image_id
        string hash
        string status
    }
    SyncTask {
        string id
        string image_id
        string status
        float progress
        float rate
    }
    BlockSync {
        string task_id
        int block_index
        int attempts
        float latency
        string status
    }
    ConsistencyReport {
        string id
        int timestamp
        int total_checked
        int inconsistent_count
    }
    BlockDiff {
        string report_id
        int block_index
        string primary_hash
        string backup_hash
    }
```
