# DICOM 3D 体渲染可视化平台

一个基于 Python + React + Three.js 的全栈医学影像可视化应用，支持 DICOM 序列读取、多平面重建、3D 体渲染和交互式裁剪平面。

## 功能特性

- 📤 **DICOM 上传**：支持批量上传 DICOM 文件，自动解析序列
- 🧠 **多平面重建 (MPR)**：冠状面、矢状面、横断面三插值重建
- 🎨 **3D 体渲染**：基于光线投射算法的高质量体绘制
- ✂️ **裁剪平面**：支持 X/Y/Z 三轴可拖动裁剪平面
- 🪟 **窗宽窗位调节**：预设肺窗、纵隔窗、骨窗、脑窗、腹部窗
- 📷 **图像导出**：导出当前渲染视图为 PNG 图像
- 📊 **多平面视图**：同步显示三轴切片图像

## 技术栈

### 后端
- **Python 3.10+**
- **Flask 3.0**：Web 框架
- **pydicom 2.4**：DICOM 文件解析
- **SimpleITK 2.3**：医学图像处理
- **scipy 1.11**：插值和重采样
- **numpy 1.26**：数值计算

### 前端
- **React 18**：UI 框架
- **TypeScript**：类型安全
- **Three.js**：3D 渲染引擎
- **@react-three/fiber**：React 封装的 Three.js
- **@react-three/drei**：Three.js 工具库
- **Zustand**：状态管理
- **TailwindCSS 3**：样式框架
- **Vite**：构建工具

## 项目结构

```
p140/
├── backend/                    # Python 后端
│   ├── app.py                 # Flask 主应用
│   ├── requirements.txt       # Python 依赖
│   ├── .env                   # 环境变量
│   ├── services/
│   │   ├── dicom_reader.py    # DICOM 解析服务
│   │   ├── reconstruction.py  # 多平面重建服务
│   │   └── volume_processor.py # 体数据处理
│   ├── api/
│   │   ├── dicom_routes.py    # DICOM 相关路由
│   │   └── export_routes.py   # 导出相关路由
│   └── exports/               # 导出文件目录
├── frontend/                   # React 前端
│   ├── src/
│   │   ├── components/
│   │   │   ├── VolumeRenderer.tsx    # 3D体渲染组件
│   │   │   ├── ControlPanel.tsx      # 控制面板
│   │   │   ├── MultiPlanarView.tsx   # 多平面视图
│   │   │   ├── DicomUploader.tsx     # DICOM上传组件
│   │   │   └── Toolbar.tsx           # 顶部工具栏
│   │   ├── shaders/
│   │   │   ├── raycast.vert          # 光线投射顶点着色器
│   │   │   └── raycast.frag          # 光线投射片元着色器
│   │   ├── services/
│   │   │   └── api.ts                # API调用封装
│   │   ├── store/
│   │   │   └── useVolumeStore.ts     # 状态管理
│   │   ├── types/
│   │   │   └── index.ts              # TypeScript类型定义
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   ├── package.json
│   ├── vite.config.ts
│   └── .env
└── .trae/documents/           # 项目文档
```

## 快速开始

### 1. 启动后端服务

```bash
cd backend
pip install -r requirements.txt
python app.py
```

后端服务将在 `http://localhost:5000` 启动。

### 2. 启动前端开发服务器

```bash
cd frontend
npm install
npm run dev
```

前端服务将在 `http://localhost:5173` 启动。

## API 接口

| 方法 | 路径 | 说明 |
|-----|------|------|
| POST | `/api/dicom/upload` | 上传 DICOM 序列 |
| GET | `/api/dicom/sample` | 生成示例数据 |
| GET | `/api/dicom/:sessionId/volume` | 获取体数据 |
| GET | `/api/dicom/:sessionId/mpr` | 获取多平面重建 |
| GET | `/api/dicom/:sessionId/meta` | 获取元信息 |
| POST | `/api/export/image` | 导渲染图像 |
| POST | `/api/export/slice` | 导出切片图像 |

## 使用说明

1. **上传数据**：点击"上传 DICOM"按钮，选择本地 DICOM 文件或使用示例数据
2. **3D 交互**：
   - 左键拖动：旋转视角
   - 滚轮：缩放
   - 右键拖动：平移
3. **调节参数**：使用左侧控制面板调节渲染参数
4. **裁剪平面**：开启 X/Y/Z 轴裁剪平面并拖动滑块调整位置
5. **导出图像**：点击工具栏的相机按钮导出当前视图

## 渲染模式

- **体绘制 (VR)**：基于透明度的直接体绘制，适合观察三维结构
- **最大密度投影 (MIP)**：显示光线上的最大密度值，适合观察血管等高密度结构

## 注意事项

- 最大支持 512×512×256 体数据
- DICOM 单次上传最大 500MB
- 推荐使用 Chrome 或 Edge 浏览器获得最佳性能

## License

MIT
