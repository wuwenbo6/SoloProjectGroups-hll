## 1. 架构设计

```mermaid
graph TD
    subgraph "Frontend (React + TypeScript)"
        A["页面组件"] --> B["状态管理 (Zustand)"]
        B --> C["API 客户端"]
        A --> D["UI 组件 (Tailwind + Lucide)"]
    end
    
    subgraph "Backend (Express + TypeScript)"
        E["路由层 (Controllers)"] --> F["服务层 (Services)"]
        F --> G["LDAP 客户端 (ldapjs)"]
        F --> H["Schema 生成器"]
        F --> I["Schema 验证器"]
    end
    
    subgraph "External Services"
        J["OpenLDAP 服务器"]
    end
    
    C -->|HTTP/HTTPS| E
    G -->|LDAP/LDAPS| J
```

## 2. 技术描述

- **前端**：React@18 + TypeScript + Vite + TailwindCSS@3 + Zustand + React Router DOM
- **后端**：Express@4 + TypeScript + ESM
- **LDAP 客户端**：ldapjs（Node.js LDAP 客户端库）
- **图标**：lucide-react
- **代码高亮**：prismjs 或 react-syntax-highlighter
- **初始化工具**：vite-init 使用 react-express-ts 模板

## 3. 路由定义

### 前端路由

| 路由 | 页面 | 用途 |
|------|------|------|
| / | 重定向到 /connection | 首页重定向 |
| /connection | ConnectionConfig | LDAP 连接配置 |
| /schema | SchemaBrowser | Schema 浏览 |
| /attributes/new | AttributeCreator | 新属性定义 |
| /deploy | SchemaDeploy | Schema 生成与部署 |

### 后端 API 路由

| 路由 | 方法 | 用途 |
|------|------|------|
| /api/ldap/connect | POST | 测试 LDAP 连接 |
| /api/ldap/schema | GET | 获取所有 Schema（objectClasses + attributeTypes） |
| /api/ldap/schema/objectclasses | GET | 获取所有 objectClass |
| /api/ldap/schema/attributetypes | GET | 获取所有 attributeType |
| /api/schema/generate | POST | 根据属性定义生成 Schema LDIF |
| /api/schema/validate | POST | 验证 Schema 合法性 |
| /api/schema/deploy | POST | 部署 Schema 到 LDAP 服务器 |

## 4. API 定义

### 类型定义

```typescript
// LDAP 连接配置
interface LdapConnectionConfig {
  host: string;
  port: number;
  baseDn: string;
  bindDn: string;
  bindPassword: string;
  useTls: boolean;
  caCert?: string;
}

// LDAP 属性类型定义
interface LdapAttributeType {
  oid: string;
  name: string[];
  description?: string;
  syntax: string;
  singleValue: boolean;
  mandatory: boolean;
  collective: boolean;
  obsolete: boolean;
  matchingRule?: string;
  substringMatchingRule?: string;
  orderingMatchingRule?: string;
}

// LDAP 对象类定义
interface LdapObjectClass {
  oid: string;
  name: string[];
  description?: string;
  type: 'structural' | 'auxiliary' | 'abstract';
  must: string[];
  may: string[];
  superior?: string[];
  obsolete: boolean;
}

// 新属性定义表单
interface NewAttributeDefinition {
  name: string;
  oid: string;
  description: string;
  syntax: string;
  singleValue: boolean;
  mandatory: boolean;
  collective: boolean;
  matchingRule?: string;
}

// Schema 生成请求
interface SchemaGenerateRequest {
  attributes: NewAttributeDefinition[];
  objectClassName?: string;
  objectClassOid?: string;
  objectClassType?: 'structural' | 'auxiliary';
}

// Schema 生成响应
interface SchemaGenerateResponse {
  ldifContent: string;
  schemaFileContent: string;
  warnings: string[];
  errors: string[];
}

// 部署请求
interface SchemaDeployRequest {
  ldifContent: string;
  connectionConfig: LdapConnectionConfig;
  restartRequired: boolean;
}

// 部署响应
interface SchemaDeployResponse {
  success: boolean;
  message: string;
  restartRequired: boolean;
  deployLog: string[];
}
```

## 5. 服务器架构图

```mermaid
graph TD
    A["API 路由层 (Routes)"] --> B["控制器 (Controllers)"]
    B --> C["服务层 (Services)"]
    C --> D["LDAP 服务 (LdapService)"]
    C --> E["Schema 服务 (SchemaService)"]
    D --> F["LDAP 客户端 (ldapjs)"]
    E --> G["Schema 生成器"]
    E --> H["Schema 验证器"]
    F --> I["OpenLDAP 服务器"]
```

### 核心模块说明

1. **LdapService**：封装 LDAP 连接、查询、Schema 读取操作
2. **SchemaService**：Schema 生成、验证、部署逻辑
3. **SchemaGenerator**：将属性定义转换为标准 LDAP Schema 格式和 LDIF 格式
4. **SchemaValidator**：验证 OID 格式、名称合法性、语法正确性

## 6. 数据模型

### 6.1 数据模型定义

```mermaid
erDiagram
    LDAP_CONNECTION {
        string host
        int port
        string baseDn
        string bindDn
        string bindPassword
        boolean useTls
    }
    
    ATTRIBUTE_TYPE {
        string oid PK
        string name
        string description
        string syntax
        boolean singleValue
        boolean mandatory
        boolean collective
    }
    
    OBJECT_CLASS {
        string oid PK
        string name
        string type
        string[] must_attributes
        string[] may_attributes
    }
    
    SCHEMA_DEFINITION {
        string id PK
        string name
        string ldifContent
        datetime createdAt
        string status
    }
    
    OBJECT_CLASS ||--o{ ATTRIBUTE_TYPE : contains
    SCHEMA_DEFINITION ||--o{ ATTRIBUTE_TYPE : defines
    SCHEMA_DEFINITION ||--o{ OBJECT_CLASS : defines
```

### 6.2 前端状态管理（Zustand）

```typescript
// LDAP 连接状态
interface LdapStore {
  connectionConfig: LdapConnectionConfig | null;
  isConnected: boolean;
  connectionError: string | null;
  setConnectionConfig: (config: LdapConnectionConfig) => void;
  testConnection: () => Promise<boolean>;
  clearConnection: () => void;
}

// Schema 状态
interface SchemaStore {
  objectClasses: LdapObjectClass[];
  attributeTypes: LdapAttributeType[];
  loading: boolean;
  error: string | null;
  fetchSchema: () => Promise<void>;
  selectedObjectClass: LdapObjectClass | null;
  selectedAttributeType: LdapAttributeType | null;
  setSelectedObjectClass: (oc: LdapObjectClass | null) => void;
  setSelectedAttributeType: (at: LdapAttributeType | null) => void;
}

// 新属性定义状态
interface AttributeDefinitionStore {
  draftAttributes: NewAttributeDefinition[];
  addDraftAttribute: (attr: NewAttributeDefinition) => void;
  removeDraftAttribute: (index: number) => void;
  updateDraftAttribute: (index: number, attr: Partial<NewAttributeDefinition>) => void;
  clearDraftAttributes: () => void;
  generatedLdif: string | null;
  setGeneratedLdif: (ldif: string | null) => void;
}
```
