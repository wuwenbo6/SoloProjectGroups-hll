## 1. 架构设计

```mermaid
graph TD
    subgraph "前端层"
        A["React + TypeScript"]
        B["Three.js + Path Tracing"]
        C["Zustand 状态管理"]
        D["WASM 数学计算加速"]
    end
    
    subgraph "后端层"
        E["Node.js + Express"]
        F["场景文件存储服务"]
        G["文件上传处理"]
    end
    
    subgraph "数据层"
        H["本地文件系统存储"]
        I["JSON 场景元数据"]
    end
    
    A --> B
    A --> C
    B --> D
    A <--> E
    E --> F
    E --> G
    F --> H
    G --> H
    F --> I
```

## 2. 技术描述

- **前端**：React@18 + TypeScript + Vite + TailwindCSS@3
- **3D引擎**：Three.js + three-path-tracing (基于WebGL2)
- **状态管理**：Zustand
- **图标**：lucide-react
- **后端**：Express@4 (Node.js)
- **文件存储**：本地文件系统 + multer
- **WASM模块**：用于加速光线追踪数学计算

## 3. 路由定义

| 路由 | 用途 |
|-------|---------|
| / | 主编辑器页面 |
| /api/scenes | 获取场景列表 |
| /api/scenes/:id | 获取/保存特定场景 |
| /api/upload | 上传GLTF模型文件 |
| /api/export | 导出高分辨率渲染图 |

## 4. API 定义

```typescript
// 场景元数据
interface SceneMetadata {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  modelUrl: string;
  materials: MaterialConfig[];
  cameraPosition: [number, number, number];
  cameraTarget: [number, number, number];
}

// 材质配置
interface MaterialConfig {
  id: string;
  name: string;
  metalness: number;
  roughness: number;
  color: string;
}

// 渲染导出参数
interface ExportParams {
  width: number;
  height: number;
  samples: number;
  format: 'png' | 'jpg';
}

// API 响应
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
```

## 5. 服务器架构图

```mermaid
graph TD
    A["客户端请求"] --> B["Express 路由层"]
    B --> C["SceneController"]
    B --> D["UploadController"]
    B --> E["ExportController"]
    
    C --> F["SceneService"]
    D --> G["UploadService"]
    E --> H["ExportService"]
    
    F --> I["FileRepository"]
    G --> I
    H --> J["RenderService"]
    
    I --> K["文件系统存储"]
    J --> L["Canvas 渲染"]
```

## 6. 数据模型

### 6.1 数据模型定义

```mermaid
erDiagram
    SCENE {
        string id PK
        string name
        datetime createdAt
        datetime updatedAt
        string modelPath
        json materials
        json cameraState
    }
    
    MATERIAL {
        string id PK
        string sceneId FK
        string name
        float metalness
        float roughness
        string color
    }
    
    SCENE ||--o{ MATERIAL : contains
```

### 6.2 文件存储结构

```
storage/
├── scenes/
│   ├── {scene-id}.json
│   └── models/
│       └── {scene-id}/
│           ├── scene.gltf
│           └── textures/
└── exports/
    └── {export-id}.png
```
