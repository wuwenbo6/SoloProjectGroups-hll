# RTSP 流媒体代理服务器 - 低延迟优化版

基于 Go + FFmpeg 的 RTSP 流媒体代理服务器，支持将多路 RTSP 摄像头流转码为 HLS，实现多用户无插件播放。

## ✨ 优化亮点

### 🚀 CPU 占用优化
- **流拷贝模式 (Copy Mode)**: 源流已是 H.264 编码时直接透传，CPU 占用几乎为 0
- **硬件加速**: 自动检测并使用硬件编码 (NVIDIA NVENC / Apple VideoToolbox)
- **智能并发控制**: 限制同时转码的流数量，防止 CPU 爆满
- **空闲流自动关闭**: 60秒无观看者自动停止转码，节省资源

### ⚡ 低延迟优化
- **HLS 低延迟模式**: 分片时长 0.5s，播放列表 3 个分片
- **前端低延迟播放**: hls.js 启用 `lowLatencyMode`，延迟约 1-2 秒
- **FFmpeg 低延迟参数**: `nobuffer` + `zerolatency` 预设

## 功能特性

- ✅ 多 RTSP 流管理
- ✅ 三种转码模式：Copy / Hardware / Software
- ✅ HLS 低延迟输出（延迟 ~1-2秒）
- ✅ 多用户观看计数
- ✅ 空闲流自动关闭
- ✅ 流状态实时监控
- ✅ SQLite 数据库持久化
- ✅ Web 管理界面
- ✅ 流自动重启（异常恢复）

## 转码模式对比

| 模式 | CPU 占用 | 延迟 | 画质 | 适用场景 |
|------|----------|------|------|----------|
| **Copy** | ⭐ 极低 | ~1s | 无损 | 摄像头已输出 H.264 |
| **Hardware** | ⭐⭐ 低 | ~1.5s | 良好 | 有 GPU/NVENC 支持 |
| **Software** | ⭐⭐⭐⭐⭐ 高 | ~2s | 可调节 | 无硬件加速时 |

## 系统架构

```
RTSP摄像头 → FFmpeg转码 → HLS分片 → HTTP服务 → 浏览器播放
     ↓           ↓           ↓          ↓
   多路输入    3种模式    0.5s分片    1-2秒延迟
```

## 目录结构

```
p84/
├── cmd/
│   └── server/
│       └── main.go          # 主程序入口
├── internal/
│   ├── database/
│   │   └── database.go      # 数据库模型和操作
│   ├── stream/
│   │   └── manager.go       # 流管理器和FFmpeg控制
│   └── server/
│       └── server.go        # HTTP服务和API
├── web/
│   └── static/
│       └── index.html       # 前端播放页面
├── configs/
│   └── config.yaml          # 配置文件
├── data/                    # 运行时数据（自动创建）
│   ├── streams.db          # SQLite数据库
│   └── hls/                # HLS分片目录
├── go.mod
└── README.md
```

## 快速开始

### 环境要求

- Go 1.21+
- FFmpeg 4.0+ (支持 libx264 和 aac)
- 现代浏览器 (支持 HLS)

### 安装 FFmpeg

**macOS (推荐 - 支持 VideoToolbox 硬件加速):**
```bash
brew install ffmpeg
```

**Ubuntu/Debian:**
```bash
sudo apt update && sudo apt install ffmpeg
```

**带 NVIDIA 硬件加速:**
```bash
# 安装支持 NVENC 的 FFmpeg
sudo add-apt-repository ppa:jonathonf/ffmpeg-4
sudo apt install ffmpeg
```

### 安装依赖

```bash
go mod download
```

### 配置

编辑 `configs/config.yaml`:

```yaml
server:
  port: 8080
  host: "0.0.0.0"

ffmpeg:
  # 转码模式: copy | hardware | software
  # copy: CPU占用极低，源流必须是H.264
  # hardware: 硬件加速，自动检测
  # software: 软件编码，CPU占用高
  transcode_mode: "copy"

  # 低延迟模式
  low_latency: true

  # HLS 参数 (低延迟配置)
  hls_time: 0.5
  hls_list_size: 3

  # 最大并发转码流数（防止CPU爆满）
  max_concurrent: 4

  # 空闲流自动关闭时间（秒）
  idle_timeout_sec: 60

streams:
  - id: "camera1"
    name: "摄像头1"
    rtsp_url: "rtsp://admin:password@192.168.1.100:554/stream1"
    enabled: true
```

### 运行

```bash
go run cmd/server/main.go
```

### 访问

打开浏览器访问: `http://localhost:8080`

## 性能优化建议

### 1. 优先使用 Copy 模式 ⭐⭐⭐

如果摄像头输出已是 H.264 编码，强烈建议使用 `copy` 模式：
```yaml
transcode_mode: "copy"
```
**效果**: CPU 占用从 100%/流 → 1-2%/流

### 2. 硬件加速检测

系统会自动检测硬件编码器：
- **macOS**: VideoToolbox (`h264_videotoolbox`)
- **Linux/NVIDIA**: NVENC (`h264_nvenc`)

也可手动指定:
```yaml
hardware_encoder: "h264_nvenc"
hardware_decoder: "h264_cuvid"
```

### 3. 并发控制

根据 CPU 核心数调整并发限制:
```yaml
max_concurrent: 4  # 4核CPU建议值
```

### 4. 延迟与画质权衡

| 需求 | hls_time | hls_list_size | 延迟 | 稳定性 |
|------|----------|---------------|------|--------|
| 极致低延迟 | 0.3 | 2 | ~0.8s | ⭐⭐ |
| 推荐配置 | 0.5 | 3 | ~1.5s | ⭐⭐⭐⭐ |
| 高稳定 | 1.0 | 4 | ~3s | ⭐⭐⭐⭐⭐ |

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/stats | 获取系统状态 |
| GET | /api/streams | 获取所有流列表 |
| GET | /api/streams/:id | 获取单个流详情 |
| POST | /api/streams | 创建新流 |
| PUT | /api/streams/:id | 更新流配置 |
| DELETE | /api/streams/:id | 删除流 |
| POST | /api/streams/:id/start | 启动流 |
| POST | /api/streams/:id/stop | 停止流 |
| GET | /api/streams/:id/logs | 获取流日志 |
| POST | /api/streams/:id/viewer | 增加观看者 |
| DELETE | /api/streams/:id/viewer | 减少观看者 |
| GET | /hls/:id/stream.m3u8 | HLS播放地址 |

## 常见问题

### Q: CPU 还是很高？

**A:** 检查以下几点:
1. 确认使用了 `copy` 模式: 检查 Web 界面顶部的转码模式
2. 确认摄像头输出是 H.264: `ffprobe rtsp://...` 查看视频编码
3. 降低 `max_concurrent` 限制并发数
4. 考虑硬件加速

### Q: 延迟还是 >3 秒？

**A:** 优化步骤:
1. 确认 `low_latency: true`
2. 降低 `hls_time` 到 0.3-0.5
3. 减小 `hls_list_size` 到 2-3
4. 网络状况也会影响延迟

### Q: Copy 模式下没有画面？

**A:** Copy 模式要求源流编码兼容:
- 视频必须是 H.264
- 音频建议是 AAC
- 使用 `ffprobe` 检查摄像头输出编码
- 不兼容时切换到 `software` 或 `hardware` 模式

### Q: FFmpeg 进程崩溃？

A: 检查:
- RTSP 地址是否可访问
- 网络是否稳定
- 查看 `/api/streams/:id/logs` 获取详细日志

## 浏览器支持

- Chrome 51+ ✅ (推荐，低延迟最佳)
- Firefox 48+ ✅
- Safari 10+ ✅ (原生 HLS 支持)
- Edge 79+ ✅

## License

MIT
