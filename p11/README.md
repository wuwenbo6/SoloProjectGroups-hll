# 车牌识别系统 (License Plate Recognition)

基于 YOLOv5 + OCR + AOD-Net 的车牌识别系统，支持**图片识别**和**RTSP视频流实时识别**，包含车速估算和布控报警功能。

## ✨ 功能特性

### 核心功能
- 🚗 **车牌检测**: 使用 YOLOv5 进行车牌定位，支持传统检测方法 fallback
- 📝 **字符识别**: 使用 EasyOCR 进行车牌字符识别
- 🌫️ **图像增强**: AOD-Net 去雾/去雨预处理，支持传统图像处理 fallback
- 🎨 **颜色识别**: 自动识别车牌颜色（蓝/黄/绿）

### 视频流功能 (v2.0新增)
- 🎥 **RTSP视频流**: 支持多路RTSP视频流实时识别
- 🚀 **车速估算**: 基于帧间位移的车辆速度计算
- ⚠️ **布控名单**: 黑名单/白名单车辆布控管理
- 🔔 **实时报警**: 超速报警、布控车辆报警
- 📊 **速度校准**: 支持像素/米比率配置校准

### 其他功能
- 📊 **日志存储**: SQLite 数据库存储识别历史
- 🌐 **REST API**: 完整的 FastAPI 后端服务
- 🖥️ **前端界面**: 美观的 Web 界面，支持拖拽上传和效果对比

## 🏗️ 项目结构

```
p11/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── deps.py          # 依赖注入
│   │   │   ├── routes.py        # 图片识别API
│   │   │   └── video_routes.py  # 视频流API（新增）
│   │   ├── utils/
│   │   │   ├── aod_net.py       # AOD-Net 图像增强
│   │   │   ├── yolo_detector.py # YOLOv5 车牌检测
│   │   │   ├── ocr_recognizer.py # OCR 字符识别
│   │   │   └── video_processor.py # 视频流处理（新增）
│   │   └── schemas.py           # Pydantic 模型
│   ├── models/                  # 预训练模型目录
│   ├── config.py                # 配置文件
│   ├── database.py              # 数据库模型
│   └── main.py                  # 应用入口
├── static/
│   ├── index.html               # 图片识别页面
│   ├── video.html               # 视频监控页面（新增）
│   ├── styles.css               # 通用样式
│   ├── video.css                # 视频页面样式（新增）
│   ├── app.js                   # 图片识别脚本
│   └── video.js                 # 视频监控脚本（新增）
├── uploads/                     # 上传文件存储
├── requirements.txt             # Python 依赖
└── README.md                    # 项目说明
```

## 🚀 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 启动服务

```bash
python -m backend.main
```

或使用 uvicorn:

```bash
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. 访问应用

| 功能 | 地址 |
|------|------|
| 图片识别界面 | http://localhost:8000/static/index.html |
| 视频监控界面 | http://localhost:8000/static/video.html |
| API 文档 | http://localhost:8000/docs |
| 健康检查 | http://localhost:8000/api/v1/health |

## 📡 API 接口

### 图片识别 API

#### 车牌识别
```
POST /api/v1/recognize
Content-Type: multipart/form-data

Parameters:
- file: 图片文件
- enhance: 是否启用图像增强 (可选, 默认 true)
```

#### 图像增强
```
POST /api/v1/enhance
Content-Type: multipart/form-data

Parameters:
- file: 图片文件
```

#### 获取识别历史
```
GET /api/v1/logs?skip=0&limit=50
```

#### 获取统计信息
```
GET /api/v1/stats
```

---

### 视频流 API (新增)

#### 获取视频流管理状态
```
GET /api/v1/video/status
```

#### 视频流管理
```
GET    /api/v1/video/streams          # 获取所有视频流
POST   /api/v1/video/streams          # 添加视频流
PUT    /api/v1/video/streams/{id}    # 更新视频流
DELETE /api/v1/video/streams/{id}    # 删除视频流
```

#### 获取视频流实时数据
```
GET /api/v1/video/streams/{id}/tracks  # 获取活动车辆
GET /api/v1/video/streams/{id}/alerts  # 获取流的报警记录
```

#### 布控名单管理
```
GET    /api/v1/video/watchlist          # 获取布控名单
POST   /api/v1/video/watchlist          # 添加布控车辆
PUT    /api/v1/video/watchlist/{id}     # 更新布控车辆
DELETE /api/v1/video/watchlist/{id}     # 删除布控车辆
```

#### 报警记录
```
GET  /api/v1/video/alerts?skip=0&limit=50  # 获取报警记录
POST /api/v1/video/alerts/{id}/acknowledge # 确认报警
```

#### 速度配置
```
GET    /api/v1/video/speed-config       # 获取速度配置
POST   /api/v1/video/speed-config       # 创建速度配置
PUT    /api/v1/video/speed-config/{id}  # 更新速度配置
```

## 📹 视频流使用说明

### 1. 添加RTSP视频流

1. 访问视频监控页面: http://localhost:8000/static/video.html
2. 点击「添加视频流」按钮
3. 填写流ID、名称、RTSP地址和限速值
4. 点击「添加」后自动启动识别

### 2. 布控名单设置

1. 切换到「布控名单」标签页
2. 点击「添加车辆」
3. 输入车牌号、描述和报警类型
4. 保存后自动生效

### 3. 速度校准

车速估算需要根据实际摄像头位置进行校准：

1. 在画面中选取一段已知实际距离的参考线
2. 测量该线段在画面中的像素长度
3. 计算: 像素/米 = 像素长度 / 实际距离(米)
4. 在「速度配置」页面保存该值

**示例**: 10米距离在画面中占300像素，则像素/米比率为 30。

## 🎨 车牌颜色支持

| 颜色 | 类型 | 字符数 |
|------|------|--------|
| 🔵 蓝牌 | 普通小型汽车 | 7位 |
| 🟡 黄牌 | 大型车辆、摩托车等 | 7位 |
| 🟢 绿牌 | 新能源汽车 | 8位 |

## 🧠 模型配置

### YOLOv5 模型

将训练好的 YOLOv5 车牌检测模型放置在:
```
backend/models/yolov5_lp.pt
```

如果没有预训练模型，系统将自动使用传统图像处理方法进行检测。

### AOD-Net 模型

将训练好的 AOD-Net 去雾模型放置在:
```
backend/models/aod_net.pth
```

如果没有预训练模型，系统将自动使用传统的 CLAHE 等图像处理方法进行增强。

## 🛠️ 技术栈

**后端:**
- FastAPI - 高性能 Web 框架
- SQLAlchemy - ORM 框架
- SQLite - 数据库
- PyTorch - 深度学习框架
- OpenCV - 图像处理
- EasyOCR - 光学字符识别

**前端:**
- 原生 JavaScript
- HTML5 / CSS3
- 响应式设计

## ⚠️ 注意事项

1. **首次运行**: EasyOCR 会自动下载语言模型文件，可能需要一些时间
2. **GPU加速**: 建议使用 GPU 加速以获得更好的性能（需要安装 CUDA 版本的 PyTorch）
3. **文件清理**: 上传的图片会保存在 `static/uploads` 目录下，请定期清理
4. **数据库**: 数据库文件 `license_plate.db` 会自动创建在项目根目录
5. **RTSP兼容性**: 部分RTSP流可能需要额外的配置，建议使用标准的RTSP协议

## 🔧 开发说明

所有模块都设计有 fallback 机制，在缺少预训练模型的情况下仍能正常运行：

- **YOLO 检测**: 无模型时使用边缘检测 + 轮廓分析
- **AOD-Net 增强**: 无模型时使用 CLAHE + 直方图均衡
- **OCR 识别**: EasyOCR 不可用时使用轮廓检测 + 特征匹配

## 📈 更新日志

### v2.0 (2026-05-23)
- ✅ 新增 RTSP 视频流支持
- ✅ 新增车速估算功能（帧间位移）
- ✅ 新增布控名单管理
- ✅ 新增实时报警功能（超速、布控车辆）
- ✅ 新增视频监控前端页面
- ✅ 修复绿牌字符识别问题（8位支持）
- ✅ 修复去雾模块过曝问题

### v1.0
- ✅ 图片车牌识别
- ✅ AOD-Net 图像增强
- ✅ 蓝/黄/绿牌颜色识别
- ✅ SQLite 日志存储

## 📄 License

MIT License
