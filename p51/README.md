# IoT 传感器监控系统

## 项目架构

```
p51/
├── cmd/
│   ├── server/          # 主服务
│   └── simulator/       # 传感器模拟器
├── internal/
│   ├── config/          # 配置
│   ├── models/          # 数据模型
│   ├── database/        # 数据库
│   ├── mqtt/            # MQTT客户端
│   ├── alert/           # 告警引擎
│   └── api/             # HTTP API
├── web/
│   └── templates/       # 前端页面
├── config.yaml          # 配置文件
└── go.mod
```

## 功能特性

1. **MQTT数据接收** - 监听LoRa网关上传的传感器数据
2. **多传感器支持** - 倾角仪、振动、雨量
3. **异常检测** - 倾角变化>0.5°或振动超过阈值
4. **实时监控** - 前端地图显示设备位置
5. **告警通知** - 短信/邮件通知
6. **历史数据** - SQLite存储

## 快速开始

```bash
# 安装依赖
go mod tidy

# 启动MQTT broker (需先安装mosquitto或使用公共broker)
# 修改config.yaml中的broker地址

# 运行服务
go run cmd/server/main.go

# 运行模拟器
go run cmd/simulator/main.go

# 访问前端
open http://localhost:8080
```

## API接口

- `GET /api/devices` - 设备列表
- `GET /api/data` - 传感器数据
- `GET /api/alerts` - 告警列表
- `GET /api/overview` - 系统概览
