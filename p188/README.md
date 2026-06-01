# ONVIF摄像头录像回放系统

一个Web端摄像头录像管理与回放平台，支持接入ONVIF协议摄像头（或模拟摄像头），实现视频录制、存储、时间轴回放和事件标记功能。

## 功能特性

- 📹 **实时监控**：查看摄像头实时画面，支持手动录制
- 🎞️ **录像回放**：通过可视化时间轴回放历史录像
- ⏱️ **时间轴控制**：支持拖拽定位、缩放查看、精确跳转
- 🏷️ **事件标记**：支持移动侦测、告警事件、自定义标记
- 🔍 **事件管理**：事件列表、筛选搜索、快速跳转

## 技术栈

### 前端
- React 18 + TypeScript
- TailwindCSS 3
- Zustand 状态管理
- Lucide React 图标
- Vite 构建工具

### 后端
- Express 4 + TypeScript
- Better-SQLite3 数据库
- RESTful API

## 项目结构

```
.
├── src/                      # 前端源码
│   ├── components/           # 组件
│   │   ├── Layout/           # 布局组件
│   │   ├── VideoPlayer.tsx   # 视频播放器
│   │   ├── Timeline.tsx      # 时间轴组件
│   │   ├── CameraCard.tsx    # 摄像头卡片
│   │   ├── EventList.tsx     # 事件列表
│   │   └── EventModal.tsx    # 事件弹窗
│   ├── pages/                # 页面
│   │   ├── LiveMonitor.tsx   # 实时监控
│   │   ├── Playback.tsx      # 录像回放
│   │   └── Events.tsx        # 事件管理
│   ├── store/                # Zustand状态管理
│   ├── utils/                # 工具函数
│   └── App.tsx
├── api/                      # 后端源码
│   ├── controllers/          # 控制器
│   ├── services/             # 业务服务
│   ├── routes/               # 路由
│   ├── db/                   # 数据库
│   └── app.ts
├── shared/                   # 共享类型定义
├── recordings/               # MP4存储目录
└── package.json
```

## 快速开始

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
# 同时启动前端和后端
npm run dev

# 仅启动前端
npm run client:dev

# 仅启动后端
npm run server:dev
```

### 构建

```bash
npm run build
```

## API接口

### 摄像头
- `GET /api/cameras` - 获取摄像头列表
- `GET /api/cameras/:id` - 获取摄像头详情
- `GET /api/cameras/:id/stream` - 获取摄像头流信息

### 录制
- `POST /api/record/start` - 开始录制
- `POST /api/record/stop` - 停止录制
- `GET /api/record/status` - 获取录制状态

### 录像
- `GET /api/recordings` - 获取录像列表
- `GET /api/recordings/:id` - 获取录像详情
- `GET /api/recordings/:id/video` - 播放录像视频

### 事件
- `GET /api/events` - 获取事件列表
- `POST /api/events` - 创建事件
- `PUT /api/events/:id` - 更新事件
- `DELETE /api/events/:id` - 删除事件

## 设计风格

- **深色主题**：科技感安防监控风格
- **主色调**：青色 (#06b6d4)
- **警告色**：红色 (#ef4444)
- **字体**：JetBrains Mono (标题)、Inter (正文)
- **动画**：录制呼吸效果、平滑过渡、悬停微交互

## 页面说明

### 实时监控页
- 摄像头列表展示
- 大尺寸视频预览
- 录制控制按钮
- 实时状态指示

### 录像回放页
- 录像缩略图网格
- 视频播放器（播放/暂停/音量/全屏）
- 交互式时间轴（拖拽/缩放/事件标记）
- 快速添加事件标记

### 事件管理页
- 事件统计卡片
- 搜索和筛选功能
- 事件列表展示
- 删除和快速跳转操作

## 数据模型

### Camera (摄像头)
- id, name, type, status, rtspUrl, createdAt

### Recording (录像)
- id, cameraId, startTime, endTime, duration, filePath, fileSize

### Event (事件)
- id, recordingId, timestamp, type (motion/alert/custom), title, description
