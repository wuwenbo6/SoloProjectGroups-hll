## 1. 架构设计

```mermaid
flowchart TB
    subgraph "前端层 (React + Vite)"
        "A[帧结构可视化组件]"
        "B[时隙占用图组件]"
        "C[复用/解复用控制面板]"
        "D[映射开销编辑器]"
    end
    subgraph "后端层 (Python Flask)"
        "E[OTN帧模拟引擎]"
        "F[复用/解复用服务]"
        "G[开销处理服务]"
    end
    subgraph "数据层"
        "H[帧数据模型<br/>内存状态]"
    end
    "A" --> "E"
    "B" --> "E"
    "C" --> "F"
    "D" --> "G"
    "E" --> "H"
    "F" --> "H"
    "G" --> "H"
```

## 2. 技术说明

- 前端：React@18 + TypeScript + Tailwind CSS + Vite
- 初始化工具：vite-init (react-ts 模板)
- 后端：Python Flask (REST API)
- 数据库：无，使用内存状态管理（Zustand + Python内存数据结构）
- 前后端通信：RESTful JSON API

## 3. 路由定义

| 路由 | 用途 |
|------|------|
| / | 模拟器主页面：帧结构可视化、复用/解复用控制、时隙占用图 |
| /frame/:oduType | 帧详情页面：ODU2/ODU3帧字节级查看与开销解析 |

## 4. API 定义

### 4.1 帧操作 API

```typescript
interface ODUFrame {
  oduType: "ODU0" | "ODU2" | "ODU3";
  rows: number;
  columns: number;
  payload: number[][];
  overhead: ODUOverhead;
  timeslots: TimeslotInfo[];
}

interface ODUOverhead {
  fas: number[];       // Frame Alignment Signal: 6 bytes
  mfAS: number;        // Multi-Frame Alignment Signal: 1 byte
  odukOh: {
    pm: PMOverhead;     // Path Monitoring
    tcm: TCMOverhead[]; // Tandem Connection Monitoring (6 levels)
    aps: number[];      // Automatic Protection Switching
    exp: number[];      // Experimental bytes
  };
  opukOh: {
    pt: number;         // Payload Type
    psi: number[];      // Payload Structure Identifier
    jc: number[];       // Justification Control
    jo: number[];       // Justification Opportunity
    njo: number;        // Negative Justification Opportunity
    pjo: number;        // Positive Justification Opportunity
  };
}

interface TimeslotInfo {
  index: number;        // 时隙编号 (1-8 for ODU2)
  occupied: boolean;
  odu0Id: string | null;
  mappingType: "GMP" | "AMP" | null;
}

interface PMOverhead {
  tti: number[];       // Trail Trace Identifier: 64 bytes
  bdi: boolean;        // Backward Defect Indication
  tim: boolean;        // Trace Identifier Mismatch
  bei: number;         // Backward Error Indication
  biae: boolean;       // Backward Incoming Alignment Error
  status: number;      // Signal Status
}

interface TCMOverhead {
  tti: number[];
  bdi: boolean;
  tim: boolean;
  bei: number;
  status: number;
  ltc: boolean;        // Loss of Tandem Connection
  ais: boolean;        // Alarm Indication Signal
  oci: boolean;        // Open Connection Indication
  lck: boolean;        // Locked
}
```

### 4.2 REST 端点

| 方法 | 端点 | 请求体 | 响应 | 用途 |
|------|------|--------|------|------|
| GET | /api/frame/:oduType | - | ODUFrame | 获取帧结构 |
| POST | /api/multiplex | {oduType, odu0Signals[], mappingType} | ODUFrame | 执行复用映射 |
| POST | /api/demultiplex | {oduType, timeslotIndex} | ODUFrame | 执行解复用 |
| PUT | /api/overhead/:oduType | {overhead: ODUOverhead} | ODUFrame | 更新映射开销 |
| GET | /api/timeslots/:oduType | - | TimeslotInfo[] | 获取时隙占用状态 |
| POST | /api/timeslots/:oduType/allocate | {odu0Id, timeslotIndex} | TimeslotInfo[] | 分配时隙 |
| DELETE | /api/timeslots/:oduType/:index | - | TimeslotInfo[] | 释放时隙 |

## 5. 服务端架构图

```mermaid
flowchart LR
    "Controller<br/>(Flask Routes)" --> "Service<br/>(OTN Simulator)" --> "Model<br/>(Frame Data)"
```

### 5.1 Python 后端模块

- `app.py`：Flask 应用入口与路由定义
- `otn/frame.py`：OTN帧数据模型（ODU0/ODU2/ODU3）
- `otn/overhead.py`：映射开销处理（PM/TCM/OPUk OH）
- `otn/multiplex.py`：复用/解复用引擎（GMP/AMP映射）
- `otn/timeslot.py`：时隙管理

## 6. 数据模型

### 6.1 数据模型定义

```mermaid
erDiagram
    "ODUFrame" ||--o{ "Timeslot" : "contains"
    "ODUFrame" ||--|| "ODUOverhead" : "has"
    "ODUOverhead" ||--|| "PMOverhead" : "includes"
    "ODUOverhead" ||--o{ "TCMOverhead" : "includes"
    "ODUOverhead" ||--|| "OPUkOverhead" : "includes"
    "Timeslot" ||--o| "ODU0Signal" : "carries"
    "ODUFrame" {
        "string oduType PK"
        "int rows"
        "int columns"
        "int payload"
    }
    "Timeslot" {
        "int index PK"
        "boolean occupied"
        "string odu0Id FK"
        "string mappingType"
    }
    "ODU0Signal" {
        "string id PK"
        "string name"
        "float bitrate"
    }
```

### 6.2 关键参数

| ODU类型 | 行数 | 列数 | 净荷列数 | 时隙数(1.25G) | 速率(Gbps) |
|---------|------|------|----------|---------------|------------|
| ODU0 | 4 | 3824 | 3808 | 1 | 1.244160 |
| ODU2 | 4 | 3824 | 3808 | 8 | 10.037318 |
| ODU3 | 4 | 3824 | 3808 | 32 | 40.319219 |
