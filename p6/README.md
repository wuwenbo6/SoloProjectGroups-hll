# 泄漏电流监测系统

基于 Go + TimescaleDB 的泄漏电流传感器监测后端系统，支持实时数据采集、污秽等级计算、Modbus TCP 接口、实时预警和周期报告。

## 功能特性

- ✅ **传感器数据接收**: HTTP API 接收波形、峰值电流、脉冲计数
- ✅ **污秽等级计算**: 基于电流幅值和脉冲频次综合评估
- ✅ **智能降噪**: 中值滤波、高斯滤波消除噪声干扰，脉冲计数验证
- ✅ **环境修正**: 雨天/高湿度环境下数据自动修正，避免误报警
- ✅ **自适应阈值**: 基于历史数据动态调整报警阈值，支持季节性变化
- ✅ **实时推送**: WebSocket 实时推送数据和预警通知
- ✅ **周期报告**: 周/月统计报告生成
- ✅ **Modbus TCP**: 标准 Modbus TCP 接口供 SCADA 系统读取
- ✅ **前端展示**: 实时趋势图、波形图、预警信息展示

## 项目结构

```
.
├── cmd/
│   └── main.go              # 主入口
├── internal/
│   ├── api/
│   │   └── api.go           # HTTP API 路由和处理
│   ├── config/
│   │   └── config.go        # 配置管理
│   ├── database/
│   │   └── database.go      # 数据库操作
│   ├── models/
│   │   └── models.go        # 数据模型
│   ├── modbus/
│   │   └── server.go        # Modbus TCP 服务器
│   ├── pollution/
│   │   └── pollution.go     # 污秽等级计算（集成降噪和自适应）
│   ├── report/
│   │   └── report.go        # 周期报告生成
│   ├── signal/
│   │   ├── noise_filter.go  # 噪声滤波和脉冲验证
│   │   ├── environment.go   # 环境修正（雨天、季节）
│   │   └── adaptive_threshold.go # 自适应阈值算法
│   └── websocket/
│       └── websocket.go     # WebSocket 实时推送
├── web/
│   └── index.html           # 前端展示页面
├── config.yaml              # 配置文件
├── schema.sql               # 数据库初始化脚本
├── go.mod
└── README.md
```

## 快速开始

### 1. 数据库准备

安装 PostgreSQL 和 TimescaleDB 扩展：

```sql
CREATE DATABASE leakage_monitor;
\c leakage_monitor
\i schema.sql
```

### 2. 配置

修改 `config.yaml`:

```yaml
server:
  http_port: 8080
  modbus_port: 502

database:
  host: localhost
  port: 5432
  user: postgres
  password: your_password
  dbname: leakage_monitor
  sslmode: disable

pollution:
  level1_threshold: 1.0   # mA
  level2_threshold: 3.0   # mA
  level3_threshold: 5.0   # mA
  level4_threshold: 8.0   # mA
  frequency_window_minutes: 60
```

### 3. 运行

```bash
go mod tidy
go run cmd/main.go
```

### 4. 访问

- 前端页面: http://localhost:8080
- API 文档: 见下方 API 说明

## API 接口

### 传感器数据上报

```
POST /api/data
Content-Type: application/json

{
  "sensor_id": "S001",
  "peak_current": 2.5,
  "pulse_count": 10,
  "waveform_data": [0.1, 0.5, 1.2, ...]
}
```

### 获取传感器数据

```
GET /api/data/:sensorId?limit=100
```

### 获取传感器列表

```
GET /api/sensors
```

### 获取预警信息

```
GET /api/alerts/:sensorId?limit=50
```

### 周报告

```
GET /api/report/:sensorId/weekly
```

### 月报告

```
GET /api/report/:sensorId/monthly
```

## Modbus TCP 寄存器映射

| 寄存器地址 | 说明               | 单位     |
|------------|--------------------|----------|
| 0          | 峰值电流           | mA * 100 |
| 1          | 脉冲计数           | 次       |
| 2          | 污秽等级           | -        |

每个传感器占用 100 个寄存器空间：
- 传感器 1: 0-99
- 传感器 2: 100-199
- 传感器 3: 200-299
- ...

## 污秽等级定义

| 等级 | 名称   | 基准阈值 | 说明                     |
|------|--------|----------|--------------------------|
| 0    | 正常   | < 1mA    | 正常运行                 |
| 1    | 轻微   | 1-3mA    | 关注，常规巡检           |
| 2    | 中度   | 3-5mA    | 预警，增加监测频次       |
| 3    | 严重   | 5-8mA    | 警报，安排计划检修       |
| 4    | 危急   | >= 8mA   | 立即处理，停运检查       |

**动态调整因素：**
- 脉冲频次：高频脉冲提升等级
- 环境修正：雨天/高湿度时降低等级
- 自适应：基于历史数据动态调整阈值

## 技术栈

- **语言**: Go 1.21+
- **Web框架**: Gin
- **数据库**: PostgreSQL + TimescaleDB
- **ORM**: sqlx
- **WebSocket**: Gorilla WebSocket
- **Modbus**: 原生实现
- **前端**: Chart.js
