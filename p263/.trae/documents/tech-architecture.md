## 1. 架构设计

```mermaid
graph TB
    subgraph "前端层"
        A["React SPA"]
        A1["小区拓扑地图 Canvas"]
        A2["参数面板"]
        A3["S准则计算可视化"]
        A4["重选日志"]
        A5["仿真控制台"]
    end
    subgraph "后端层 Python Flask"
        B["Flask REST API"]
        B1["仿真引擎"]
        B2["S准则计算模块"]
        B3["R准则排序模块"]
        B4["路径损耗模型"]
    end
    subgraph "数据层"
        C["仿真状态 in-memory"]
        C1["小区配置"]
        C2["终端状态"]
        C3["重选日志"]
    end
    A -->|"HTTP/JSON"| B
    B --> C
    B1 --> B2
    B1 --> B3
    B1 --> B4
```

## 2. 技术说明

- 前端：React@18 + TailwindCSS@3 + Vite
- 初始化工具：Vite
- 后端：Python Flask + Flask-CORS
- 数据库：无，使用内存存储仿真状态
- 通信协议：REST API + JSON

## 3. 路由定义

| 路由 | 用途 |
|------|------|
| `/` | 主仿真页面 |
| `/api/cells` | 获取所有小区配置与当前测量值 |
| `/api/simulation/start` | 启动仿真 |
| `/api/simulation/pause` | 暂停仿真 |
| `/api/simulation/reset` | 重置仿真 |
| `/api/simulation/step` | 单步执行仿真 |
| `/api/simulation/status` | 获取当前仿真状态 |
| `/api/simulation/config` | 更新仿真配置参数 |
| `/api/logs` | 获取重选决策日志 |

## 4. API定义

### 4.1 获取小区信息 GET /api/cells

```typescript
interface CellInfo {
  pci: number;
  earfcn: number;
  position: { x: number; y: number };
  rsrp: number;            // dBm 当前测量值
  q_rxlevmin: number;      // dBm 最小接收电平
  q_rxlevminoffset: number; // dB 偏移
  q_hyst: number;          // dB 迟滞值
  p_compensation: number;  // dB 功率补偿
  s_rxlev: number;         // 计算得到的S值
  is_serving: boolean;
}

interface CellsResponse {
  cells: CellInfo[];
  serving_pci: number;
}
```

### 4.2 仿真控制 POST /api/simulation/start|pause|reset|step

```typescript
interface SimulationStatus {
  running: boolean;
  step_count: number;
  ue_position: { x: number; y: number };
  serving_pci: number;
  reselection_count: number;
}
```

### 4.3 重选日志 GET /api/logs

```typescript
interface ReselectionLog {
  timestamp: number;
  step: number;
  event_type: "measurement" | "s_criterion" | "reselection";
  source_pci: number | null;
  target_pci: number | null;
  details: {
    rsrp_source: number;
    rsrp_target: number;
    s_rxlev_target: number;
    r_s: number;
    r_n: number;
  };
}

interface LogsResponse {
  logs: ReselectionLog[];
}
```

### 4.4 更新配置 POST /api/simulation/config

```typescript
interface SimulationConfig {
  speed: number;           // 仿真步进间隔 ms
  q_rxlevmin: number;      // 全局默认最小接收电平
  q_hyst: number;          // 全局默认迟滞值
  treselection: number;    // 重选持续时间 步数
  path_loss_exponent: number; // 路径损耗指数
}
```

## 5. 服务端架构图

```mermaid
graph LR
    "Flask Router" --> "SimulationService"
    "SimulationService" --> "PathLossModel"
    "SimulationService" --> "SCriterion"
    "SimulationService" --> "RCriterion"
    "SimulationService" --> "CellRepository"
    "SimulationService" --> "LogRepository"
```

## 6. 数据模型

### 6.1 数据模型定义

```mermaid
erDiagram
    CELL {
        int pci PK
        int earfcn
        float pos_x
        float pos_y
        float q_rxlevmin
        float q_rxlevminoffset
        float q_hyst
        float q_offset
        float p_compensation
        float tx_power
    }
    UE {
        int id PK
        float pos_x
        float pos_y
        int serving_pci FK
        int step_count
    }
    MEASUREMENT {
        int id PK
        int step
        int pci FK
        float rsrp
        float s_rxlev
    }
    RESELECTION_LOG {
        int id PK
        int step
        string event_type
        int source_pci FK
        int target_pci FK
        float rsrp_source
        float rsrp_target
        float s_rxlev_target
        float r_s
        float r_n
    }
    UE ||--o{ MEASUREMENT : generates
    CELL ||--o{ MEASUREMENT : measured_by
    UE ||--o{ RESELECTION_LOG : triggers
    CELL ||--o{ RESELECTION_LOG : source
    CELL ||--o{ RESELECTION_LOG : target
```

## 7. 核心算法

### 7.1 S准则

```
S_rxlev = Q_rxlevmeas - (Q_rxlevmin + Q_rxlevminoffset) - P_compensation
```
- S_rxlev > 0 → 小区满足驻留条件

### 7.2 R准则排序

```
R_s = Q_meas,s + Q_hyst         （服务小区）
R_n = Q_meas,n - Q_offset        （邻区）
```
- 若 R_n > R_s 持续 Treselection 时间 → 执行重选

### 7.3 路径损耗模型

```
RSRP = Tx_Power - PathLoss
PathLoss = 128.1 + 37.6 * log10(d) + N(0, σ)
```
- d 为终端到基站距离（km）
- σ 为对数正态阴影衰落标准差（典型8dB）
