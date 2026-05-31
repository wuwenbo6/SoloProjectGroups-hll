# 智能照明控制系统

基于 Node.js + MQTT 的智能照明控制系统，通过 BLE Mesh 网关控制数百个灯具。

## 功能特性

- **设备控制**: 支持单个/批量设备亮度、色温调节
- **场景预设**: 会议/下班/演示/午餐等预设场景
- **定时任务**: 基于 Cron 表达式的定时场景切换
- **传感器联动**: 支持人体感应、光照传感器等自动控制
- **实时状态**: Socket.io 实时推送设备状态更新
- **数据持久化**: SQLite 存储设备状态和配置

## 技术架构

### 后端
- Node.js + Express
- MQTT (Aedes Broker)
- SQLite + Sequelize ORM
- node-cron (定时任务)
- Socket.io (实时通信)

### 前端
- React 18
- Material UI
- Axios + Socket.io-client

## 项目结构

```
p43/
├── backend/                 # 后端服务
│   ├── src/
│   │   ├── server.js        # 主服务入口
│   │   ├── config/          # 配置文件
│   │   ├── models/          # 数据库模型
│   │   ├── controllers/     # API 控制器
│   │   ├── routes/          # 路由定义
│   │   ├── services/        # 业务服务
│   │   ├── mqtt/            # MQTT Broker
│   │   └── gateway/         # BLE Mesh 网关模拟
│   ├── database/            # SQLite 数据库文件
│   ├── package.json
│   └── .env
└── frontend/                # 前端应用
    ├── src/
    │   ├── components/      # React 组件
    │   ├── services/        # API 和 Socket 服务
    │   ├── App.js
    │   └── index.js
    ├── public/
    └── package.json
```

## 快速开始

### 1. 安装后端依赖

```bash
cd backend
npm install
```

### 2. 启动后端服务

```bash
npm start
# 或开发模式
npm run dev
```

后端服务将在以下端口启动：
- HTTP API: http://localhost:3001
- MQTT Broker: tcp://localhost:1883
- MQTT WebSocket: ws://localhost:8080
- Socket.io: ws://localhost:3001

### 3. 安装前端依赖

```bash
cd frontend
npm install
```

### 4. 启动前端应用

```bash
npm start
```

前端应用将在 http://localhost:3000 启动

## API 接口

### 设备管理
- `GET /api/devices` - 获取所有设备
- `GET /api/devices/:id` - 获取单个设备
- `POST /api/devices` - 创建设备
- `PUT /api/devices/:id` - 更新设备
- `DELETE /api/devices/:id` - 删除设备
- `POST /api/devices/:id/control` - 控制单个设备
- `POST /api/devices/control/all` - 批量控制设备
- `POST /api/devices/sync` - 从网关同步设备

### 场景管理
- `GET /api/scenes` - 获取所有场景
- `POST /api/scenes` - 创建场景
- `PUT /api/scenes/:id` - 更新场景
- `DELETE /api/scenes/:id` - 删除场景
- `POST /api/scenes/:id/apply` - 应用场景

### 定时任务
- `GET /api/scheduled-tasks` - 获取所有定时任务
- `POST /api/scheduled-tasks` - 创建定时任务
- `PUT /api/scheduled-tasks/:id` - 更新定时任务
- `DELETE /api/scheduled-tasks/:id` - 删除定时任务

### 传感器
- `GET /api/sensors` - 获取所有传感器
- `POST /api/sensors/simulate` - 模拟传感器数据

## MQTT 主题

### 控制命令
- `blemesh/control/{deviceId}` - 控制单个设备
- `blemesh/control/all` - 控制所有设备
- `blemesh/command/set-scene` - 设置场景

### 状态上报
- `blemesh/status/devices` - 所有设备状态
- `blemesh/status/{deviceId}` - 单个设备状态
- `sensors/data/{sensorId}` - 传感器数据

## 预设场景

| 场景ID | 名称 | 亮度 | 色温 |
|--------|------|------|------|
| meeting | 会议模式 | 80% | 4500K |
| off-duty | 下班模式 | 10% | 3000K |
| presentation | 演示模式 | 50% | 4000K |
| lunch | 午餐模式 | 30% | 3500K |
| all-on | 全部开启 | 100% | 4000K |
| all-off | 全部关闭 | 0% | 4000K |

## Cron 表达式示例

```
# 每天 9:00 执行
0 9 * * *

# 工作日 18:00 执行
0 18 * * 1-5

# 每小时执行一次
0 * * * *

# 周一至周五 9:00 和 18:00 执行
0 9,18 * * 1-5
```

## 传感器联动规则

系统支持以下传感器类型：
- 运动传感器 (motion)
- 光照传感器 (light)
- 温度传感器 (temperature)
- 湿度传感器 (humidity)
- 人体感应 (occupancy)

触发条件支持：
- `equals` - 等于
- `not_equals` - 不等于
- `greater_than` - 大于
- `less_than` - 小于
- `greater_than_or_equals` - 大于等于
- `less_than_or_equals` - 小于等于

## 默认数据

系统启动时会自动创建：
- 200 个模拟灯具设备
- 6 个预设场景
- 8 个模拟传感器
- 3 个自动化联动规则
