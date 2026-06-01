# RTSP WebRTC 目标跟踪系统

基于 Python + GStreamer + OpenCV KCF + WebRTC 的多路视频流目标跟踪系统。

## 功能特性

- 🎥 **RTSP 流接收**: 支持 GStreamer 和 OpenCV 两种方式接收 RTSP 流
- 🎯 **KCF 目标跟踪**: 使用 OpenCV KCF 算法进行实时目标跟踪
- 📡 **WebRTC 推流**: 无插件浏览器实时播放，带跟踪框显示
- 🔄 **多路流支持**: 同时支持多路视频流处理
- 💾 **数据库记录**: SQLite 存储跟踪位置历史记录
- 🌐 **RESTful API**: 完整的 FastAPI 接口

## 项目结构

```
p102/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI 入口
│   ├── config.py            # 配置
│   ├── database.py          # 数据库连接
│   ├── models.py            # SQLAlchemy 模型
│   ├── schemas.py           # Pydantic 模型
│   ├── crud.py              # 数据库操作
│   ├── api/
│   │   ├── __init__.py
│   │   └── routes.py        # API 路由
│   └── stream/
│       ├── __init__.py
│       ├── rtsp_receiver.py # RTSP 流接收
│       ├── tracker.py       # KCF 目标跟踪
│       ├── webrtc_stream.py # WebRTC 推流
│       └── stream_manager.py # 流管理器
├── static/
│   └── index.html           # 前端页面
├── requirements.txt
├── .env.example
└── README.md
```

## 安装依赖

```bash
pip install -r requirements.txt
```

### GStreamer 依赖 (可选)

如果需要使用 GStreamer 接收 RTSP 流:

**Ubuntu/Debian**:
```bash
sudo apt-get install gstreamer1.0-plugins-base gstreamer1.0-plugins-good \
     gstreamer1.0-plugins-bad gstreamer1.0-plugins-ugly gstreamer1.0-libav \
     libgstreamer1.0-dev
```

**macOS**:
```bash
brew install gstreamer gst-plugins-base gst-plugins-good gst-plugins-bad gst-plugins-ugly gst-libav
```

## 运行

1. 复制配置文件:
```bash
cp .env.example .env
```

2. 启动服务:
```bash
python -m app.main
```

或者使用 uvicorn:
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

3. 访问前端: http://localhost:8000

## API 接口

### 视频流管理

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/streams` | 添加视频流 |
| GET | `/api/streams` | 获取所有流 |
| GET | `/api/streams/{id}` | 获取单个流 |
| PUT | `/api/streams/{id}` | 更新流配置 |
| DELETE | `/api/streams/{id}` | 删除流 |
| POST | `/api/streams/{id}/start` | 启动流 |
| POST | `/api/streams/{id}/stop` | 停止流 |
| GET | `/api/streams/{id}/status` | 获取流状态 |

### 目标跟踪

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/streams/{id}/track` | 初始化跟踪 |
| DELETE | `/api/streams/{id}/track/{object_id}` | 停止跟踪 |
| GET | `/api/streams/{id}/track` | 获取跟踪框 |

### WebRTC

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/streams/{id}/webrtc/offer` | WebRTC 握手 |

### 跟踪记录

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/streams/{id}/records` | 获取跟踪历史 |

## 使用流程

1. **添加 RTSP 流**: 在前端点击"添加视频流"，输入名称和 RTSP 地址
2. **启动流**: 点击"开始"按钮启动流处理
3. **WebRTC 播放**: 点击"WebRTC"按钮开始播放
4. **目标跟踪**: 点击"选择目标"，在视频上框选要跟踪的目标
5. **查看记录**: 通过 API 获取跟踪位置历史记录

## 技术栈

- **后端框架**: FastAPI (Python)
- **视频处理**: OpenCV + GStreamer
- **跟踪算法**: KCF (Kernelized Correlation Filters)
- **推流协议**: WebRTC (aiortc)
- **数据库**: SQLite + SQLAlchemy (async)

## 注意事项

1. 默认使用 OpenCV 接收 RTSP 流，如需 GStreamer 请设置 `USE_GSTREAMER=true`
2. KCF 算法对目标遮挡和快速运动敏感
3. WebRTC 需要 HTTPS 才能在公网使用 (localhost 除外)
4. 多路流会占用较多 CPU 资源，注意控制并发数量
