## 1. 架构设计

```mermaid
flowchart TD
    subgraph "前端 (Frontend
        A["React UI层"] --> B["Canvas渲染层"]
        A --> C["图层管理器
        C --> D["WASM滤镜模块"]
        D --> B
    end
    subgraph "后端 (Backend)"
        E["Express存储服务"]
    end
    A --> E
```

## 2. 技术描述

### 2.1 前端技术栈
- **框架**: React 18 + TypeScript
- **构建工具**: Vite 5
- **样式**: TailwindCSS 3
- **WASM**: Rust + wasm-pack
- **图像处理**: image (Rust crate)

### 2.2 后端技术栈
- **框架**: Express 4
- **存储**: 本地文件系统
- **CORS**: 支持跨域请求

### 2.3 WASM模块
使用 Rust 编写高性能图像处理算法，编译为 WebAssembly：
- 模糊滤镜：高斯模糊算法
- 锐化滤镜：拉普拉斯算子
- 边缘检测：Sobel算子
- 油画滤镜：K-means颜色量化

## 3. 目录结构

```
project/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ImageUpload.tsx
│   │   │   ├── FilterPanel.tsx
│   │   │   ├── LayerPanel.tsx
│   │   │   └── PreviewCanvas.tsx
│   │   ├── hooks/
│   │   │   └── useWasmFilter.ts
│   │   ├── types/
│   │   │   └── index.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── public/
│   └── package.json
├── wasm/
│   ├── src/
│   │   ├── filters/
│   │   │   ├── blur.rs
│   │   │   ├── sharpen.rs
│   │   │   ├── edge_detect.rs
│   │   │   └── oil_paint.rs
│   │   └── lib.rs
│   └── Cargo.toml
└── backend/
    ├── src/
    │   ├── server.ts
    │   └── storage.ts
    └── package.json
```

## 4. 类型定义

```typescript
// 滤镜类型
type FilterType = 'blur' | 'sharpen' | 'edgeDetect' | 'oilPaint';

// 图层接口
interface Layer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  blendMode: 'normal' | 'multiply' | 'screen' | 'overlay';
  filter: FilterType | null;
  filterIntensity: number;
  imageData: ImageData | null;
}

// WASM模块接口
interface WasmModule {
  blur(data: Uint8Array, width: number, height: number, intensity: number): Uint8Array;
  sharpen(data: Uint8Array, width: number, height: number, intensity: number): Uint8Array;
  edge_detect(data: Uint8Array, width: number, height: number, intensity: number): Uint8Array;
  oil_paint(data: Uint8Array, width: number, height: number, intensity: number): Uint8Array;
}
```

## 5. API 定义

### 5.1 上传图片
- **POST** `/api/upload`
- 请求: multipart/form-data
- 响应: `{ id: string, url: string }`

### 5.2 获取图片
- **GET** `/api/images/:id`
- 响应: 图片文件

### 5.3 保存图片
- **POST** `/api/save`
- 请求: `{ imageData: string }`
- 响应: `{ id: string, url: string }`

## 6. 数据模型

### 6.1 图片存储
```
images/
├── {uuid}.png
└── {uuid}.json (metadata)
```

### 6.2 元数据格式
```json
{
  "id": "uuid",
  "createdAt": "timestamp",
  "width": 800,
  "height": 600,
  "layers": [...]
}
```
