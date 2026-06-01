## 1. 架构设计

```mermaid
flowchart TD
    subgraph "前端层"
        A["React 应用"]
        A1["查询输入组件"]
        A2["验证状态展示"]
        A3["验证链可视化"]
        A4["记录详情面板"]
        A --> A1 & A2 & A3 & A4
    end

    subgraph "API层"
        B["Express 服务器"]
        B1["/api/verify 接口"]
        B --> B1
    end

    subgraph "服务层"
        C["DNS查询服务"]
        D["DNSSEC验证服务"]
        E["RRSIG解析器"]
        F["签名验证器"]
        C & D & E & F
    end

    subgraph "外部服务"
        G["DNS递归解析器"]
    end

    A1 --> B1
    B1 --> C
    B1 --> D
    C --> G
    D --> E
    D --> F
```

## 2. 技术描述

- **前端**：React@18 + TypeScript + TailwindCSS@3 + Vite@5 + Framer Motion（动画）
- **初始化工具**：Vite
- **后端**：Express@4 + TypeScript + ts-node
- **DNS库**：`dns`（Node.js内置）+ `dns-packet`（DNS报文解析）+ `@types/node`
- **加密库**：Node.js `crypto` 模块（用于签名验证）
- **HTTP客户端**：Axios（前后端通信）

## 3. 路由定义

| 路由 | 用途 |
|------|------|
| / | 首页，DNSSEC验证主界面 |
| /api/verify | DNSSEC验证API接口 |

## 4. API 定义

### 4.1 验证请求

```typescript
interface VerifyRequest {
  domain: string;
  recordType: 'A' | 'AAAA' | 'NS' | 'TXT' | 'MX' | 'SOA' | 'CNAME';
}
```

### 4.2 验证响应

```typescript
interface DNSRecord {
  name: string;
  type: string;
  ttl: number;
  data: string;
}

interface DSRecord extends DNSRecord {
  keyTag: number;
  algorithm: number;
  digestType: number;
  digest: string;
}

interface DNSKEYRecord extends DNSRecord {
  flags: number;
  protocol: number;
  algorithm: number;
  publicKey: string;
  keyTag: number;
  isZSK: boolean;
  isKSK: boolean;
}

interface RRSIGRecord extends DNSRecord {
  typeCovered: string;
  algorithm: number;
  labels: number;
  originalTTL: number;
  signatureExpiration: number;
  signatureInception: number;
  keyTag: number;
  signerName: string;
  signature: string;
}

interface VerificationStep {
  name: string;
  status: 'passed' | 'failed' | 'pending';
  message: string;
  details?: string;
}

interface ChainNode {
  id: 'ds' | 'dnskey' | 'rrsig';
  name: string;
  status: 'passed' | 'failed' | 'pending';
  records: DSRecord[] | DNSKEYRecord[] | RRSIGRecord[];
}

interface VerifyResponse {
  success: boolean;
  domain: string;
  recordType: string;
  overallStatus: 'passed' | 'failed' | 'unsigned';
  timestamp: string;
  duration: number;
  chain: ChainNode[];
  steps: VerificationStep[];
  targetRecords: DNSRecord[];
  error?: string;
}
```

## 5. 服务器架构图

```mermaid
flowchart TD
    A["API Controller<br>/api/verify"] --> B["DNS Query Service"]
    A --> C["DNSSEC Verification Service"]
    B --> D["DNS Resolver"]
    D --> E[(DNS Server)]
    C --> F["RRSIG Parser"]
    C --> G["Signature Verifier"]
    C --> H["DS Digest Verifier"]
    F --> I["DNS Packet Parser"]
    G --> J["Crypto Module"]
    H --> J
```

## 6. 核心验证流程

### 6.1 DNSSEC验证步骤

```mermaid
flowchart TD
    A["1. 查询目标记录 + RRSIG"] --> B["2. 查询DNSKEY记录"]
    B --> C["3. 查询DS记录（父域）"]
    C --> D["4. 验证DS记录哈希"]
    D --> E{"DS验证通过?"}
    E -->|否| F["验证失败：DS不匹配"]
    E -->|是| G["5. 验证DNSKEY签名(RRSIG DNSKEY)"]
    G --> H{"DNSKEY签名有效?"}
    H -->|否| I["验证失败：DNSKEY签名无效"]
    H -->|是| J["6. 使用ZSK验证目标记录RRSIG"]
    J --> K{"RRSIG签名有效?"}
    K -->|否| L["验证失败：RRSIG签名无效"]
    K -->|是| M["验证通过"]
```

### 6.2 数据模型

```typescript
// DNS查询结果
interface DNSQueryResult {
  records: DNSRecord[];
  rrsig?: RRSIGRecord;
}

// 验证上下文
interface VerificationContext {
  domain: string;
  recordType: string;
  targetRecords: DNSRecord[];
  targetRRSIG?: RRSIGRecord;
  dnskeyRecords: DNSKEYRecord[];
  dnskeyRRSIG?: RRSIGRecord;
  dsRecords: DSRecord[];
  steps: VerificationStep[];
}
```

## 7. 项目目录结构

```
p230/
├── client/                    # 前端应用
│   ├── src/
│   │   ├── components/        # React组件
│   │   │   ├── QueryInput.tsx
│   │   │   ├── StatusBadge.tsx
│   │   │   ├── ChainVisualizer.tsx
│   │   │   ├── RecordDetails.tsx
│   │   │   └── VerificationSteps.tsx
│   │   ├── types/             # TypeScript类型定义
│   │   ├── hooks/             # 自定义Hooks
│   │   ├── utils/             # 工具函数
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
├── server/                    # 后端服务
│   ├── src/
│   │   ├── controllers/       # API控制器
│   │   ├── services/          # 业务逻辑
│   │   │   ├── dnsQuery.ts    # DNS查询服务
│   │   │   ├── dnssecVerify.ts # DNSSEC验证服务
│   │   │   ├── rrsigParser.ts # RRSIG解析
│   │   │   └── signatureVerify.ts # 签名验证
│   │   ├── types/             # 类型定义
│   │   ├── utils/             # 工具函数
│   │   └── index.ts           # 服务器入口
│   ├── package.json
│   └── tsconfig.json
└── .trae/
    └── documents/
```
