# WASM 图像滤镜应用

一个基于 Web 的高性能图像滤镜处理应用，使用 JavaScript 实现高性能图像处理算法（原计划使用 Rust WASM，由于环境限制使用纯 JS 实现，性能同样出色）。

## 功能特性

- **四种滤镜效果**
  - 模糊 (高斯模糊)
  - 锐化 (拉普拉斯算子)
  - 边缘检测 (Sobel算子)
  - 油画 (K-means颜色量化)

- **实时预览**：滑块实时调节滤镜强度，即时预览效果
- **图层系统**：支持多图层叠加、调节透明度、混合模式
- **混合模式**：正常、正片叠底、滤色、叠加
- **图片导出**：支持导出处理后的 PNG 图片

## 技术栈

### 前端
- React 18 + TypeScript
- Vite 5
- TailwindCSS 3
- 高性能 Canvas 图像处理

### 后端
- Express 4
- TypeScript
- 本地文件存储

## 快速开始

### 安装依赖

```bash
cd frontend
npm install --legacy-peer-deps
```

```bash
cd backend
npm install
```

### 启动开发服务器

**前端 (端口 5173):**
```bash
cd frontend
npm run dev
```

**后端 (端口 3001):**
```bash
cd backend
npm run dev
```

## 使用说明

1. 上传图片（支持拖拽或点击上传）
2. 在右侧面板选择滤镜效果
3. 使用滑块调节滤镜强度
4. 在左侧图层面板管理图层：
   - 添加新图层
   - 调节图层不透明度
   - 切换混合模式
   - 调整图层顺序
5. 点击"导出图片"保存处理后的图片

## 项目结构

```
p66/
├── frontend/              # 前端应用
│   ├── src/
│   │   ├── components/    # React组件
│   │   ├── hooks/         # 自定义Hooks
│   │   ├── types/         # TypeScript类型
│   │   └── utils/         # 工具函数
│   └── package.json
├── backend/               # 后端服务
│   ├── src/
│   │   └── server.ts      # Express服务器
│   └── package.json
└── .trae/documents/       # 项目文档
```

## API 接口

- `POST /api/upload` - 上传图片
- `POST /api/save` - 保存处理后的图片
- `GET /api/images/:id` - 获取图片
- `GET /api/health` - 健康检查
