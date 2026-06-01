## 1. 架构设计

```mermaid
flowchart TD
    "浏览器前端" --> "CBOR编解码引擎"
    "CBOR编解码引擎" --> "cbor-js库"
    "浏览器前端" --> "Zustand状态管理"
    "浏览器前端" --> "Tailwind CSS样式"
    "浏览器前端" --> "Vite构建工具"
```

纯前端架构，所有CBOR编解码在浏览器本地完成，无需后端服务。

## 2. 技术说明

- **前端框架**：React@18 + TypeScript + Vite
- **样式方案**：Tailwind CSS@3
- **状态管理**：Zustand
- **CBOR库**：cbor-js（纯JS CBOR编解码库）
- **图标**：lucide-react
- **路由**：react-router-dom
- **初始化工具**：vite-init (react-ts模板)

## 3. 路由定义

| 路由 | 用途 |
|------|------|
| / | 主页面，包含解码和编码两个Tab切换 |

## 4. 数据流设计

### 解码数据流
```
Hex字符串/文件 → Uint8Array → cbor.decode() → JS对象 → 诊断表示法格式化 → 显示
                                                    → 树形结构数据 → 树形视图显示
```

### 编码数据流
```
诊断表示法文本 → 解析为JS对象 → cbor.encode() → Uint8Array → Hex字符串显示
                                                                 → 触发二进制下载
```

## 5. 核心模块设计

### 5.1 CBOR工具模块 (`src/utils/cbor.ts`)
- `hexToUint8Array(hex: string): Uint8Array` — Hex字符串转字节数组
- `uint8ArrayToHex(bytes: Uint8Array): string` — 字节数组转Hex字符串
- `decodeCbor(bytes: Uint8Array): unknown` — CBOR二进制解码
- `encodeCbor(data: unknown): Uint8Array` — CBOR编码
- `toDiagnosticNotation(data: unknown): string` — 将JS对象转为诊断表示法
- `parseDiagnosticNotation(text: string): unknown` — 将诊断表示法解析为JS对象

### 5.2 状态管理 (`src/store/cborStore.ts`)
- `inputMode`: 'hex' | 'file' — 输入模式
- `hexInput`: string — Hex输入内容
- `diagnosticOutput`: string — 诊断表示法输出
- `activeTab`: 'decode' | 'encode' — 当前Tab
- `parseTree`: TreeNode | null — 解析树数据
- `error`: string | null — 错误信息

### 5.3 组件结构
```
src/
├── components/
│   ├── HexInput.tsx        — Hex文本输入组件
│   ├── FileUpload.tsx      — 文件上传组件
│   ├── DiagnosticOutput.tsx — 诊断表示法输出组件
│   ├── TreeView.tsx        — 解析树视图组件
│   ├── EncodeInput.tsx     — 编码输入组件
│   ├── HexOutput.tsx       — Hex输出组件
│   ├── TabSwitch.tsx       — Tab切换组件
│   └── ExampleSelector.tsx — 示例数据选择器
├── pages/
│   └── Home.tsx            — 主页面
├── store/
│   └── cborStore.ts        — Zustand状态
├── utils/
│   └── cbor.ts             — CBOR编解码工具函数
├── App.tsx
└── main.tsx
```
