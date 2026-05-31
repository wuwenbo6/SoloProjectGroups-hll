# ADS-B 航班追踪器

基于 Electron 的 ADS-B 航班追踪应用，使用 dump1090 接收信号，Leaflet 地图实时显示飞机位置和轨迹。

## 功能特性

- ✈️ 实时接收 dump1090 的 ADS-B 信号（SBS1 格式）
- 🛰️ 解析航班号、位置、高度、速度、航向等数据
- 🗺️ Leaflet 地图实时显示飞机图标
- 📍 实时轨迹绘制
- 📅 历史数据回放功能
- 💾 SQLite 数据库存储航班数据

## 项目结构

```
p53/
├── package.json
├── src/
│   ├── main/
│   │   ├── main.js          # Electron 主进程
│   │   ├── adsbReceiver.js  # ADS-B 数据接收解析器
│   │   └── database.js      # SQLite 数据库操作
│   └── renderer/
│       ├── index.html       # 前端页面
│       ├── renderer.js      # 前端逻辑
│       └── styles.css       # 样式文件
└── database/                # SQLite 数据库目录
```

## 安装依赖

```bash
npm install
```

## 前置要求

1. **安装并运行 dump1090**

   应用通过 TCP 连接到 dump1090 的 SBS1 端口（默认 30003）。

   使用 dump1090-fa 或 dump1090-mutability：
   ```bash
   # 确保 dump1090 启用 SBS1 输出
   dump1090 --net --net-sbs-port 30003
   ```

2. **RTL-SDR 硬件**
   
   需要 RTL-SDR  dongle 接收 ADS-B 信号。

## 运行应用

```bash
npm start
```

开发模式（带开发者工具）：
```bash
npm run dev
```

## 使用说明

### 1. 连接 dump1090

- 输入 dump1090 主机地址和端口（默认 localhost:30003）
- 点击「连接」按钮开始接收数据

### 2. 实时追踪

- 地图上显示所有检测到的飞机
- 红色图标表示飞机位置，指向航向
- 点击飞机查看详细信息
- 侧边栏显示航班列表
- 轨迹线显示飞机飞行路径

### 3. 历史回放

- 点击「历史回放」按钮加载最近1小时的数据
- 使用播放/暂停控制回放
- 拖动滑块跳转时间点
- 可选择回放速度（1x, 2x, 5x, 10x）

## 数据存储

航班数据自动存储在 `database/flights.db` SQLite 数据库中，包含：

- icao24 - 飞机 ICAO 24位地址
- callsign - 航班号
- latitude/longitude - 经纬度
- altitude - 高度（英尺）
- velocity - 速度（节）
- heading - 航向（度）
- vertical_rate - 垂直速度（英尺/分钟）
- timestamp - 时间戳

## 技术栈

- **Electron** - 跨平台桌面应用框架
- **Leaflet** - 交互式地图库
- **better-sqlite3** - SQLite 数据库
- **dump1090** - ADS-B 信号解码
