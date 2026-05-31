# IoT 物联网系统

一个基于 Go + MQTT + Vue3 的物联网管理系统，支持传感器数据采集、规则引擎、场景联动和设备远程控制。

## 功能特性

- ✅ **MQTT 消息接入** - 接收 Zigbee 网关上报的传感器数据
- ✅ **规则引擎** - 条件触发自动化（如：温度>30℃自动开风扇）
- ✅ **场景联动** - 支持定时触发和条件触发场景
- ✅ **设备控制** - 反向控制设备，下发指令
- ✅ **数据持久化** - SQLite 存储历史数据
- ✅ **Vue3 仪表盘** - 实时数据可视化、设备管理

## 技术栈

### 后端
- Go 1.21
- Gin (HTTP 框架)
- GORM (ORM)
- Paho MQTT (MQTT 客户端)
- cron (定时任务)
- SQLite (数据库)

### 前端
- Vue 3
- Element Plus
- ECharts (图表)
- Pinia (状态管理)
- Vite

## 项目结构

```
p10/
├── backend/                 # Go 后端
│   ├── cmd/
│   │   └── main.go         # 程序入口
│   ├── internal/
│   │   ├── api/            # REST API
│   │   ├── config/         # 配置
│   │   ├── engine/         # 规则引擎
│   │   └── models/         # 数据模型
│   ├── pkg/
│   │   ├── database/       # 数据库操作
│   │   └── mqttclient/     # MQTT 客户端
│   └── go.mod
├── frontend/               # Vue3 前端
│   ├── src/
│   │   ├── views/          # 页面
│   │   ├── api/            # API 封装
│   │   └── router/         # 路由
│   └── package.json
└── README.md
```

## 快速开始

### 前置要求

- Go 1.21+
- Node.js 16+
- MQTT Broker (如 Mosquitto)

### 安装 MQTT Broker (Mosquitto)

**macOS:**
```bash
brew install mosquitto
brew services start mosquitto
```

**Ubuntu/Debian:**
```bash
sudo apt-get install mosquitto
sudo systemctl start mosquitto
```

### 启动后端

```bash
cd backend
go mod tidy
go run cmd/main.go
```

后端服务将在 `http://localhost:8080` 启动

### 启动前端

```bash
cd frontend
npm install
npm run dev
```

前端服务将在 `http://localhost:3000` 启动

## API 接口

### 设备管理
- `GET /api/devices` - 获取所有设备
- `GET /api/devices/:id` - 获取单个设备
- `PUT /api/devices/:id` - 更新设备信息
- `GET /api/devices/:id/history` - 获取设备历史数据
- `POST /api/devices/:id/command` - 发送控制指令

### 规则引擎
- `GET /api/rules` - 获取所有规则
- `POST /api/rules` - 创建规则
- `PUT /api/rules/:id` - 更新规则
- `DELETE /api/rules/:id` - 删除规则

### 场景联动
- `GET /api/scenes` - 获取所有场景
- `POST /api/scenes` - 创建场景
- `PUT /api/scenes/:id` - 更新场景
- `DELETE /api/scenes/:id` - 删除场景
- `POST /api/scenes/:id/trigger` - 手动触发场景

## MQTT 主题

### 传感器数据上报
- 主题: `zigbee/sensor/#`
- 消息格式:
```json
{
  "device_id": "sensor_001",
  "type": "temperature",
  "value": 25.5,
  "unit": "°C"
}
```

### 设备控制指令
- 主题: `zigbee/device/{device_id}/command`
- 消息格式:
```json
{
  "power": true,
  "speed": 3
}
```

## 规则引擎示例

**规则: 温度 > 30℃ 自动开启风扇**

```json
{
  "name": "高温开风扇",
  "condition": {
    "device_id": "sensor_kitchen",
    "data_type": "temperature",
    "operator": ">",
    "threshold": 30
  },
  "action": {
    "device_id": "fan_living",
    "command": { "power": true }
  }
}
```

## 场景联动示例

**定时场景: 每天 18:00 打开客厅灯光**

```json
{
  "name": "回家模式",
  "trigger_type": "scheduled",
  "cron_expr": "0 0 18 * * *",
  "actions": [
    {
      "device_id": "light_living",
      "command": "{\"power\":true}"
    }
  ]
}
```

## 默认配置

| 服务 | 地址 |
|------|------|
| 后端 API | http://localhost:8080 |
| 前端 | http://localhost:3000 |
| MQTT Broker | tcp://localhost:1883 |
| 数据库文件 | backend/iot.db |

## 开发说明

### 添加新的设备类型

1. 在 `backend/internal/models/models.go` 中扩展设备类型
2. 在 `backend/internal/engine/rule_engine.go` 中添加对应处理逻辑
3. 在前端设备类型选择器中添加选项

### 自定义规则条件

在 `backend/internal/engine/rule_engine.go` 的 `compareValues` 函数中扩展比较运算符。

## License

MIT
