# 性能优化说明

## 问题修复

### 1. 快速移动目标跟踪丢失 ✅

**问题**: KCF 算法对快速移动目标容易丢失

**解决方案**:
- **卡尔曼滤波运动预测**: 在跟踪器中集成卡尔曼滤波器，预测目标下一帧位置
- **CSRT 算法替代 KCF**: 默认使用更鲁棒的 CSRT (Channel and Spatial Reliability Tracker)
- **多算法支持**: 支持 KCF/CSRT/MOSSE/MIL 四种算法
- **搜索区域重检测**: 跟踪失败时，在预测位置周围扩大搜索区域重新初始化
- **置信度管理**: 动态调整跟踪置信度，失败计数超过阈值才移除

**关键代码**:
- [KalmanFilter](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p102/app/stream/tracker.py#L11-L50) - 卡尔曼滤波器实现
- [EnhancedTracker.update()](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p102/app/stream/tracker.py#L131-L233) - 带预测和重检测的更新逻辑
- [_get_search_region()](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p102/app/stream/tracker.py#L90-L102) - 搜索区域扩展

---

### 2. 延迟累积导致音画不同步 ✅

**问题**: 帧缓冲导致延迟累积，音视频不同步

**解决方案**:
- **线程分离**: 分离帧读取线程和帧处理线程
- **有限队列**: 使用固定大小队列 (默认2帧)，队列满时丢弃旧帧
- **延迟检查**: 处理前检查帧延迟，超过 200ms 直接丢弃
- **GStreamer 低延迟配置**: 
  - `latency=50` - 减少 RTSP 缓冲延迟
  - `max-size-buffers=1` - 限制队列缓冲
  - `drop=1 sync=0` - 启用丢帧，禁用同步
- **WebRTC 帧率控制**: 稳定输出帧率，防止抖动

**关键代码**:
- [RTSPReceiver](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p102/app/stream/rtsp_receiver.py#L13-L190) - 低延迟接收器
- [_read_frames_thread()](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p102/app/stream/rtsp_receiver.py#L78-L107) - 独立读取线程
- [_process_frames()](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p102/app/stream/rtsp_receiver.py#L109-L145) - 延迟检查与丢帧
- [VideoTransformTrack.recv()](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p102/app/stream/webrtc_stream.py#L39-L69) - WebRTC 帧率同步

---

## 性能指标

### 预期延迟
| 组件 | 典型延迟 | 最大延迟 |
|------|---------|---------|
| RTSP 源 → 接收器 | < 100ms | < 200ms |
| 目标跟踪处理 | < 20ms | < 50ms |
| WebRTC 编码传输 | < 150ms | < 300ms |
| **端到端总延迟** | **< 300ms** | **< 500ms** |

### 跟踪器性能对比
| 算法 | 速度 | 精度 | 抗遮挡 | 快速移动 | 适用场景 |
|------|------|------|--------|----------|---------|
| MOSSE | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐ | ⭐⭐⭐ | 高性能需求 |
| KCF | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ | 平衡型 |
| CSRT | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | **高精度推荐** |
| MIL | ⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | 科研用途 |

---

## 配置调优

### 环境变量
```env
# 跟踪器算法: KCF/CSRT/MOSSE/MIL
TRACKER_TYPE=CSRT

# 最大延迟阈值 (ms)
MAX_LATENCY_MS=200

# 帧队列大小
FRAME_QUEUE_SIZE=2

# WebRTC 目标码率 (bps)
WEBRTC_BITRATE=2000000

# WebRTC 目标帧率
WEBRTC_FPS=30
```

### GStreamer 优化
- 使用 UDP 传输: `rtspsrc location=rtsp://... protocols=udp`
- 硬件加速解码: `omxh264dec` 替代 `avdec_h264`
- 降低分辨率: 输入流 720p 或更低

---

## 监控指标

API 可获取以下实时指标:
```json
{
  "stream_id": 1,
  "is_running": true,
  "fps": 29.5,
  "latency_ms": 85.3,
  "tracking_count": 2,
  "webrtc_connections": 3,
  "tracker_type": "CSRT"
}
```

---

## 已知限制

1. **音视频同步**: 目前只处理视频流，音频同步需要额外的音频轨道和时间戳对齐
2. **光照变化**: 传统跟踪器对光照突变仍敏感
3. **完全遮挡**: 长时间完全遮挡后无法自动恢复
4. **CPU 占用**: CSRT 算法 CPU 占用较高，多路流建议使用 MOSSE
