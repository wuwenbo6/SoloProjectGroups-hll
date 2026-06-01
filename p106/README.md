# FM Radio Player

基于 Electron 的 FM 广播播放器，使用 RTL-SDR 接收 FM 广播信号，解调音频并编码为 AAC 格式，同时支持 RDS 元数据显示和多频点扫描。

## 功能特性

- 📻 **FM 广播接收**: 通过 RTL-SDR 设备接收 FM 广播信号
- 🔊 **音频解调**: 实时解调 FM 音频信号
- 🎵 **AAC 编码**: 将音频编码为 AAC 格式进行流媒体传输
- 📡 **RDS 元数据**: 显示电台名称、节目类型等 RDS 信息
- 🔍 **频点扫描**: 支持自定义范围的频率扫描，自动发现可用电台
- 🌐 **HTTP 流媒体**: 通过 HTTP 提供 AAC 音频流
- 🎨 **现代 UI**: 美观的 Electron 桌面应用界面

## 系统要求

### 硬件
- RTL-SDR USB  dongle (RTL2832U 芯片)
- FM 天线

### 软件
- macOS / Linux / Windows
- Node.js 16+
- **rtl-sdr** 工具包
- **ffmpeg** (用于 AAC 编码)
- **redsea** (可选，用于 RDS 解码)

## 安装依赖

### 1. 安装系统依赖

**macOS (使用 Homebrew):**
```bash
brew install rtl-sdr ffmpeg redsea
```

**Ubuntu/Debian:**
```bash
sudo apt-get install rtl-sdr ffmpeg
# 安装 redsea (需要从源码编译)
```

**Windows:**
- 从 [rtl-sdr](https://github.com/steve-m/librtlsdr) 下载预编译二进制
- 安装 [ffmpeg](https://ffmpeg.org/download.html)

### 2. 安装 Node.js 依赖

```bash
npm install
```

## 使用方法

### 启动应用

```bash
npm start
```

### 开发模式 (带开发者工具)

```bash
npm run dev
```

## 功能说明

### 1. 手动调谐
- 在频率输入框中输入 FM 频率 (87.5 - 108 MHz)
- 点击"调谐"按钮开始接收
- 或点击快速频率按钮快速切换

### 2. 播放控制
- 点击"播放"按钮开始音频播放
- 点击"停止"按钮停止接收
- 流媒体地址可复制到其他播放器播放

### 3. 频率扫描
- 设置扫描范围的起始频率和结束频率
- 设置扫描步进 (默认 0.1 MHz)
- 点击"开始扫描"按钮
- 扫描过程中会实时显示发现的电台
- 点击电台列表中的"收听"按钮即可收听

### 4. RDS 元数据
- 电台名称 (PS)
- 节目类型 (PTY)
- 广播文本 (RT)

## 项目结构

```
p106/
├── main.js                 # Electron 主进程
├── preload.js              # 预加载脚本 (IPC 桥接)
├── package.json            # 项目配置
├── src/
│   ├── fmReceiver.js       # FM 接收和解调模块
│   ├── rdsDecoder.js       # RDS 元数据解码
│   ├── aacEncoder.js       # AAC 音频编码
│   ├── streamServer.js     # HTTP 流媒体服务器
│   └── radioController.js  # 主控制器
└── public/
    ├── index.html          # 前端页面
    ├── style.css           # 样式文件
    └── app.js              # 前端逻辑
```

## 技术架构

```
RTL-SDR 硬件
    ↓
rtl_fm (FM 解调)
    ↓
PCM 音频流 → RDS 解码 (redsea) → RDS 元数据
    ↓
AAC 编码 (ffmpeg)
    ↓
HTTP 流媒体服务器 (Express)
    ↓
Electron 前端 / 其他音频播放器
```

## 流媒体接口

| 接口 | 地址 | 说明 |
|------|------|------|
| 音频流 | `http://localhost:8080/stream.aac` | AAC 格式音频流 |
| 元数据 | `http://localhost:8080/metadata` | JSON 格式 RDS 元数据 |
| 状态 | `http://localhost:8080/status` | 服务器状态信息 |

## 故障排除

### 1. 找不到 RTL-SDR 设备
```bash
# 检查设备是否被识别
rtl_test
```

### 2. 权限问题 (Linux)
```bash
# 添加 udev 规则
sudo echo 'SUBSYSTEM=="usb", ATTRS{idVendor}=="0bda", ATTRS{idProduct}=="2838", MODE="0666"' > /etc/udev/rules.d/20-rtlsdr.rules
sudo udevadm control --reload-rules
```

### 3. 音频没有声音
- 检查 RTL-SDR 天线连接
- 尝试不同的频率
- 确认系统音量未静音

## 注意事项

1. **天线位置**: 为了获得最佳接收效果，请将天线放置在靠近窗户的位置
2. **信号强度**: FM 信号受距离和障碍物影响较大
3. **CPU 占用**: 实时音频编码会占用一定 CPU 资源
4. **法律合规**: 请遵守当地无线电管理法规

## 许可证

MIT License
