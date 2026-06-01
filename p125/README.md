# DASH Adaptive Streaming Server

基于 Node.js + FFmpeg 的实时自适应码率流媒体服务器，支持 RTMP 推流、实时多码率转码、DASH 自适应播放以及会话数据记录。

## 功能特性

- ✅ **RTMP 服务器**：基于 node-media-server 接收 RTMP 推流
- ✅ **实时转码**：FFmpeg 实时转码为 4 种码率（1080p/720p/480p/360p）
- ✅ **DASH 输出**：动态生成 MPD 清单，支持自适应码率切换
- ✅ **前端播放器**：dash.js 播放器，自动/手动切换画质
- ✅ **会话记录**：SQLite 数据库记录推流和观看会话
- ✅ **实时统计**：观看人数、码率切换、缓冲区状态实时监控
- ✅ **优雅清理**：自动清理会话和临时分片文件

## 系统架构

```
RTMP 推流 (OBS/FFmpeg)
    ↓
node-media-server (RTMP 服务器)
    ↓
FFmpeg 转码引擎 (多码率输出)
    ↓
DASH MPD + 分片 (.m4s)
    ↓
Express HTTP 服务器
    ↓
dash.js 前端播放器 (自适应切换)
```

## 转码配置

| 画质 | 分辨率 | 视频码率 | 音频码率 |
|------|--------|----------|----------|
| 1080p | 1920x1080 | 4000 kbps | 128 kbps |
| 720p | 1280x720 | 2500 kbps | 96 kbps |
| 480p | 854x480 | 1500 kbps | 64 kbps |
| 360p | 640x360 | 800 kbps | 48 kbps |

## 环境要求

- Node.js >= 14
- FFmpeg (已安装并在 PATH 中可用)
- 支持 H.264 + AAC 编码的 FFmpeg 版本

### 安装 FFmpeg

**macOS:**
```bash
brew install ffmpeg
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install ffmpeg
```

**CentOS:**
```bash
sudo yum install ffmpeg
```

## 快速开始

### 1. 安装依赖

```bash
cd p125
npm install
```

### 2. 启动服务器

```bash
npm start
```

服务器启动后将显示：
```
=== DASH Streaming Server ===
RTMP Server:  rtmp://localhost:1935/live
HTTP Server:  http://localhost:3000
DASH Streams: http://localhost:3000/streams/<sessionId>/stream.mpd
API:          http://localhost:3000/api
Player:       http://localhost:3000
```

### 3. 推送 RTMP 流

使用 OBS 或 FFmpeg 推送流到服务器：

**FFmpeg 命令示例：**
```bash
ffmpeg -re -i input.mp4 -c:v libx264 -c:a aac -f flv rtmp://localhost:1935/live/mystream
```

**OBS 配置：**
- 服务：自定义
- 服务器：`rtmp://localhost:1935/live`
- 串流密钥：`mystream`（可以是任意字符串）

### 4. 播放视频

打开浏览器访问：
```
http://localhost:3000?s=mystream
```

或在播放器页面输入流密钥 `mystream` 并点击播放。

## API 接口

### 流管理

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/streams` | 获取所有活跃转码会话 |
| GET | `/api/streams/active` | 获取数据库中活跃流 |
| GET | `/api/streams/history` | 获取历史流记录 |
| GET | `/api/streams/:sessionId` | 获取指定会话详情 |

### 观看者管理

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/viewer/join` | 加入观看会话 |
| POST | `/api/viewer/quality` | 更新观看画质 |
| POST | `/api/viewer/leave` | 离开会话 |
| GET | `/api/stats/viewers/:sessionId` | 获取观看人数 |

### DASH 流

| 路径 | 描述 |
|------|------|
| `/streams/:sessionId/stream.mpd` | DASH MPD 清单 |
| `/streams/:sessionId/init-*.m4s` | 初始化分片 |
| `/streams/:sessionId/chunk-*.m4s` | 媒体分片 |

## 数据库结构

### stream_sessions （推流会话）
```sql
id, stream_key, session_id, status, start_time, end_time, client_ip, total_bytes
```

### viewer_sessions （观看会话）
```sql
id, session_id, viewer_id, quality, join_time, leave_time, client_ip, user_agent
```

### quality_stats （画质统计）
```sql
id, session_id, quality, bitrate, resolution, bytes_sent, created_at
```

## 项目结构

```
p125/
├── src/
│   ├── server.js        # 主服务器 (Express + RTMP)
│   ├── config.js        # 配置文件
│   ├── transcoder.js    # FFmpeg 转码引擎
│   └── database.js      # 数据库操作
├── public/
│   └── index.html       # 前端播放器
├── streams/             # DASH 输出目录 (自动创建)
├── data/                # 数据库文件 (自动创建)
├── package.json
└── README.md
```

## 配置说明

所有配置可在 [src/config.js](src/config.js) 中修改：

```javascript
{
  rtmp: { port: 1935, ... },
  http: { port: 8000, ... },
  dash: {
    segmentDuration: 2,      // 分片时长 (秒)
    windowSize: 10,          // 保留分片数量
    extraWindowSize: 5       // 额外保留分片
  },
  transcoding: {
    profiles: [...]          // 转码配置档位
  }
}
```

## 前端播放器特性

- 🎬 DASH 自适应码率播放
- 📊 实时显示当前码率、分辨率、缓冲区
- 📈 码率切换历史可视化图表
- 🔄 自动/手动画质切换
- 👥 实时观看人数统计
- 📝 详细的播放日志
- 📱 响应式设计

## 性能建议

1. **CPU 核心**：转码是 CPU 密集型操作，建议使用多核 CPU
2. **内存**：每个并发流建议 2-4GB 内存
3. **磁盘**：使用 SSD 存储分片，减少 I/O 延迟
4. **网络**：上行带宽需大于所有输出码率之和

## 低延迟优化说明

系统已针对低延迟和码率平滑切换做了深度优化：

### 关键帧对齐（解决切换卡顿）
- `force_key_frames expr:eq(mod(n,30),0)` - 强制每 30 帧（1秒）插入关键帧，所有码率完全对齐
- `g=30 keyint_min=30` - 固定 GOP 大小，防止关键帧漂移
- `sc_threshold=0` + `no-scenecut` - 禁用场景检测，避免插入额外关键帧
- `fps=30` - 统一帧率，确保时间戳精确对齐
- `intra-refresh=1` - 帧内刷新，进一步提升切换流畅度

### 低延迟优化（端到端 <3s）
| 参数 | 优化前 | 优化后 | 效果 |
|------|--------|--------|------|
| preset | veryfast | ultrafast | 编码速度提升 ~40% |
| seg_duration | 2s | 1s | 分片生成延迟降低 50% |
| bufsize | 2x 码率 | 1x 码率 | VBV 缓冲延迟减半 |
| rc-lookahead | 启用 | 0 | 消除码率控制预读延迟 |
| B 帧 | 启用 | 0 | 消除帧排序延迟 |
| refs | 多帧 | 1 | 减少解码缓冲 |
| 播放器缓冲 | 12s | 2s | 客户端延迟降低 83% |

### 其他优化
- `avioflags=direct` - 直接 IO，绕过系统缓存
- `frag_duration=200000` - 0.2s MP4 碎片，更快可播放
- `fast_bilinear` - 快速缩放算法，降低 CPU 负载
- `streaming=1` - DASH 流模式，实时写入

## 常见问题

### 1. FFmpeg 报错 "libx264 not found"

需要重新编译 FFmpeg 并启用 libx264：
```bash
# macOS
brew reinstall ffmpeg --with-x264

# Ubuntu
sudo apt install libx264-dev ffmpeg
```

### 2. 切换码率时画面卡顿

确认以下参数已正确设置（默认已优化）：
- 所有码率的 `force_key_frames` 表达式完全一致
- `sc_threshold` 必须为 0
- 统一使用 `fps=30` 或输入源帧率

### 3. 转码延迟仍然高

可进一步调整：
- 减少转码档位数量（例如从 4 档减到 2-3 档）
- 降低分辨率上限
- 降低 `preset` 到 `ultrafast`（已设置）
- 减小 `seg_duration` 到 0.5s

### 4. 播放器卡顿

- 检查客户端网络状况
- 查看缓冲区是否足够
- 确认服务器 CPU/内存未满载
- 可适当增加 `stableBufferTime`

### 5. 端口被占用

修改 [src/config.js](src/config.js) 中的端口配置。

## 故障排查

查看服务器日志，FFmpeg 的输出会实时打印在控制台。常见错误：
- `RTMP connect failed` - 检查推流地址是否正确
- `Invalid data found when processing input` - 推流编码不兼容
- `Permission denied` - 检查目录权限

## License

MIT
