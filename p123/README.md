# VNC 多用户共享系统

一个基于 Go 实现的 VNC 代理服务器，支持多用户同时观看同一 VNC 桌面，支持键盘/鼠标互斥控制，H.264 屏幕录制，以及 noVNC 前端。

## 功能特性

### ✅ 核心功能
- **多用户同时观看**：支持最多 10 个用户同时观看 VNC 桌面
- **互斥控制**：同一时间只有一个用户可以控制键盘/鼠标
- **光标同步**：控制者的鼠标位置实时同步到所有观看者
- **H.264 录制**：支持屏幕流录制为 H.264 格式，带时间戳确保音视频同步
- **会话管理**：SQLite 数据库存储会话记录
- **noVNC 前端**：基于 Web 的 VNC 客户端，无需插件

### ✅ 新增修复
- **多用户光标同步**：控制者鼠标移动时，位置实时广播给所有观看者；新用户加入时立即同步当前光标位置
- **音视频同步**：使用固定帧率（CFR）+ PTS 时间戳 + SEI 定时信息，解决录制文件不同步问题

### ✅ 新增功能 (v2.0)
- **画质调节**：6个画质预设（最低/低/中等/高/最高/无损）+ 自定义压缩级别(0-9)和质量级别(0-9)
- **会话挂起/恢复**：用户可挂起当前会话，下次使用相同用户名可恢复
- **MP4导出**：H.264录制文件可一键导出为MP4格式（ffmpeg优先，纯Go实现回退）

## 架构设计

```
┌─────────────┐     WebSocket      ┌─────────────┐     RFB协议      ┌─────────────┐
│  noVNC 客户端│ ◀───────────────▶ │  Go 代理服务器 │ ◀────────────▶ │  VNC 服务器   │
└─────────────┘                    └─────────────┘                  └─────────────┘
                                           │
                                           ▼
                                  ┌─────────────┐
                                  │  SQLite DB  │  (会话/录制记录)
                                  └─────────────┘
                                           │
                                           ▼
                                  ┌─────────────┐
                                  │  H.264 录制  │  (固定帧率 + PTS)
                                  └─────────────┘
```

## 项目结构

```
p123/
├── cmd/server/
│   └── main.go                    # 主程序入口
├── pkg/
│   ├── database/
│   │   └── database.go            # SQLite 数据库管理
│   ├── vnc/
│   │   └── proxy.go               # VNC 代理核心 (RFB协议解析/光标同步)
│   ├── recorder/
│   │   └── recorder.go            # H.264 录制 (固定帧率 + PTS时间戳)
│   └── websocket/
│       └── handler.go             # WebSocket 桥接
├── static/
│   ├── index.html                 # 主页面
│   └── novnc/                     # noVNC (需要下载)
├── config/
│   └── config.yaml                # 配置文件
├── download-novnc.sh              # noVNC 下载脚本
├── go.mod
└── README.md
```

## 关键技术实现

### 1. 画质调节 ([proxy.go](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p123/pkg/vnc/proxy.go#L556-L625))

支持 Tight 编码的压缩级别和质量级别动态调节：

```go
// 6个预设画质
var QualityPresets = []PresetQuality{
    {"lowest", 9, 2, "最低画质，最高压缩，带宽最小"},
    {"low", 8, 4, "低画质，高压缩"},
    {"medium", 6, 7, "中等画质（默认）"},
    {"high", 4, 8, "高质量，较低压缩"},
    {"highest", 2, 9, "最高画质，低压缩"},
    {"lossless", 1, 9, "无损压缩，带宽最高"},
}

// 发送 SetEncodings 消息设置编码和质量
func (p *VNCProxy) buildTightQualityMessage(settings QualitySettings) []byte {
    qLevel := uint32(0xFFFFFF00 | uint32(settings.QualityLevel))
    compLevel := uint32(0xFFFFFF00 | uint32(settings.CompressionLevel))
    // ...
}
```

### 2. 会话挂起/恢复 ([proxy.go](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p123/pkg/vnc/proxy.go#L627-L725))

```go
type SuspendedSession struct {
    Session     *database.Session
    Quality     QualitySettings
    SuspendedAt time.Time
}

func (p *VNCProxy) SuspendSession(clientID string) error {
    // 保存会话状态到内存
    p.suspendedClients[clientID] = &SuspendedSession{...}
    // 关闭连接但保留会话数据
    client.Conn.Close()
}

func (p *VNCProxy) ResumeSession(clientID string, newConn net.Conn) (*VNCClient, error) {
    // 从挂起列表恢复
    suspended := p.suspendedClients[clientID]
    // 重建客户端连接
    client := &VNCClient{...}
    p.clients[clientID] = client
    delete(p.suspendedClients, clientID)
}
```

### 3. MP4导出 ([recorder.go](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p123/pkg/recorder/recorder.go#L254-L659))

双引擎导出策略：
- **优先使用 ffmpeg**：质量更好，支持 faststart
- **纯Go MP4封装回退**：无需外部依赖，完整 MP4 容器实现

```go
func ExportToMP4(h264Path string, fps int, ffmpegPath string) (string, error) {
    if _, err := exec.LookPath(ffmpegPath); err == nil {
        return exportWithFFmpeg(h264Path, mp4Path, fps, ffmpegPath)
    }
    return exportPureGo(h264Path, mp4Path, fps)  // 纯Go实现
}

// 纯Go MP4封装器构建标准MP4盒子
type MP4Muxer struct {
    fps       int
    timescale uint32
    duration  uint32
}

func (m *MP4Muxer) WriteMP4(f *os.File, h264Data []byte) (string, error) {
    ftyp := m.buildFTYP()   // 文件类型盒
    moov := m.buildMOOV()   // 元数据盒 (mvhd + trak + mdia + ...)
    mdat := m.buildMDAT()   // 媒体数据盒
    f.Write(ftyp)
    f.Write(moov)
    f.Write(mdat)
}
```

### 4. 多用户光标同步 ([proxy.go](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p123/pkg/vnc/proxy.go#L346-L367))

```go
// 控制者发送 PointerEvent 时：
// 1. 存储当前光标位置 (cursorX, cursorY, cursorMask)
// 2. 广播给所有其他客户端
if msgType == MsgTypePointerEvent && n >= 6 {
    p.mu.Lock()
    p.cursorX = binary.BigEndian.Uint16(buf[2:4])
    p.cursorY = binary.BigEndian.Uint16(buf[4:6])
    p.cursorMask = buf[1]
    p.mu.Unlock()
    p.broadcastCursor(cursorData, client.ID)  // 广播给其他观看者
}

// 新用户加入时：
// 发送当前光标位置
if !client.IsController {
    cursorEvent := p.buildPointerEvent(p.cursorX, p.cursorY, p.cursorMask)
    client.Conn.Write(cursorEvent)
}
```

### 2. H.264 音视频同步 ([recorder.go](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p123/pkg/recorder/recorder.go#L75-L124))

**核心机制：**
- **固定帧率 (CFR)**：使用 `time.Ticker` 按 `1/FPS` 间隔输出帧
- **PTS 时间戳**：每帧递增的 PTS（Presentation Timestamp），确保播放时序正确
- **SEI 定时信息**：H.264 SEI 消息包含真实时间戳和帧率信息
- **空帧填充**：无新数据时输出空帧保持恒定帧率

```go
ticker := time.NewTicker(r.frameInterval)  // 1/30 秒
for {
    select {
    case <-ticker.C:
        // 每帧分配递增的 PTS
        pts := uint64(r.frameCount)
        if pendingFrame != nil {
            r.writeFrameWithPTS(f, pendingFrame.data, pts, timeBase)
            pendingFrame = nil
        } else {
            r.writeFrameWithPTS(f, r.buildNullFrame(), pts, timeBase)
        }
    }
}
```

## 安装与运行

### 前置要求
- Go 1.21+
- VNC 服务器 (如 TigerVNC, TightVNC)

### 1. 下载 noVNC
```bash
chmod +x download-novnc.sh
./download-novnc.sh
```

### 2. 安装依赖
```bash
go mod tidy
```

### 3. 配置
编辑 `config/config.yaml`：
```yaml
server:
  http_port: 8080
vnc:
  host: "localhost"
  port: 5900
  password: ""
  max_viewers: 10
recording:
  enabled: true
  output_dir: "./recordings"
  fps: 30
```

### 4. 启动 VNC 服务器
```bash
# macOS 示例
brew install tigervnc
vncserver :0 -localhost no
```

### 5. 运行代理
```bash
go run ./cmd/server/
```

### 6. 访问
打开浏览器访问 `http://localhost:8080`

## API 接口

### 会话管理
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/sessions` | 获取活跃会话列表 |
| DELETE | `/api/sessions/:id` | 终止指定会话 |
| POST | `/api/sessions/:id/suspend` | 挂起指定会话 |
| POST | `/api/sessions/:id/resume` | 恢复指定会话 |
| GET | `/api/sessions/suspended` | 获取挂起的会话列表 |

### 控制权限
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/control/request` | 请求控制权 |
| POST | `/api/control/release` | 释放控制权 |

### 画质调节
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/quality` | 获取当前画质和预设列表 |
| POST | `/api/quality` | 设置画质（支持预设或自定义参数） |

### 录制管理
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/recordings` | 获取录制列表 |
| GET | `/api/recordings/:id` | 下载 H.264 录制文件 |
| POST | `/api/recordings/:id/export` | 导出为 MP4 格式 |
| GET | `/api/recordings/mp4/:filename` | 下载 MP4 文件 |

**画质调节 POST 请求示例：**
```json
// 使用预设
{ "preset": "high" }

// 自定义
{ "compression_level": 6, "quality_level": 8 }
```

## 控制权限流程

1. **第一个用户**自动获得控制权
2. **后续用户**默认为观看者
3. 观看者可点击"请求控制"按钮申请
4. 当前控制者可点击"释放控制"移交权限
5. 控制者断开时，权限自动移交给最早加入的观看者

## 数据库结构

**sessions 表：**
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | 会话ID |
| user_id | TEXT | 用户ID |
| user_name | TEXT | 用户名 |
| is_controller | BOOLEAN | 是否控制者 |
| connected_at | DATETIME | 连接时间 |
| last_active | DATETIME | 最后活跃时间 |

**recordings 表：**
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | 录制ID |
| session_id | TEXT | 关联会话 |
| start_time | DATETIME | 开始时间 |
| end_time | DATETIME | 结束时间 |
| file_path | TEXT | 文件路径 |
| file_size | INTEGER | 文件大小 |
| resolution | TEXT | 分辨率@帧率 |

## 播放录制文件

### H.264 原始文件
- VLC Player
- FFplay: `ffplay -framerate 30 recordings/vnc_xxx.h264`

### MP4 导出
在前端点击"录制"按钮，选择录制文件后点击"导出MP4"，或使用命令行：
```bash
# 系统有ffmpeg时自动使用
# 无ffmpeg时使用纯Go实现
```

手动转换:
```bash
ffmpeg -framerate 30 -i input.h264 -c:v libx264 -preset medium -crf 23 -movflags +faststart output.mp4
```

## 常见问题

**Q: 为什么所有用户光标都同步了？**
A: 这是设计特性。控制者的鼠标移动会实时同步到所有观看者，确保所有人看到完全一致的画面。

**Q: 录制文件没有声音？**
A: 当前版本只录制视频。如需音频，可扩展 `recorder.go` 集成音频采集。

**Q: 控制权限如何移交？**
A: 当控制者断开时，系统会自动将控制权移交给最早加入的在线观看者。

**Q: 如何挂起和恢复会话？**
A: 点击顶部"挂起"按钮，确认后会话将被保存。下次使用相同的用户名登录时，系统会检测到挂起的会话并可恢复。

**Q: 画质调节对所有用户生效吗？**
A: 是的，画质调节是全局设置，会同时应用到 VNC 服务器和所有连接的客户端。

**Q: MP4 导出需要安装 ffmpeg 吗？**
A: 推荐安装 ffmpeg 以获得更好的导出质量。如果没有安装 ffmpeg，系统会使用纯 Go 实现的 MP4 封装器作为回退方案。

## 代码引用

### v2.0 新功能
- 画质调节: [SetQuality](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p123/pkg/vnc/proxy.go#L556-L583), [QualityPresets](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p123/pkg/vnc/proxy.go#L144-L163)
- 会话挂起/恢复: [SuspendSession](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p123/pkg/vnc/proxy.go#L627-L675), [ResumeSession](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p123/pkg/vnc/proxy.go#L677-L708)
- MP4导出: [ExportToMP4](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p123/pkg/recorder/recorder.go#L254-L270), [MP4Muxer](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p123/pkg/recorder/recorder.go#L313-L659)

### 核心功能
- 光标同步逻辑: [handleClient](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p123/pkg/vnc/proxy.go#L288-L344), [broadcastCursor](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p123/pkg/vnc/proxy.go#L355-L367)
- 录制音视频同步: [recordLoop](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p123/pkg/recorder/recorder.go#L75-L124), [writeFrameWithPTS](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p123/pkg/recorder/recorder.go#L126-L137)
- VNC RFB 协议握手: [handshake](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p123/pkg/vnc/proxy.go#L94-L179)
- WebSocket 桥接: [WebsocketHandler](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p123/pkg/websocket/handler.go#L14-L58)
- HTTP服务器与API: [main.go](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p123/cmd/server/main.go)
