# Node.js DLNA 媒体服务器

一个基于 Node.js 实现的 DLNA/UPnP 媒体服务器，可以扫描本地媒体文件并通过 UPnP 协议提供给 DLNA 客户端（电视、手机等）播放。同时提供 Web 界面展示媒体库，支持按类型筛选。

## 功能特性

- 🎬 **视频支持**: MP4, MKV, AVI, MOV, WMV, FLV, M4V, WebM, MPEG, MPG
- 🎵 **音频支持**: MP3, WAV, FLAC, AAC, OGG, M4A, WMA, Opus
- 🖼️ **图片支持**: JPG, JPEG, PNG, GIF, BMP, TIFF, WebP
- 🔄 **实时转码**: FLAC 自动转码为 LPCM 格式，兼容更多设备
- 📝 **字幕支持**: 自动检测并加载 SRT 外挂字幕，支持 WebVTT 转换
- 🌐 **UPnP/DLNA 协议**: 兼容标准 DLNA 客户端设备
- 📱 **Web 界面**: 响应式设计，支持移动端访问
- 🔍 **类型筛选**: 按视频、音频、图片分类浏览
- 🔄 **实时监控**: 自动监控媒体文件夹变化
- 📂 **多目录扫描**: 支持同时扫描多个媒体目录

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 生成图标

```bash
npm run generate-icon
```

### 3. 配置媒体目录

编辑 `config.js` 文件，修改 `media.scanPaths` 配置：

```javascript
media: {
  scanPaths: [
    '/path/to/your/videos',
    '/path/to/your/music',
    '/path/to/your/pictures'
  ]
}
```

### 4. 启动服务器

```bash
npm start
```

服务器启动后：
- Web 界面: `http://<你的IP>:8080`
- DLNA 服务会自动在局域网内广播

## 配置说明

### 服务器配置

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `server.port` | Web 服务端口 | 8080 |
| `server.friendlyName` | DLNA 设备名称 | "Node.js DLNA Media Server" |
| `server.uuid` | 设备唯一标识 | 自动生成 |

### 媒体扫描配置

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `media.scanPaths` | 媒体扫描路径数组 | 用户目录下的 Movies, Music, Pictures |
| `media.scanInterval` | 自动扫描间隔（毫秒） | 30000 |
| `media.watchForChanges` | 是否监控文件变化 | true |

### 支持的文件格式

在 `config.js` 中可以自定义支持的文件扩展名：

```javascript
extensions: {
  video: ['.mp4', '.mkv', '.avi', ...],
  audio: ['.mp3', '.wav', '.flac', ...],
  image: ['.jpg', '.jpeg', '.png', ...]
}
```

## API 接口

### 获取媒体列表

```
GET /api/media?type=video&page=1&limit=50&search=keyword
```

参数：
- `type`: 类型筛选 (all, video, audio, image)
- `page`: 页码
- `limit`: 每页数量
- `search`: 搜索关键词

### 获取媒体详情

```
GET /api/media/:id
```

### 获取统计信息

```
GET /api/stats
```

### 触发重新扫描

```
GET /api/scan
```

### 流媒体播放

```
GET /stream/:id
```

支持 Range 请求，可用于视频拖动播放。

### 获取缩略图

```
GET /thumbnail/:id
```

## DLNA 客户端兼容性

已测试兼容的设备和应用：

- ✅ 智能电视（Samsung, LG, Sony, TCL 等）
- ✅ 安卓手机（BubbleUPnP, VLC, MX Player）
- ✅ iOS 设备（VLC, Infuse）
- ✅ Windows 媒体播放器
- ✅ Kodi (XBMC)
- ✅ Plex

## 项目结构

```
p160/
├── config.js              # 配置文件
├── server.js              # 主服务器入口
├── package.json           # 项目依赖
├── src/
│   ├── mediaScanner.js    # 媒体文件扫描器
│   └── dlnaServer.js      # DLNA/UPnP 服务器
├── public/                # Web 前端资源
│   ├── index.html
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   └── app.js
│   └── images/
│       ├── icon.png       # 服务器图标
│       ├── placeholder.svg
│       ├── video.svg
│       ├── audio.svg
│       └── image.svg
└── scripts/
    └── generateIcon.js    # 图标生成脚本
```

## 技术栈

- **Node.js**: 运行环境
- **Express**: Web 服务器
- **xmlbuilder2**: XML 生成（用于 UPnP 协议）
- **mime-types**: MIME 类型识别
- **chokidar**: 文件系统监控
- **cors**: 跨域资源共享

## 工作原理

### UPnP 协议栈

1. **SSDP (Simple Service Discovery Protocol)**: 
   - UDP 组播 (239.255.255.250:1900)
   - 设备发现和广告
   - 响应 M-SEARCH 请求

2. **设备描述**:
   - `/device.xml`: 设备信息和服务列表
   - `/ContentDirectory.xml`: 内容目录服务描述

3. **SOAP 控制**:
   - `/control/ContentDirectory`: 接收 Browse 等控制请求
   - 返回 DIDL-Lite 格式的媒体列表

4. **流媒体传输**:
   - `/stream/:id`: HTTP 流式传输
   - 支持 Range 请求实现拖动播放

### 媒体扫描流程

1. 启动时扫描配置的所有目录
2. 识别文件类型（视频/音频/图片）
3. 提取文件元数据
4. 实时监控文件夹变化
5. 定期自动重新扫描

## 常见问题

### Q: DLNA 客户端找不到服务器？

A: 请检查：
1. 确保服务器和客户端在同一局域网
2. 防火墙允许 UDP 1900 和 TCP 8080 端口
3. 检查 `config.js` 中的 `host` 配置是否正确

### Q: 视频无法播放？

A: 可能原因：
1. 视频编码不被客户端支持
2. 文件格式不在支持列表中
3. 网络带宽不足

### Q: 如何添加自定义媒体目录？

A: 编辑 `config.js` 中的 `media.scanPaths` 数组，添加你的目录路径。

### Q: FLAC 转码需要什么？

A: 需要系统安装 FFmpeg。可以通过以下命令安装：
- macOS: `brew install ffmpeg`
- Ubuntu/Debian: `sudo apt-get install ffmpeg`
- Windows: 从 [ffmpeg.org](https://ffmpeg.org/) 下载并添加到 PATH

### Q: 字幕文件如何命名才能被自动识别？

A: 字幕文件需要与视频文件同名，扩展名改为 `.srt`。例如：
- 视频文件: `movie.mp4`
- 字幕文件: `movie.srt` 或 `movie.zh.srt`、`movie.en.srt`

### Q: 支持哪些字幕格式？

A: 目前支持 SRT 格式字幕，并可以转换为 WebVTT 格式供 HTML5 播放器使用。

## 开发说明

### 本地开发

```bash
npm run dev
```

使用 nodemon 自动重启服务器。

### 调试模式

设置环境变量启用调试日志：

```bash
DEBUG=dlna:* npm start
```

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！
