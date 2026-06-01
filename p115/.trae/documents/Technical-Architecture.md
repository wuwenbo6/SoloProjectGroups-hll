## 1. 架构设计

```mermaid
graph TB
    subgraph Frontend["前端 (React + TypeScript)"]
        A1["仪表盘页面"]
        A2["映射配置页面"]
        A3["节点浏览器页面"]
        A4["系统设置页面"]
        A5["状态管理 (Zustand)"]
        A6["UI组件库"]
    end
    
    subgraph Backend["后端 (Node.js + Express)"]
        B1["API 控制器层"]
        B2["业务服务层"]
        B3["Excel解析模块 (xlsx)"]
        B4["OPC UA服务器模块 (node-opcua)"]
        B5["数据库访问层"]
    end
    
    subgraph Database["数据存储"]
        C1["SQLite 数据库"]
        C2["映射规则表"]
        C3["配置参数表"]
        C4["设备信息表"]
    end
    
    A1 --> B1
    A2 --> B1
    A3 --> B1
    A4 --> B1
    A5 --> A1
    A5 --> A2
    A5 --> A3
    A5 --> A4
    
    B1 --> B2
    B2 --> B3
    B2 --> B4
    B2 --> B5
    
    B5 --> C1
    C1 --> C2
    C1 --> C3
    C1 --> C4
```

## 2. 技术描述

- **前端**：React@18 + TypeScript + Vite + TailwindCSS@3 + Zustand + Lucide React
- **初始化工具**：vite-init (react-express-ts模板)
- **后端**：Express@4 + TypeScript + node-opcua + xlsx + better-sqlite3
- **数据库**：SQLite (文件型数据库，便于部署)
- **核心依赖**：
  - `node-opcua`: OPC UA服务器实现
  - `xlsx`: Excel文件解析
  - `better-sqlite3`: SQLite数据库操作
  - `multer`: 文件上传处理
  - `zustand`: 前端状态管理

## 3. 路由定义

### 前端路由

| 路由 | 页面 | 用途 |
|------|------|------|
| /dashboard | 仪表盘 | 服务器状态概览和快捷操作 |
| /mapping | 映射配置 | Excel上传和映射规则编辑 |
| /browse | 节点浏览 | OPC UA地址空间树形浏览 |
| /settings | 系统设置 | 服务器和数据库配置 |

### 后端API路由

| 路由 | 方法 | 用途 |
|------|------|------|
| /api/upload | POST | 上传Excel映射文件 |
| /api/mapping | GET | 获取映射规则列表 |
| /api/mapping | POST | 保存映射规则 |
| /api/mapping/:id | PUT | 更新映射规则 |
| /api/mapping/:id | DELETE | 删除映射规则 |
| /api/opcua/nodes | GET | 获取OPC UA节点树 |
| /api/opcua/nodes/:nodeId | GET | 获取节点详情 |
| /api/opcua/server/status | GET | 获取服务器状态 |
| /api/opcua/server/start | POST | 启动OPC UA服务器 |
| /api/opcua/server/stop | POST | 停止OPC UA服务器 |
| /api/config | GET | 获取系统配置 |
| /api/config | PUT | 更新系统配置 |

## 4. API定义

### TypeScript类型定义

```typescript
// 映射规则类型
interface MappingRule {
  id: number;
  deviceName: string;
  registerType: string;
  registerAddress: number;
  dataType: string;
  opcuaNodeId: string;
  opcuaBrowseName: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

// OPC UA节点类型
interface OpcuaNode {
  nodeId: string;
  browseName: string;
  displayName: string;
  nodeClass: string;
  dataType: string;
  value: any;
  children: OpcuaNode[];
}

// 服务器状态类型
interface ServerStatus {
  running: boolean;
  endpointUrl: string;
  connectedClients: number;
  totalNodes: number;
  startTime: string | null;
}

// 系统配置类型
interface SystemConfig {
  opcuaPort: number;
  opcuaEndpoint: string;
  databasePath: string;
  autoStart: boolean;
}

// Excel解析结果
interface ExcelParseResult {
  success: boolean;
  data: MappingRule[];
  errors: string[];
}
```

## 5. 服务器架构图

```mermaid
graph LR
    subgraph API_Layer["API 层"]
        A["Express Router"]
    end
    
    subgraph Service_Layer["服务层"]
        B1["ExcelService"]
        B2["OpcuaService"]
        B3["MappingService"]
        B4["ConfigService"]
    end
    
    subgraph Data_Layer["数据层"]
        C["Database (SQLite)"]
    end
    
    subgraph External["外部模块"]
        D["node-opcua"]
        E["xlsx"]
    end
    
    A --> B1
    A --> B2
    A --> B3
    A --> B4
    
    B1 --> E
    B2 --> D
    B3 --> C
    B4 --> C
```

## 6. 数据模型

### 6.1 数据模型定义

```mermaid
erDiagram
    MAPPING_RULES {
        INTEGER id PK "主键"
        TEXT device_name "设备名称"
        TEXT register_type "寄存器类型"
        INTEGER register_address "寄存器地址"
        TEXT data_type "数据类型"
        TEXT opcua_node_id "OPC UA节点ID"
        TEXT opcua_browse_name "OPC UA浏览名称"
        TEXT description "描述"
        DATETIME created_at "创建时间"
        DATETIME updated_at "更新时间"
    }
    
    SYSTEM_CONFIG {
        INTEGER id PK "主键"
        TEXT config_key "配置键"
        TEXT config_value "配置值"
        DATETIME updated_at "更新时间"
    }
    
    DEVICES {
        INTEGER id PK "主键"
        TEXT name "设备名称"
        TEXT ip_address "IP地址"
        INTEGER port "端口号"
        INTEGER slave_id "从站ID"
        TEXT description "描述"
        BOOLEAN enabled "是否启用"
        DATETIME created_at "创建时间"
    }
```

### 6.2 数据定义语言

```sql
-- 映射规则表
CREATE TABLE IF NOT EXISTS mapping_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_name TEXT NOT NULL,
  register_type TEXT NOT NULL,
  register_address INTEGER NOT NULL,
  data_type TEXT NOT NULL,
  opcua_node_id TEXT NOT NULL UNIQUE,
  opcua_browse_name TEXT NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 系统配置表
CREATE TABLE IF NOT EXISTS system_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  config_key TEXT NOT NULL UNIQUE,
  config_value TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 设备信息表
CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  port INTEGER DEFAULT 502,
  slave_id INTEGER DEFAULT 1,
  description TEXT,
  enabled BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 初始配置数据
INSERT OR IGNORE INTO system_config (config_key, config_value) VALUES
  ('opcua_port', '4840'),
  ('opcua_endpoint', '/OPCUA/Server'),
  ('database_path', './data/database.sqlite'),
  ('auto_start', 'false');
```
