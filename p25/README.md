# 光伏电站监控系统 (PV Monitor)

一个完整的光伏电站监控解决方案，基于 Go + MQTT + TimescaleDB 技术栈，支持实时数据采集、PR值计算、报表统计和告警功能。

## 功能特性

- ✅ 多逆变器数据聚合（电压、电流、功率、发电量）
- ✅ 电站效率 PR 值实时计算
- ✅ 实时数据仪表盘
- ✅ 日/月/年报表统计
- ✅ 功率下降告警（>20% 触发）
- ✅ Modbus 网关模拟器
- ✅ Docker 一键部署

## 技术栈

- **后端**: Go 1.21
- **消息队列**: Eclipse Mosquitto (MQTT)
- **时序数据库**: TimescaleDB (PostgreSQL 扩展)
- **Web框架**: Gin
- **前端**: HTML5 + Chart.js
- **部署**: Docker + Docker Compose

## 项目结构

```
.
├── cmd/
│   └── main.go              # 主程序入口
├── internal/
│   ├── api/                 # HTTP API 处理器
│   ├── config/              # 配置管理
│   ├── database/            # 数据库操作
│   ├── modbus/              # Modbus 模拟器
│   ├── mqtt/                # MQTT 客户端
│   ├── models/              # 数据模型
│   └── service/             # 业务逻辑服务
├── web/
│   ├── index.html           # 前端页面
│   └── static/
│       ├── css/style.css    # 样式文件
│       └── js/app.js        # 前端逻辑
├── config.yaml              # 配置文件
├── docker-compose.yml       # Docker 编排
├── Dockerfile               # 应用镜像
└── mosquitto.conf           # MQTT 配置
```

## 快速开始

### 使用 Docker Compose 部署

```bash
# 启动所有服务
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f pv-monitor
```

访问 http://localhost:8080 查看仪表盘。

### 本地开发

1. **安装依赖**

```bash
go mod download
```

2. **启动依赖服务**

```bash
# 启动 TimescaleDB 和 MQTT
docker-compose up -d timescaledb mqtt
```

3. **运行应用**

```bash
go run cmd/main.go
```

## API 接口

### 健康检查
```
GET /api/health
```

### 电站数据
```
GET /api/plant/summary      # 获取电站总览
GET /api/plant/history      # 获取历史数据 (?hours=24)
GET /api/plant/inverters    # 获取所有逆变器数据
```

### 报表统计
```
GET /api/reports/daily      # 日报表 (?date=2024-01-01)
GET /api/reports/monthly    # 月报表 (?year=2024&month=1)
GET /api/reports/yearly     # 年报表 (?year=2024)
```

### 告警管理
```
GET    /api/alarms                  # 获取活动告警
PUT    /api/alarms/:id/acknowledge  # 确认告警
```

## MQTT 数据格式

### 主题
```
pv/inverter/{inverter_id}/data
```

### 消息格式
```json
{
  "inverter_id": "INV001",
  "timestamp": "2024-01-01T12:00:00Z",
  "voltage": 600.5,
  "current": 25.3,
  "power": 15192.65,
  "energy": 125.5,
  "temperature": 45.2,
  "efficiency": 96.5
}
```

## PR 值计算说明

**PR (Performance Ratio)** 是衡量光伏电站发电效率的重要指标：

```
PR = 实际发电量 / (装机容量 × 辐照量 / 1000)
```

- 理论值范围: 0 ~ 1 (0% ~ 100%)
- 优秀电站: > 80%
- 一般电站: 70% ~ 80%
- 需改进: < 70%

## 配置说明

编辑 `config.yaml` 文件:

```yaml
server:
  port: 8080              # HTTP 服务端口

mqtt:
  broker: "tcp://mqtt:1883"
  topic: "pv/inverter/+/data"

database:
  host: timescaledb
  port: 5432
  user: postgres
  password: postgres
  dbname: pv_monitor

inverters:                  # 逆变器配置
  - id: "INV001"
    name: "逆变器1号"
    rated_power: 50000      # 额定功率 (W)

alarm:
  power_drop_threshold: 20  # 功率下降告警阈值 (%)
  check_interval: 60        # 检查间隔 (秒)

modbus:
  enabled: true             # 启用模拟器
  simulation_interval: 5    # 模拟间隔 (秒)
```

## 常见问题

### 1. 数据库初始化失败?
确保 TimescaleDB 扩展已正确安装。首次启动时，应用会自动创建超表和索引。

### 2. MQTT 连接失败?
检查 mosquitto 容器是否正常运行，确认端口 1883 未被占用。

### 3. 模拟器不发送数据?
检查配置文件中 `modbus.enabled` 是否设置为 `true`。

## 许可证

MIT License
