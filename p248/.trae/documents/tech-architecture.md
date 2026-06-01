## 1. 架构设计

```mermaid
flowchart TB
    subgraph "前端层"
        "A[React + TypeScript]"
        "A1[文件上传组件]"
        "A2[报告展示组件]"
        "A3[源码预览组件]"
    end
    subgraph "后端层 - Python FastAPI"
        "B[API路由层]"
        "B1[文件上传接口]"
        "B2[验证结果接口]"
        "C[验证引擎层]"
        "C1[XML解析器 - lxml]"
        "C2[DASH-IF IOP规则引擎]"
        "C3[报告生成器]"
    end
    "A1" --> "|上传MPD文件| B1"
    "B1" --> "|传递文件| C1"
    "C1" --> "|解析结果| C2"
    "C2" --> "|验证结果| C3"
    "C3" --> "|报告| B2"
    "B2" --> "|JSON报告| A2"
```

## 2. 技术说明
- 前端：React@18 + TypeScript + Vite + Tailwind CSS + Zustand
- 初始化工具：vite-init
- 后端：Python 3.10+ / FastAPI + lxml + uvicorn
- 数据库：无（纯验证工具，无持久化需求）

## 3. 路由定义
| 路由 | 用途 |
|------|------|
| / | 验证主页面（上传+报告） |

## 4. API 定义

### 4.1 上传并验证 MPD 文件
- **POST** `/api/validate`
- **Request**: `multipart/form-data`，字段 `file` 为 MPD/XML 文件
- **Response**:
```typescript
interface ValidationResult {
  status: "success" | "error";
  filename: string;
  fileSize: number;
  mpdType: "static" | "dynamic";
  profiles: string[];
  summary: {
    total: number;
    passed: number;
    warnings: number;
    errors: number;
  };
  rules: RuleResult[];
  xmlSource: string;
}

interface RuleResult {
  id: string;
  category: string;
  severity: "error" | "warning" | "info";
  status: "pass" | "fail" | "not_applicable";
  description: string;
  detail?: string;
  xpath?: string;
  suggestion?: string;
}
```

### 4.2 健康检查
- **GET** `/api/health`
- **Response**: `{ status: "ok" }`

## 5. 验证引擎 - DASH-IF IOP 规则

### 5.1 SegmentTemplate 模板验证
| 规则ID | 描述 | 严重级别 |
|--------|------|----------|
| ST-001 | SegmentTemplate 必须包含 `media` 属性或子元素 SegmentTimeline | error |
| ST-002 | `media` 属性中的模板标识符（`$Number$`、`$Time$`、`$Bandwidth$`）必须与 `index` 属性一致 | error |
| ST-003 | `initialization` 属性中不应包含 `$Number$` 或 `$Time$` | warning |
| ST-004 | `timescale` 默认值为1，显式设置时应为正整数 | error |
| ST-005 | `startNumber` 应为非负整数 | warning |
| ST-006 | SegmentTimeline 中 `t` 和 `d` 属性必须为非负整数 | error |

### 5.2 时间尺度与持续时间验证
| 规则ID | 描述 | 严重级别 |
|--------|------|----------|
| TS-001 | `MPD@mediaPresentationDuration` 必须存在于 static 类型 MPD | error |
| TS-002 | `Period@duration` 或通过 `start` 计算的持续时间必须为合法 ISO 8601 格式 | error |
| TS-003 | `SegmentTemplate@duration` 与 `timescale` 配合计算的时间必须与 Period 持续时间一致 | warning |
| TS-004 | `minimumUpdatePeriod` 必须存在于 dynamic 类型 MPD | error |

### 5.3 Representation 属性验证
| 规则ID | 描述 | 严重级别 |
|--------|------|----------|
| RP-001 | 每个 Representation 必须包含 `bandwidth` 属性且为正整数 | error |
| RP-002 | 每个 Representation 必须包含 `id` 属性 | error |
| RP-003 | 视频 Representation 应包含 `width`、`height`、`frameRate` 属性 | warning |
| RP-004 | 音频 Representation 应包含 `audioSamplingRate` 属性 | warning |
| RP-005 | `codecs` 属性必须存在于 AdaptationSet 或 Representation 层级 | error |
| RP-006 | `mimeType` 属性必须存在于 AdaptationSet 或 Representation 层级 | error |

### 5.4 Period 与结构验证
| 规则ID | 描述 | 严重级别 |
|--------|------|----------|
| PD-001 | MPD 必须至少包含一个 Period 元素 | error |
| PD-002 | 多个 Period 时，后续 Period 必须有 `start` 属性或前一个 Period 有 `duration` | error |
| PD-003 | AdaptationSet 必须包含至少一个 Representation | error |
| PD-004 | `ContentProtection` 元素必须包含 `schemeIdUri` 属性 | error |

### 5.5 DASH-IF IOP 特定规则
| 规则ID | 描述 | 严重级别 |
|--------|------|----------|
| IOP-001 | `profiles` 属性应包含 DASH-IF IOP profile URI | warning |
| IOP-002 | 建议使用 SegmentTemplate 而非 SegmentList 或 SegmentBase | info |
| IOP-003 | `BaseURL` 元素不应在 Representation 层级使用（IOP 推荐 AdaptationSet 级别） | warning |
| IOP-004 | 视频 AdaptationSet 应包含 `ContentComponent` 或 `par`（宽高比）属性 | info |

## 6. 服务器架构图

```mermaid
flowchart LR
    "Client" --> "|HTTP| FastAPI"
    subgraph "FastAPI Server"
        "Router" --> "ValidatorService"
        "ValidatorService" --> "XMLParser"
        "ValidatorService" --> "RuleEngine"
        "RuleEngine" --> "ReportGenerator"
    end
```

## 7. 项目目录结构

```
p248/
├── src/                    # 前端源码
│   ├── components/         # React 组件
│   │   ├── FileUpload.tsx
│   │   ├── ValidationReport.tsx
│   │   ├── RuleCard.tsx
│   │   ├── ReportSummary.tsx
│   │   ├── XmlPreview.tsx
│   │   └── DetailPanel.tsx
│   ├── hooks/              # 自定义 Hooks
│   ├── pages/              # 页面
│   │   └── ValidatorPage.tsx
│   ├── store/              # Zustand 状态管理
│   │   └── validationStore.ts
│   ├── types/              # TypeScript 类型定义
│   │   └── validation.ts
│   ├── utils/              # 工具函数
│   ├── App.tsx
│   └── main.tsx
├── api/                    # Python 后端
│   ├── main.py             # FastAPI 入口
│   ├── validators/         # 验证器模块
│   │   ├── __init__.py
│   │   ├── segment_template.py
│   │   ├── timescale.py
│   │   ├── representation.py
│   │   ├── period.py
│   │   └── iop_rules.py
│   ├── models.py           # Pydantic 数据模型
│   └── requirements.txt    # Python 依赖
├── package.json
├── vite.config.ts
└── tailwind.config.js
```
