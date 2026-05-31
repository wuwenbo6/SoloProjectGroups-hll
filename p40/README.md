# 🤖 WebRTC 机器人远程控制系统

一个基于 WebRTC 的机器人远程控制 Web 应用，支持低延迟 H.264 视频流、虚拟操纵杆、力反馈虚拟墙和操作日志记录。

## ✨ 功能特性

### 核心功能
- **📡 WebRTC 实时通信** - 点对点低延迟连接，支持 H.264 视频流
- **🎮 虚拟操纵杆** - 双摇杆控制，支持鼠标和触摸操作
- **🛡️ 力反馈虚拟墙** - 根据距离传感器数据模拟阻力反馈
- **📊 操作日志记录** - SQLite 数据库记录所有操作行为
- **🔌 多通信方式** - 支持串口和 UDP 两种指令转发模式

### 界面特性
- **🎨 科技感深色主题** - 霓虹青色调，未来感设计
- **📱 响应式布局** - 支持桌面、平板、移动端
- **⚡ 实时状态面板** - 电量、信号、距离、温度等数据展示
- **🎬 视频播放器** - 带扫描线效果的 HUD 风格视频显示

## 🏗️ 技术架构

### 前端技术栈
- **React 18** - 组件化 UI 框架
- **TypeScript** - 类型安全
- **Vite** - 快速构建工具
- **Tailwind CSS** - 原子化 CSS 框架
- **Zustand** - 轻量级状态管理
- **WebRTC API** - 点对点通信
- **WebCodecs API** - H.264 硬件解码

### 后端技术栈
- **Node.js + Express** - Web 服务器
- **TypeScript** - 类型安全
- **WebSocket (ws)** - 信令服务器
- **better-sqlite3** - 轻量级数据库
- **serialport** - 串口通信
- **dgram** - UDP 通信
- **bcryptjs** - 密码加密

## 📁 项目结构

```
p40/
├── src/                          # 前端源码
│   ├── components/               # React 组件
│   │   ├── VideoPlayer.tsx       # 视频播放器组件
│   │   ├── Joystick.tsx          # 虚拟操纵杆组件
│   │   ├── StatusPanel.tsx       # 状态面板组件
│   │   └── ControlPanel.tsx      # 控制面板组件
│   ├── hooks/                    # 自定义 Hooks
│   │   ├── useWebRTC.ts          # WebRTC 连接管理
│   │   └── useJoystick.ts        # 操纵杆逻辑
│   ├── pages/                    # 页面组件
│   │   ├── Home.tsx              # 控制主页
│   │   ├── Logs.tsx              # 操作日志页面
│   │   └── Settings.tsx          # 系统设置页面
│   ├── store/                    # 状态管理
│   │   └── useStore.ts           # Zustand Store
│   ├── types/                    # TypeScript 类型定义
│   ├── App.tsx                   # 应用入口
│   └── index.css                 # 全局样式
├── api/                          # 后端源码
│   ├── controllers/              # API 控制器
│   │   ├── LogController.ts      # 日志 API
│   │   └── ConfigController.ts   # 配置 API
│   ├── services/                 # 业务服务
│   │   ├── DatabaseService.ts    # 数据库服务
│   │   ├── SerialService.ts      # 串口通信服务
│   │   └── UDPService.ts         # UDP 通信服务
│   ├── webrtc/                   # WebRTC 模块
│   │   └── SignalingServer.ts    # 信令服务器
│   ├── app.ts                    # Express 应用
│   └── server.ts                 # 服务器入口
├── data/                         # 数据库文件 (自动创建)
├── .trae/documents/              # 项目文档
│   ├── PRD.md                    # 产品需求文档
│   └── Technical-Architecture.md # 技术架构文档
└── package.json
```

## 🚀 快速开始

### 环境要求
- Node.js >= 18
- npm >= 9

### 安装依赖

```bash
npm install --legacy-peer-deps
```

### 开发模式

```bash
# 同时启动前端和后端
npm run dev

# 或分别启动
npm run client:dev  # 前端 (http://localhost:5173)
npm run server:dev  # 后端 (http://localhost:3001)
```

### 构建生产版本

```bash
npm run build
```

## 📋 默认配置

### 默认账号
- 用户名: `admin`
- 密码: `admin123`

### 系统配置
配置项存储在 SQLite 数据库的 `system_config` 表中：

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `serial_port` | `/dev/ttyUSB0` | 串口设备路径 |
| `serial_baudrate` | `115200` | 串口波特率 |
| `udp_host` | `127.0.0.1` | UDP 目标主机 |
| `udp_port` | `5000` | UDP 目标端口 |
| `communication_mode` | `udp` | 通信模式: `udp` / `serial` |
| `virtual_wall_distance` | `50` | 虚拟墙触发距离 (cm) |
| `force_feedback_enabled` | `true` | 是否启用力反馈 |

## 🔧 API 接口

### 日志相关
- `GET /api/logs` - 获取操作日志
  - 参数: `page`, `limit`, `userId`, `startDate`, `endDate`
- `POST /api/logs` - 记录操作日志

### 配置相关
- `GET /api/config` - 获取所有配置
- `PUT /api/config` - 更新配置
- `GET /api/serial/ports` - 获取可用串口列表

### 系统
- `GET /api/health` - 健康检查
- `WebSocket /ws` - WebRTC 信令通道

## 🎮 使用说明

### 控制操作
1. 点击「连接机器人」建立 WebRTC 连接
2. 使用左摇杆控制机器人移动
3. 使用右摇杆控制摄像头视角
4. 观察状态面板的实时数据

### 力反馈效果
- 当机器人接近障碍物时（< 50cm），操纵杆会显示黄色警告
- 当距离过近时（< 15cm），显示红色危险警告并增加阻力
- 操纵杆会产生抖动效果模拟触觉反馈

### 查看日志
- 点击「操作日志」查看所有控制记录
- 支持按时间、用户筛选
- 记录内容包括：操作类型、用户、IP 地址、指令详情

## 🔌 机器人端集成

### 指令格式 (JSON)
```json
{
  "type": "move",
  "joystickId": "left",
  "x": 0.5,
  "y": -0.3,
  "speed": 0.58,
  "timestamp": 1716500000000
}
```

### 传感器数据格式 (JSON)
```json
{
  "type": "distance",
  "distance": 45.5,
  "timestamp": 1716500000000
}
```

## 📊 数据库结构

### users 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 用户ID |
| username | VARCHAR | 用户名 |
| password_hash | VARCHAR | 密码哈希 |
| role | VARCHAR | 角色 |
| created_at | DATETIME | 创建时间 |

### operation_logs 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 日志ID |
| user_id | INTEGER | 用户ID |
| action | VARCHAR | 操作类型 |
| command_json | TEXT | 指令JSON |
| ip_address | VARCHAR | IP地址 |
| timestamp | DATETIME | 时间戳 |

### system_config 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 配置ID |
| config_key | VARCHAR | 配置键 |
| config_value | TEXT | 配置值 |
| updated_at | DATETIME | 更新时间 |

## 🎨 设计特点

### 视觉风格
- **主色调**: 深科技蓝 (#0A1628)
- **强调色**: 霓虹青 (#00D4FF)
- **警示色**: 警戒红 (#FF4757)、警告黄 (#FFC107)
- **字体**: JetBrains Mono (等宽) + Inter (无衬线)

### 动效设计
- 操纵杆发光效果
- 虚拟墙脉冲警告动画
- 视频扫描线效果
- 平滑状态过渡

## 📝 开发说明

### 添加新功能
1. 在 `src/types/index.ts` 定义类型
2. 在 `src/store/useStore.ts` 添加状态
3. 创建组件或 Hook 实现功能
4. 后端对应添加 API 或服务

### 代码规范
- 使用 TypeScript 严格类型
- 组件文件不超过 200 行
- 遵循 React Hooks 最佳实践
- 使用 Tailwind CSS 原子化样式

## 📄 许可证

MIT License

---

> 💡 **提示**: 本项目为演示用途，实际部署时请加强安全措施，如 HTTPS、用户认证、防火墙等。
