## 1. 架构设计

```mermaid
flowchart TB
    subgraph "前端层"
        "FE[React + Vite + Tailwind]"
    end
    subgraph "后端层"
        "BE[Flask + Scapy]"
    end
    "FE" -->|"HTTP API"| "BE"
    "BE" -->|"Scapy 封装/解封装"| "PKT[数据包处理]"
```

## 2. 技术说明

- 前端：React@18 + TailwindCSS@3 + Vite + TypeScript
- 初始化工具：vite-init（react-ts 模板）
- 后端：Python 3 + Flask + Scapy
- 数据库：无（模拟计算，无需持久化）

## 3. 路由定义

| 路由 | 用途 |
|------|------|
| / | 主页面，包含封装/解封装双面板 |

## 4. API 定义

### 4.1 封装接口

**POST /api/encapsulate**

请求体：
```typescript
interface EncapsulateRequest {
  eth: {
    dst: string;       // 目的MAC，如 "aa:bb:cc:dd:ee:ff"
    src: string;       // 源MAC
    type: number;      // 以太类型，如 0x0800
  };
  payload: string;     // 十六进制载荷
  outer_ip: {
    src: string;       // 外层源IP
    dst: string;       // 外层目的IP
  };
  vni: number;         // VXLAN Network Identifier
  next_protocol: number; // VXLAN GPE Next Protocol（1=IPv4, 2=IPv6, 3=Ethernet, 4=NSH）
  udp_src_port?: number; // 可选UDP源端口，默认随机
  udp_dst_port?: number; // 可选UDP目的端口，默认4790
}
```

响应体：
```typescript
interface EncapsulateResponse {
  layers: ProtocolLayer[];
  raw_hex: string;     // 完整报文十六进制
}

interface ProtocolLayer {
  name: string;        // 协议名：Ethernet / IP / UDP / VXLAN_GPE / Inner_Ethernet
  fields: FieldEntry[];
  raw_hex: string;     // 该层十六进制
  offset: number;      // 在完整报文中的偏移
}

interface FieldEntry {
  name: string;        // 字段名
  value: string;       // 字段值（可读格式）
  bits: number;        // 字段位宽
  hex: string;         // 字段原始十六进制
}
```

### 4.2 解封装接口

**POST /api/decapsulate**

请求体：
```typescript
interface DecapsulateRequest {
  raw_hex: string;     // VXLAN GPE 封装报文十六进制
}
```

响应体：
```typescript
interface DecapsulateResponse {
  layers: ProtocolLayer[];
  inner_ethernet: {
    dst: string;
    src: string;
    type: number;
    payload: string;
  };
}
```

### 4.3 预设示例接口

**GET /api/presets**

响应体：
```typescript
interface Preset {
  name: string;
  description: string;
  encapsulate_request: EncapsulateRequest;
}
```

## 5. 后端架构

```mermaid
flowchart LR
    "CTRL[Flask 路由控制器]" --> "SVC[封装/解封装服务]"
    "SVC" --> "SCAPY[Scapy 数据包构造/解析]"
    "SCAPY" --> "RESULT[层级解析结果]"
```

### 5.1 后端模块结构

```
backend/
├── app.py              # Flask 应用入口 & 路由
├── vxlan_gpe.py        # VXLAN GPE 封装/解封装核心逻辑
├── layer_parser.py     # 协议层解析器（提取各层字段）
└── presets.py           # 预设示例数据
```

### 5.2 Scapy VXLAN GPE 协议定义

VXLAN GPE 头部结构（8字节）：
- Flags (1 byte): bit 3 = I flag（VNI 有效）
- Reserved (3 bytes)
- Next Protocol (1 byte): 1=IPv4, 2=IPv6, 3=Ethernet, 4=NSH
- VNI (3 bytes)
- Reserved (1 byte)

在 Scapy 中需自定义 `VXLAN_GPE` 协议类，添加 `next_protocol` 字段。

## 6. 前端组件结构

```
src/
├── pages/
│   └── Home.tsx              # 主页面
├── components/
│   ├── EncapPanel.tsx        # 封装输入面板
│   ├── DecapPanel.tsx        # 解封装输入面板
│   ├── ProtocolStack.tsx     # 协议栈可视化
│   ├── LayerCard.tsx         # 单层协议卡片
│   ├── FieldTable.tsx        # 字段详情表格
│   └── HexViewer.tsx         # 十六进制报文查看器
├── hooks/
│   └── useApi.ts             # API 请求 hook
├── utils/
│   └── types.ts              # TypeScript 类型定义
└── store/
    └── usePacketStore.ts     # Zustand 状态管理
```
