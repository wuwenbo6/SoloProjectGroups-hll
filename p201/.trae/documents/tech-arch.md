## 1. 架构设计

```mermaid
flowchart TB
    subgraph "前端 (React + Vite)"
        "A[配置树组件]" --> "B[Zustand Store]"
        "C[详情面板]" --> "B"
        "D[工具栏/搜索]" --> "B"
        "B" --> "E[API Client]"
    end
    subgraph "后端 (Express)"
        "F[Kconfig 解析器]" --> "G[配置树构建器]"
        "G" --> "H[依赖关系图]"
        "I[.config 生成器]" --> "J[导出服务]"
        "K[API Routes"]
        "K" --> "F"
        "K" --> "I"
    end
    "E" --> "K"
```

## 2. 技术说明

- 前端：React@18 + TypeScript + TailwindCSS@3 + Vite
- 初始化工具：vite-init
- 后端：Express@4 + TypeScript (ESM)
- 数据库：无（基于文件的解析，状态存于前端 Store + 内存）
- 状态管理：Zustand

## 3. 路由定义

| 路由 | 用途 |
|------|------|
| `/` | 配置主页：上传文件、配置树、详情面板 |
| `/config/:id` | 已保存配置的查看页（可选扩展） |

## 4. API 定义

### 4.1 解析 Kconfig

```
POST /api/kconfig/parse
Request:  FormData { file: File }
Response: {
  tree: KconfigNode[];
  symbols: Record<string, KconfigSymbol>;
}
```

### 4.2 获取示例 Kconfig

```
GET /api/kconfig/sample
Response: {
  tree: KconfigNode[];
  symbols: Record<string, KconfigSymbol>;
}
```

### 4.3 生成 .config

```
POST /api/kconfig/generate
Request:  { values: Record<string, string | boolean> }
Response: { config: string }  // .config 文件内容
```

### 4.4 验证依赖

```
POST /api/kconfig/validate
Request:  { symbol: string; values: Record<string, string | boolean> }
Response: { valid: boolean; unmetDeps: string[] }
```

### 核心类型定义

```typescript
interface KconfigNode {
  id: string;
  type: 'config' | 'menu' | 'choice' | 'comment';
  name?: string;
  prompt?: string;
  help?: string;
  configType?: 'bool' | 'tristate' | 'string' | 'int' | 'hex';
  defaultValue?: string;
  dependsOn?: string[];
  select?: string[];
  implies?: string[];
  children?: KconfigNode[];
  choiceOptions?: KconfigNode[];
}

interface KconfigSymbol {
  name: string;
  type: 'bool' | 'tristate' | 'string' | 'int' | 'hex';
  value: string | boolean;
  dependencies: string[];
  reverseDependencies: string[];
  selectedBy: string[];
}
```

## 5. 服务端架构图

```mermaid
flowchart LR
    "Controller" --> "KconfigParser"
    "KconfigParser" --> "TreeBuilder"
    "TreeBuilder" --> "DepGraph"
    "Controller" --> "ConfigGenerator"
```

## 6. 数据模型

### 6.1 数据模型定义

无持久化数据库。数据流为：Kconfig 文件 → 解析为内存中的树结构 → 前端 Store 维护用户选择 → 生成 .config 文本输出。

### 6.2 数据定义语言

不适用。
