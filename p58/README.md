# ONVIF 摄像头管理系统

一个完整的 ONVIF 摄像头管理系统，支持设备自动发现、PTZ 控制、录像计划管理。

## 功能特性

- 🔍 **设备自动发现**: 通过 ONVIF 协议自动扫描局域网内的摄像头
- 📋 **设备管理**: 添加、编辑、删除摄像头设备
- 🎮 **PTZ 控制**: 支持云台上下左右控制、变焦、预设位
- ⏰ **录像计划**: 配置定时录像，支持存储到 NAS
- 💾 **数据库存储**: 使用 SQLite 保存设备配置和录像计划

## 技术栈

### 后端
- Node.js + Express
- node-onvif / onvif (ONVIF 协议库)
- better-sqlite3 (数据库)
- node-cron (定时任务)
- fluent-ffmpeg (视频录制)

### 前端
- React 18 + Vite
- React Router
- Axios
- Tailwind CSS
- Lucide Icons

## 项目结构

```
.
├── backend/                 # 后端服务
│   ├── database/           # 数据库初始化
│   ├── routes/             # API 路由
│   ├── services/           # 业务逻辑
│   ├── .env                # 环境变量
│   ├── package.json
│   └── server.js           # 入口文件
├── frontend/               # 前端应用
│   ├── src/
│   │   ├── pages/          # 页面组件
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
└── README.md
```

## 快速开始

### 1. 启动后端服务

```bash
cd backend
npm install
npm start
```

后端服务将在 http://localhost:3001 启动

### 2. 启动前端应用

```bash
cd frontend
npm install
npm run dev
```

前端应用将在 http://localhost:3000 启动

## API 接口

### 摄像头管理
- `GET /api/cameras` - 获取摄像头列表
- `GET /api/cameras/:id` - 获取单个摄像头信息
- `POST /api/cameras` - 添加摄像头
- `PUT /api/cameras/:id` - 更新摄像头
- `DELETE /api/cameras/:id` - 删除摄像头
- `GET /api/cameras/discover` - 发现局域网设备

### PTZ 控制
- `POST /api/ptz/move` - 云台移动 { cameraId, direction, speed }
- `POST /api/ptz/stop` - 停止移动 { cameraId }
- `POST /api/ptz/zoom` - 变焦 { cameraId, direction, speed }
- `POST /api/ptz/home` - 回到预设位 { cameraId }

### 录像计划
- `GET /api/recording/schedules` - 获取录像计划列表
- `POST /api/recording/schedules` - 创建录像计划
- `PUT /api/recording/schedules/:id` - 更新录像计划
- `DELETE /api/recording/schedules/:id` - 删除录像计划

## 环境变量

在 `backend/.env` 中配置：

```
PORT=3001                    # 后端端口
DB_PATH=./database/cameras.db # 数据库路径
NAS_PATH=/mnt/nas/cameras    # NAS 存储路径
```

## 录像功能说明

录像功能使用 ffmpeg 录制 RTSP 流，需要系统已安装 ffmpeg：

```bash
# Ubuntu/Debian
sudo apt install ffmpeg

# macOS
brew install ffmpeg
```

## 注意事项

1. 确保摄像头和服务器在同一局域网
2. 摄像头需开启 ONVIF 功能
3. 部分摄像头需要认证用户名和密码
4. PTZ 功能需要摄像头支持 PTZ 协议
