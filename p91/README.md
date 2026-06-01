# NB-IoT 设备管理系统

一个基于 Node.js 的 NB-IoT 设备管理系统，使用 LwM2M 协议管理设备，支持传感器数据采集和远程控制。

## 功能特性

- 🔌 **设备管理**: 设备注册、生命周期管理、在线状态监控
- 📊 **传感器数据**: 温度、位置数据采集与历史存储
- 🗺️ **地图展示**: 前端 Leaflet 地图展示设备分布
- 📟 **命令下发**: 支持远程重启等控制命令
- 💾 **数据持久化**: SQLite 数据库存储历史数据
- 🔄 **实时推送**: WebSocket 实时更新设备状态和数据

## 项目结构

```
p91/
├── server/
│   ├── index.js          # 主服务器入口
│   ├── lwm2m-server.js   # LwM2M 服务器模拟
│   └── database.js       # 数据库操作
├── public/
│   ├── index.html        # 前端页面
│   ├── styles.css        # 样式文件
│   └── app.js            # 前端逻辑
├── data/                 # 数据库文件目录
├── test-device-simulator.js  # 设备模拟器
├── package.json
└── README.md
```

## API 接口

### LwM2M 设备接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/lwm2m/register` | 设备注册 |
| POST | `/api/lwm2m/update` | 上报传感器数据 |
| GET | `/api/lwm2m/commands/:endpoint` | 获取待执行命令 |
| POST | `/api/lwm2m/deregister` | 设备注销 |

### 管理接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/devices` | 获取所有设备列表 |
| GET | `/api/devices/:id` | 获取设备详情 |
| GET | `/api/devices/:id/sensor-data` | 获取设备传感器历史 |
| POST | `/api/devices/:id/command` | 发送自定义命令 |
| POST | `/api/devices/:id/restart` | 发送重启命令 |
| GET | `/api/commands` | 获取命令历史 |

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动服务器

```bash
npm start
```

服务器将在 http://localhost:3000 启动

### 3. 启动设备模拟器（新终端）

```bash
node test-device-simulator.js
```

### 4. 访问前端界面

打开浏览器访问 http://localhost:3000

## 数据库表结构

### devices (设备表)
- id: 设备ID
- name: 设备名称
- endpoint: LwM2M 端点
- status: 在线状态
- latitude/longitude: 位置
- last_seen: 最后在线时间
- registered_at: 注册时间

### sensor_data (传感器数据表)
- device_id: 关联设备
- temperature: 温度
- latitude/longitude: 位置
- timestamp: 记录时间

### commands (命令表)
- device_id: 关联设备
- command: 命令内容
- status: 执行状态
- created_at/executed_at: 时间戳

## 技术栈

- **后端**: Node.js + Express
- **数据库**: SQLite (better-sqlite3)
- **实时通信**: WebSocket (ws)
- **前端地图**: Leaflet
- **协议**: LwM2M (模拟实现)
