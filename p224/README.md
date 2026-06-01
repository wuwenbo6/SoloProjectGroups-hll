# MIPI CSI-2 摄像头模拟器

一个基于Python的虚拟摄像头模拟器，通过V4L2 Loopback设备生成RGB虚拟图像数据，供Linux应用程序读取和测试。

## 功能特性

- ✅ **V4L2 Loopback 支持** - 通过内核模块模拟真实摄像头设备
- ✅ **FS/FE 虚拟帧包** - 每帧添加帧起始(Frame Start)/帧结束(Frame End)标记，确保帧完整性
- ✅ **动态 Buffer 管理** - 支持1-32个Buffer配置，默认8个（从4提升至8）
- ✅ **丢帧率监控** - 实时统计并显示丢帧率、实际输出FPS、帧生成/写入时间
- ✅ **多种像素格式** - 支持 RGB24、RAW10 (SBGGR10)、RAW12 (SBGGR12) 输出
- ✅ **坏像素注入** - 5种坏像素模式（固定值/随机/热像素/暗像素/簇状），用于ISP测试
- ✅ **多种图像模式** - 渐变色、棋盘格、彩条测试、动态目标
- ✅ **分辨率控制** - 支持从160x120到4K (3840x2160)
- ✅ **帧率控制** - 1-60 FPS 可调节
- ✅ **Web 控制面板** - 直观的前端界面进行实时配置，包含性能统计面板
- ✅ **RESTful API** - 完整的HTTP API供自动化测试

## 项目结构

```
p224/
├── backend/
│   ├── __init__.py          # 包初始化
│   ├── camera_simulator.py  # 核心模拟器模块
│   └── app.py               # Flask API服务器
├── frontend/
│   └── index.html           # Web控制面板
├── requirements.txt         # Python依赖
└── README.md                # 本文档
```

## 系统要求

- Linux 操作系统
- Python 3.7+
- V4L2 Loopback 内核模块

## 安装指南

### 1. 安装 V4L2 Loopback

```bash
# Ubuntu/Debian
sudo apt-get install v4l2loopback-dkms v4l2loopback-utils

# Fedora/RHEL
sudo dnf install v4l2loopback

# 加载内核模块
sudo modprobe v4l2loopback devices=1 video_nr=10 exclusive_caps=1
```

### 2. 验证设备

```bash
# 查看视频设备
ls /dev/video*

# 查看设备信息
v4l2-ctl --device=/dev/video10 --all
```

### 3. 安装Python依赖

```bash
cd /path/to/p224
pip install -r requirements.txt
```

## 使用方法

### 启动服务

```bash
cd backend
python app.py
```

服务启动后：
- Web 控制面板: http://localhost:5000
- API 端点: http://localhost:5000/api

### Web 控制面板

访问 http://localhost:5000 使用图形界面：

1. **设备配置**
   - 设置 V4L2 设备路径（默认 `/dev/video10`）
   - 选择分辨率（预设或自定义）
   - 调整帧率（1-60 FPS）
   - 选择图像模式

2. **控制操作**
   - 点击「启动模拟器」开始生成视频流
   - 运行中可实时调整参数
   - 点击「停止模拟器」终止

### 测试视频流

```bash
# 使用 ffplay 播放
ffplay /dev/video10

# 使用 guvcview
guvcview -d /dev/video10

# 使用 mplayer
mplayer tv:// -tv driver=v4l2:device=/dev/video10
```

## API 文档

### 获取状态
```http
GET /api/status
```

**响应:**
```json
{
  "running": true,
  "width": 640,
  "height": 480,
  "fps": 30,
  "pattern": "gradient",
  "device": "/dev/video10"
}
```

### 启动模拟器
```http
POST /api/start
Content-Type: application/json

{
  "device": "/dev/video10",
  "width": 640,
  "height": 480,
  "fps": 30,
  "pattern": "gradient"
}
```

### 停止模拟器
```http
POST /api/stop
```

### 设置分辨率
```http
POST /api/resolution
Content-Type: application/json

{
  "width": 1280,
  "height": 720
}
```

### 设置帧率
```http
POST /api/fps
Content-Type: application/json

{
  "fps": 60
}
```

### 设置图像模式
```http
POST /api/pattern
Content-Type: application/json

{
  "pattern": "moving"
}
```

**可用模式:**
- `gradient` - 渐变色
- `checkerboard` - 棋盘格
- `colorbars` - 彩条测试
- `moving` - 动态目标

### 批量配置
```http
POST /api/config
Content-Type: application/json

{
  "width": 1920,
  "height": 1080,
  "fps": 30,
  "pattern": "colorbars"
}
```

## 图像模式说明

| 模式 | 说明 | 用途 |
|------|------|------|
| 渐变色 | RGB三色渐变 | 色彩测试、校准 |
| 棋盘格 | 32px黑白相间 | 相机标定、几何校正 |
| 彩条测试 | 8种标准色条 | 色彩还原测试 |
| 动态目标 | 移动的绿色圆形 | 运动检测、跟踪算法 |

## 常见问题

### Q: 提示 "Permission denied" 访问 /dev/video10
A: 将当前用户添加到 video 组：
```bash
sudo usermod -aG video $USER
# 重新登录后生效
```

### Q: V4L2 设备不存在
A: 重新加载内核模块：
```bash
sudo rmmod v4l2loopback
sudo modprobe v4l2loopback devices=1 video_nr=10 exclusive_caps=1
```

### Q: 如何设置开机自动加载 v4l2loopback
A: 创建配置文件：
```bash
echo "v4l2loopback" | sudo tee /etc/modules-load.d/v4l2loopback.conf
echo "options v4l2loopback devices=1 video_nr=10 exclusive_caps=1" | sudo tee /etc/modprobe.d/v4l2loopback.conf
```

### Q: 支持哪些像素格式
A: 当前仅支持 RGB24 (V4L2_PIX_FMT_RGB24)。如需其他格式（如 YUYV、MJPEG），可在 `camera_simulator.py` 中添加格式转换逻辑。

### Q: FS/FE 虚拟帧包的格式是什么
A: 每帧数据的完整格式为：
```
[FS标记(4字节)] + [帧头(16字节)] + [RGB数据] + [FE标记(4字节)]

帧头结构:
  - buffer_index: 4字节 (当前使用的buffer索引)
  - frame_size: 4字节 (帧数据大小)
  - frame_sequence: 8字节 (帧序列号)

FS标记: 0x00 0x00 0x01 0xDA
FE标记: 0x00 0x00 0x01 0xB7
```

### Q: 如何降低丢帧率
A: 可以尝试以下方法：
1. 增加 buffer 数量（默认为8，可增至16或32）
2. 降低分辨率或帧率
3. 检查系统IO性能，确保磁盘/内存足够
4. 使用 `nice` 命令提升进程优先级

### Q: 默认 Buffer 数量为什么从4改为8
A: 增加到8个buffer可以提供更好的抗抖动能力，尤其在高帧率（30+ FPS）或高分辨率（1080p+）场景下，能显著降低丢帧率。

### Q: RAW格式如何用于ISP测试
A: RAW10/RAW12格式直接输出Bayer模式的原始传感器数据，配合坏像素注入功能，可以测试ISP的以下模块：
- 坏点校正 (Dead Pixel Correction)
- 去马赛克 (Demosaicing)
- 降噪 (Noise Reduction)
- 色彩校正矩阵 (CCM)

### Q: 如何验证RAW格式输出
A: 使用以下命令检查和捕获RAW数据：
```bash
# 检查支持的格式
v4l2-ctl --device=/dev/video10 --list-formats-ext

# 捕获RAW帧
v4l2-ctl --device=/dev/video10 --set-fmt-video=width=640,height=480,pixelformat=BG10
v4l2-ctl --device=/dev/video10 --stream-mmap --stream-count=1 --stream-to=raw10_frame.bin
```

## 技术实现

### 核心模块

**V4L2Loopback 类** ([camera_simulator.py](backend/camera_simulator.py#L16-L197))
- 使用 `fcntl.ioctl` 进行 V4L2 设备控制
- 支持设置视频格式（VIDIOC_S_FMT）
- **FS/FE 虚拟帧包**: 每帧数据前添加帧起始标记 `0x000001DA`，后添加帧结束标记 `0x000001B7`，中间包含帧头（buffer索引、帧大小、帧序列号）
- **动态 Buffer 管理**: 支持通过 `VIDIOC_REQBUFS` 动态分配1-32个buffer，默认8个
- **多格式支持**: RGB24、RAW10 (SBGGR10)、RAW12 (SBGGR12)
- **RAW格式打包**: 实现MIPI CSI-2标准的RAW打包（4像素→5字节 for RAW10，2像素→3字节 for RAW12）
- 完整的 V4L2 buffer 标志常量定义

**ImageGenerator 类** ([camera_simulator.py](backend/camera_simulator.py#L233-L414))
- 使用 NumPy 高效生成图像数据
- 4种内置测试图案
- 支持动态分辨率切换
- **坏像素注入**: 5种坏像素模式（fixed/random/hot/dark/cluster）
- 支持BGGR Bayer模式转换

**CameraSimulator 类** ([camera_simulator.py](backend/camera_simulator.py#L417-L609))
- 独立线程运行帧生成循环
- 线程安全的参数配置
- 精确的帧率控制
- **丢帧率监控**: 实时统计总帧数、已发送帧数、丢弃帧数，计算丢帧率百分比
- **性能统计**: 统计实际输出FPS、帧平均生成时间、帧平均写入时间
- 帧序列号追踪，用于调试和完整性验证
- 实时像素格式切换支持

## 许可证

MIT License
