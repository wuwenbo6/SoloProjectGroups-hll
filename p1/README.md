# 液位监测系统

基于 Python + FastAPI + InfluxDB + Vue3 的超声波液位监测系统，支持多储罐管理、温度补偿计算、历史趋势查询和异常报警。

## 功能特性

- ✅ **多储罐管理**: 支持创建、编辑、删除多个储罐
- ✅ **温度补偿**: 根据环境温度自动校正声速，提高液位测量精度
- ✅ **实时数据**: WebSocket 实时推送液位状态
- ✅ **历史趋势**: 基于 InfluxDB 的时序数据存储和查询
- ✅ **波形显示**: 超声波回波波形可视化
- ✅ **异常报警**: 支持微信/钉钉 Webhook 报警
- ✅ **模拟数据**: 内置传感器数据模拟器，便于测试

## 技术栈

### 后端
- Python 3.11+
- FastAPI - Web 框架
- InfluxDB 2.7 - 时序数据库
- Pydantic - 数据验证
- httpx - 异步 HTTP 客户端

### 前端
- Vue 3 + Composition API
- ECharts + vue-echarts - 图表库
- Axios - HTTP 客户端
- Vite - 构建工具

## 项目结构

```
.
├── backend/                 # 后端服务
│   ├── app/
│   │   ├── api/            # API 路由
│   │   │   ├── tanks.py    # 储罐管理
│   │   │   ├── sensor.py   # 传感器数据
│   │   │   └── trends.py   # 趋势数据
│   │   ├── database/       # 数据库
│   │   │   └── influxdb.py
│   │   ├── models/         # 数据模型
│   │   ├── services/       # 业务逻辑
│   │   ├── utils/          # 工具函数
│   │   ├── config.py       # 配置
│   │   └── main.py         # 应用入口
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── frontend/               # 前端应用
│   ├── src/
│   │   ├── App.vue         # 主组件
│   │   ├── main.js         # 入口
│   │   └── style.css       # 样式
│   ├── package.json
│   └── vite.config.js
├── docker-compose.yml      # Docker 编排
└── README.md
```

## 快速开始

### 方式一：Docker Compose（推荐）

```bash
# 启动所有服务
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f
```

访问地址：
- 前端: http://localhost:3000 (需要单独启动)
- 后端 API: http://localhost:8000
- API 文档: http://localhost:8000/docs
- InfluxDB: http://localhost:8086 (admin/admin123456)

### 方式二：手动启动

#### 1. 启动 InfluxDB

```bash
docker run -d \
  --name influxdb \
  -p 8086:8086 \
  -e DOCKER_INFLUXDB_INIT_MODE=setup \
  -e DOCKER_INFLUXDB_INIT_USERNAME=admin \
  -e DOCKER_INFLUXDB_INIT_PASSWORD=admin123456 \
  -e DOCKER_INFLUXDB_INIT_ORG=liquid-level-org \
  -e DOCKER_INFLUXDB_INIT_BUCKET=liquid-level-bucket \
  -e DOCKER_INFLUXDB_INIT_ADMIN_TOKEN=liquid-level-token \
  influxdb:2.7
```

#### 2. 启动后端

```bash
cd backend

# 创建虚拟环境
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt

# 复制环境变量配置
cp .env.example .env

# 启动服务
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

#### 3. 启动前端

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

## API 文档

### 储罐管理

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/tanks` | 获取所有储罐 |
| GET | `/api/tanks/{id}` | 获取单个储罐 |
| POST | `/api/tanks` | 创建储罐 |
| PUT | `/api/tanks/{id}` | 更新储罐 |
| DELETE | `/api/tanks/{id}` | 删除储罐 |

### 传感器数据

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/sensor/data` | 接收传感器数据 |
| GET | `/api/sensor/waveform/{tank_id}` | 获取最新波形 |
| GET | `/api/sensor/simulate/{tank_id}` | 模拟传感器数据 |

### 趋势数据

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/trends/{tank_id}` | 获取历史趋势数据 |
| GET | `/api/trends/{tank_id}/recent` | 获取最近数据 |

### WebSocket

- 实时状态推送: `ws://localhost:8000/ws/realtime`

## 温度补偿算法

### 声速计算

```
v = 331.3 * sqrt(1 + T / 273.15)
```

- `v`: 声速 (m/s)
- `T`: 温度 (°C)

### 距离计算

```
distance = (v * echo_time) / 2
```

### 液位计算

```
level = sensor_height - distance
```

## 报警配置

在 `backend/.env` 中配置：

```env
# 企业微信
ALERT_TYPE=wechat
ALERT_WEBHOOK_URL=https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx

# 钉钉
ALERT_TYPE=dingtalk
ALERT_WEBHOOK_URL=https://oapi.dingtalk.com/robot/send?access_token=xxx
```

## 传感器对接

### 请求示例

```python
import requests

data = {
    "tank_id": "tank-uuid",
    "echo_time": 0.0058,      # 回波时间（秒）
    "temperature": 25.0,       # 环境温度
    "waveform": [0.1, 0.3, ...]  # 可选，波形数据
}

response = requests.post("http://localhost:8000/api/sensor/data", json=data)
```

## 开发说明

### 后端测试

```bash
# 模拟数据生成
curl http://localhost:8000/api/sensor/simulate/{tank_id}

# 查看 API 文档
open http://localhost:8000/docs
```

### 前端开发

```bash
cd frontend
npm run dev    # 开发模式
npm run build  # 生产构建
```

## License

MIT
