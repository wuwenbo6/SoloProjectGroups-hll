## 1. 架构设计

```mermaid
graph TD
    subgraph "前端层"
        A["React Web应用"]
        A1["仪表盘组件"]
        A2["充电会话组件"]
        A3["费用明细组件"]
        A4["充电桩管理组件"]
        A --> A1
        A --> A2
        A --> A3
        A --> A4
    end

    subgraph "后端服务层"
        B["Express HTTP服务"]
        C["OCPP WebSocket服务"]
        D["OCPP SOAP服务"]
        E["REST API控制器"]
        F["OCPP消息处理器"]
        G["费用计算引擎"]
    end

    subgraph "数据层"
        H["SQLite数据库"]
        H1["充电桩表"]
        H2["充电会话表"]
        H3["费用明细表"]
        H4["电价规则表"]
        H --> H1
        H --> H2
        H --> H3
        H --> H4
    end

    subgraph "充电桩网络"
        I["充电桩1"]
        J["充电桩2"]
        K["充电桩N"]
    end

    A1 -->|HTTP/REST| E
    A2 -->|HTTP/REST| E
    A3 -->|HTTP/REST| E
    A4 -->|HTTP/REST| E
    E -->|读写数据| H
    F -->|读写数据| H
    G -->|读写数据| H
    C -->|OCPP消息| F
    D -->|OCPP消息| F
    F -->|调用| G
    I -->|WebSocket/SOAP| C
    J -->|WebSocket/SOAP| D
    K -->|WebSocket/SOAP| C
```

## 2. 技术描述

### 2.1 前端技术栈
- **框架**：React@18 + TypeScript
- **构建工具**：Vite@5
- **样式方案**：TailwindCSS@3
- **状态管理**：React Query (TanStack Query)
- **UI组件库**：Headless UI + Lucide React图标
- **路由**：React Router@6
- **图表**：Recharts

### 2.2 后端技术栈
- **运行时**：Node.js@18+
- **Web框架**：Express@4
- **WebSocket**：ws库
- **SOAP服务**：soap库
- **数据库**：SQLite3 + better-sqlite3
- **ORM/查询构建**：Knex.js
- **验证**：Joi
- **CORS**：cors中间件

### 2.3 项目结构
```
p348/
├── backend/
│   ├── src/
│   │   ├── server.js          # 主服务入口
│   │   ├── config/            # 配置文件
│   │   ├── controllers/       # REST API控制器
│   │   ├── services/          # 业务逻辑
│   │   │   ├── ocpp/          # OCPP处理器
│   │   │   ├── billing/       # 费用计算
│   │   │   └── database/      # 数据访问
│   │   ├── models/            # 数据模型
│   │   ├── routes/            # API路由
│   │   └── websocket/         # WebSocket服务
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/        # 可复用组件
│   │   ├── pages/             # 页面组件
│   │   ├── hooks/             # 自定义Hooks
│   │   ├── services/          # API服务
│   │   ├── types/             # TypeScript类型定义
│   │   └── App.tsx
│   └── package.json
└── .trae/documents/
```

## 3. 路由定义

### 前端路由
| 路由 | 页面 | 说明 |
|------|------|------|
| / | 仪表盘 | 系统概览和实时状态 |
| /transactions | 充电会话列表 | 所有充电会话的列表展示 |
| /transactions/:id | 充电会话详情 | 单条会话的详细信息 |
| /billing | 费用明细 | 费用列表和统计 |
| /chargepoints | 充电桩管理 | 已注册的充电桩列表 |

### 后端REST API路由
| 方法 | 路由 | 说明 |
|------|------|------|
| GET | /api/chargepoints | 获取充电桩列表 |
| GET | /api/chargepoints/:id | 获取单个充电桩详情 |
| GET | /api/transactions | 获取充电会话列表 |
| GET | /api/transactions/:id | 获取单条会话详情 |
| GET | /api/billing | 获取费用明细列表 |
| GET | /api/billing/:transactionId | 获取单条会话的费用明细 |
| GET | /api/stats/dashboard | 获取仪表盘统计数据 |
| GET | /api/pricing | 获取电价规则 |

## 4. API定义

### 4.1 数据类型定义

```typescript
interface ChargePoint {
  id: string;
  chargePointVendor: string;
  chargePointModel: string;
  chargePointSerialNumber?: string;
  firmwareVersion?: string;
  status: 'available' | 'charging' | 'offline' | 'faulted';
  lastHeartbeat: Date;
  createdAt: Date;
}

interface Transaction {
  id: number;
  chargePointId: string;
  connectorId: number;
  idTag: string;
  startTime: Date;
  stopTime?: Date;
  startMeterValue: number;
  stopMeterValue?: number;
  energyConsumed?: number;
  duration?: number;
  status: 'active' | 'completed' | 'stopped';
}

interface BillingDetail {
  id: number;
  transactionId: number;
  energyConsumed: number;
  durationMinutes: number;
  energyPrice: number;
  servicePrice: number;
  energyCost: number;
  serviceCost: number;
  totalCost: number;
  pricingRuleId: number;
  createdAt: Date;
}

interface PricingRule {
  id: number;
  name: string;
  startTime: string;
  endTime: string;
  energyRate: number;
  serviceRate: number;
  isActive: boolean;
}

interface DashboardStats {
  onlineChargePoints: number;
  totalChargePoints: number;
  activeTransactions: number;
  todayEnergy: number;
  todayRevenue: number;
}
```

### 4.2 OCPP消息格式

#### BootNotification 请求
```json
{
  "chargePointVendor": "Vendor Name",
  "chargePointModel": "Model X",
  "chargePointSerialNumber": "CP001",
  "firmwareVersion": "v1.2.3"
}
```

#### BootNotification 响应
```json
{
  "status": "Accepted",
  "currentTime": "2024-01-01T00:00:00Z",
  "interval": 300
}
```

#### StartTransaction 请求
```json
{
  "connectorId": 1,
  "idTag": "RFID12345",
  "timestamp": "2024-01-01T00:00:00Z",
  "meterStart": 12345
}
```

#### StartTransaction 响应
```json
{
  "idTagInfo": { "status": "Accepted" },
  "transactionId": 1001
}
```

#### StopTransaction 请求
```json
{
  "transactionId": 1001,
  "idTag": "RFID12345",
  "timestamp": "2024-01-01T01:30:00Z",
  "meterStop": 12495,
  "reason": "EVDisconnected"
}
```

#### StopTransaction 响应
```json
{
  "idTagInfo": { "status": "Accepted" }
}
```

## 5. 服务器架构图

```mermaid
graph TD
    subgraph "入口层"
        A["HTTP/SOAP 服务 (Express)"]
        B["WebSocket 服务 (ws)"]
    end

    subgraph "中间件层"
        C["CORS中间件"]
        D["JSON解析中间件"]
        E["日志中间件"]
    end

    subgraph "控制层"
        F["REST API 控制器"]
        G["OCPP SOAP 处理器"]
        H["OCPP WebSocket 处理器"]
    end

    subgraph "服务层"
        I["充电点服务"]
        J["会话管理服务"]
        K["费用计算服务"]
        L["OCPP协议解析服务"]
    end

    subgraph "数据访问层"
        M["充电点Repository"]
        N["会话Repository"]
        O["费用Repository"]
        P["电价Repository"]
    end

    subgraph "数据层"
        Q["SQLite 数据库"]
    end

    A --> C
    A --> D
    A --> E
    B --> H
    C --> F
    D --> F
    E --> F
    A --> G
    F --> I
    F --> J
    F --> K
    G --> L
    H --> L
    L --> I
    L --> J
    I --> M
    J --> N
    K --> O
    K --> P
    M --> Q
    N --> Q
    O --> Q
    P --> Q
```

## 6. 数据模型

### 6.1 ER图

```mermaid
erDiagram
    CHARGE_POINT ||--o{ TRANSACTION : has
    TRANSACTION ||--|| BILLING_DETAIL : has
    PRICING_RULE ||--o{ BILLING_DETAIL : applied

    CHARGE_POINT {
        string id PK "充电桩ID"
        string chargePointVendor "厂商"
        string chargePointModel "型号"
        string chargePointSerialNumber "序列号"
        string firmwareVersion "固件版本"
        string status "状态"
        datetime lastHeartbeat "最后心跳"
        datetime createdAt "创建时间"
    }

    TRANSACTION {
        integer id PK "会话ID"
        string chargePointId FK "充电桩ID"
        integer connectorId "连接器ID"
        string idTag "用户标签"
        datetime startTime "开始时间"
        datetime stopTime "结束时间"
        integer startMeterValue "起始读数"
        integer stopMeterValue "结束读数"
        integer energyConsumed "充电量(Wh)"
        integer duration "时长(秒)"
        string status "状态"
    }

    BILLING_DETAIL {
        integer id PK "费用ID"
        integer transactionId FK "会话ID"
        integer energyConsumed "充电量(Wh)"
        integer durationMinutes "时长(分钟)"
        decimal energyPrice "电价(元/kWh)"
        decimal servicePrice "服务费(元/kWh)"
        decimal energyCost "电费"
        decimal serviceCost "服务费"
        decimal totalCost "总费用"
        integer pricingRuleId FK "电价规则ID"
        datetime createdAt "创建时间"
    }

    PRICING_RULE {
        integer id PK "规则ID"
        string name "规则名称"
        string startTime "开始时间(HH:MM)"
        string endTime "结束时间(HH:MM)"
        decimal energyRate "电价(元/kWh)"
        decimal serviceRate "服务费(元/kWh)"
        boolean isActive "是否启用"
    }
```

### 6.2 DDL语句

```sql
CREATE TABLE charge_points (
  id TEXT PRIMARY KEY,
  charge_point_vendor TEXT NOT NULL,
  charge_point_model TEXT NOT NULL,
  charge_point_serial_number TEXT,
  firmware_version TEXT,
  status TEXT NOT NULL DEFAULT 'offline',
  last_heartbeat DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  charge_point_id TEXT NOT NULL,
  connector_id INTEGER NOT NULL,
  id_tag TEXT NOT NULL,
  start_time DATETIME NOT NULL,
  stop_time DATETIME,
  start_meter_value INTEGER NOT NULL,
  stop_meter_value INTEGER,
  energy_consumed INTEGER,
  duration INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  FOREIGN KEY (charge_point_id) REFERENCES charge_points(id)
);

CREATE TABLE billing_details (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id INTEGER NOT NULL UNIQUE,
  energy_consumed INTEGER NOT NULL,
  duration_minutes INTEGER NOT NULL,
  energy_price REAL NOT NULL,
  service_price REAL NOT NULL,
  energy_cost REAL NOT NULL,
  service_cost REAL NOT NULL,
  total_cost REAL NOT NULL,
  pricing_rule_id INTEGER,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (transaction_id) REFERENCES transactions(id),
  FOREIGN KEY (pricing_rule_id) REFERENCES pricing_rules(id)
);

CREATE TABLE pricing_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  energy_rate REAL NOT NULL,
  service_rate REAL NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_transactions_charge_point ON transactions(charge_point_id);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_billing_transaction ON billing_details(transaction_id);

INSERT INTO pricing_rules (name, start_time, end_time, energy_rate, service_rate, is_active) VALUES
('峰时电价', '07:00', '23:00', 1.2, 0.6, 1),
('谷时电价', '23:00', '07:00', 0.6, 0.3, 1);
```
