# PointCloud Detection System

一个全栈3D点云目标检测系统，使用 PointNet++ 检测车辆和行人，Three.js 进行可视化。

## 功能特性

- **点云上传**: 支持 .pcd 和 .bin 格式的点云文件上传
- **3D 可视化**: 使用 Three.js 渲染点云，支持交互式视角控制
- **目标检测**: 基于 PointNet++ 的深度学习模型，检测车辆和行人
- **检测结果存储**: SQLite 数据库存储检测历史
- **性能指标**: mAP 计算和 PR 曲线可视化

## 技术栈

### 后端
- Python 3.10+
- Flask - Web 框架
- Open3D - 点云处理
- PyTorch - 深度学习框架
- SQLite - 数据库

### 前端
- React 18
- TypeScript
- Three.js - 3D 渲染
- TailwindCSS - 样式框架
- Chart.js - 图表可视化

## 快速开始

### 1. 启动后端

```bash
cd backend

# 创建虚拟环境
python -m venv venv
source venv/bin/activate  # macOS/Linux

# 安装依赖
pip install -r requirements.txt

# 启动服务
python app.py
```

后端服务将在 http://localhost:5000 启动

### 2. 启动前端

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务
npm run dev
```

前端服务将在 http://localhost:3000 启动

## 项目结构

```
p12/
├── backend/
│   ├── app.py              # Flask 应用入口
│   ├── config.py           # 配置文件
│   ├── database.py         # 数据库操作
│   ├── requirements.txt    # Python 依赖
│   ├── api/
│   │   └── routes.py       # API 路由
│   ├── services/
│   │   ├── point_cloud.py  # 点云处理服务
│   │   ├── detection.py    # 目标检测服务
│   │   └── metrics.py      # 指标计算服务
│   ├── ml/                 # 机器学习模型
│   ├── models/             # 数据模型
│   └── uploads/            # 上传文件存储
├── frontend/
│   ├── src/
│   │   ├── App.tsx         # 主应用组件
│   │   ├── components/     # React 组件
│   │   ├── services/       # API 服务
│   │   └── types/          # TypeScript 类型定义
│   └── package.json
└── .trae/documents/        # 项目文档
```

## API 接口

### 文件管理
- `POST /api/upload` - 上传点云文件
- `GET /api/files` - 获取文件列表
- `GET /api/files/:id` - 获取文件详情
- `DELETE /api/files/:id` - 删除文件

### 点云操作
- `GET /api/pointcloud/:fileId` - 获取点云数据

### 目标检测
- `POST /api/detect/:fileId` - 运行目标检测
- `GET /api/detections/:fileId` - 获取检测结果

### 指标计算
- `GET /api/metrics/map` - 获取 mAP 指标
- `GET /api/metrics/pr-curve` - 获取 PR 曲线数据

## 使用说明

1. **上传点云文件**: 在左侧面板拖拽或点击选择 .pcd/.bin 文件
2. **查看点云**: 文件上传后自动加载到 3D 视图
3. **运行检测**: 点击"运行检测"按钮开始目标检测
4. **查看结果**: 右侧面板显示检测框列表和性能指标
5. **交互操作**:
   - 鼠标左键拖动: 旋转视角
   - 鼠标右键拖动: 平移
   - 滚轮: 缩放
   - 点击检测框: 高亮显示

## 点云格式

支持的点云格式:
- **PCD**: Point Cloud Data 格式
- **BIN**: KITTI 二进制格式 (x, y, z, intensity)

## 检测类别

| 类别 | 颜色 | 说明 |
|------|------|------|
| Car | 绿色 | 车辆检测 |
| Pedestrian | 橙色 | 行人检测 |

## 性能指标说明

- **AP (Average Precision)**: 单类平均精度
- **mAP (mean AP)**: 所有类别的平均精度
- **PR Curve**: 精确率-召回率曲线
