# 智能药盒管理系统

基于 Python + MQTT + Vue3 的智能药盒系统，支持多用户多药盒管理。

## 功能特性

- **MQTT 传感器数据接收**：支持霍尔传感器（开盖检测）和红外传感器（取药检测）
- **多用户管理**：支持老人/多人使用不同药盒
- **用药计划管理**：可配置服药时间、剂量、重复周期
- **服药记录追踪**：自动记录每次服药情况
- **微信推送**：未按时服药时推送微信提醒
- **可视化界面**：Vue3 + Element Plus 管理后台

## 项目结构

```
p59/
├── backend/                 # Python 后端
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py         # FastAPI 主程序
│   │   ├── models.py       # 数据库模型
│   │   ├── schemas.py      # Pydantic 模型
│   │   ├── database.py     # 数据库配置
│   │   ├── mqtt_client.py  # MQTT 客户端
│   │   ├── wechat.py       # 微信推送
│   │   └── scheduler.py    # 定时任务
│   ├── requirements.txt
│   ├── .env.example
│   ├── test_mqtt.py        # MQTT 测试脚本
│   └── start.sh
└── frontend/               # Vue3 前端
    ├── src/
    │   ├── views/          # 页面组件
    │   ├── router/         # 路由配置
    │   ├── api/            # API 接口
    │   ├── App.vue
    │   └── main.js
    ├── package.json
    ├── vite.config.js
    └── start.sh
```

## 快速开始

### 1. 启动后端

```bash
cd backend
chmod +x start.sh
./start.sh
```

或者手动执行：

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env  # 编辑配置
cd app && uvicorn main:app --reload
```

后端服务将在 `http://localhost:8000` 启动，API 文档：`http://localhost:8000/docs`

### 2. 启动前端

```bash
cd frontend
chmod +x start.sh
./start.sh
```

或者手动执行：

```bash
cd frontend
npm install
npm run dev
```

前端服务将在 `http://localhost:3000` 启动

### 3. 启动 MQTT Broker

需要本地运行 MQTT broker（如 Mosquitto）：

```bash
# macOS
brew install mosquitto
mosquitto
```

## MQTT 主题格式

传感器数据通过 MQTT 发布，主题格式：

```
smart_pillbox/{device_id}/{sensor_type}
```

**示例：**

- 霍尔传感器（开盖检测）：`smart_pillbox/pillbox_001/hall`
  - `value: 1` 表示开盖
  - `value: 0` 表示关盖

- 红外传感器（取药检测）：`smart_pillbox/pillbox_001/ir`
  - `value: 0` 表示检测到取药（红外被阻断）
  - `value: 1` 表示未取药

## 测试模拟数据

运行测试脚本模拟传感器数据：

```bash
cd backend
python test_mqtt.py
```

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/users/` | 获取用户列表 |
| POST | `/users/` | 创建用户 |
| GET | `/pillboxes/` | 获取药盒列表 |
| POST | `/pillboxes/` | 添加药盒 |
| GET | `/plans/` | 获取用药计划 |
| POST | `/plans/` | 创建用药计划 |
| PUT | `/plans/{id}` | 更新用药计划 |
| DELETE | `/plans/{id}` | 删除用药计划 |
| GET | `/records/` | 获取服药记录 |
| GET | `/sensor-logs/` | 获取传感器日志 |

## 配置说明

在 `backend/.env` 中配置：

```env
MQTT_BROKER=localhost      # MQTT 服务器地址
MQTT_PORT=1883             # MQTT 端口
MQTT_TOPIC=smart_pillbox/# # 订阅主题
DATABASE_URL=sqlite:///./pillbox.db
WECHAT_APPID=your_appid    # 微信公众号 AppID
WECHAT_APPSECRET=your_appsecret
WECHAT_TEMPLATE_ID=your_template_id  # 消息模板ID
```

## 微信推送配置

1. 在微信公众平台申请测试号
2. 获取 AppID 和 AppSecret
3. 创建消息模板
4. 用户关注后获取 openid
5. 在用户管理中配置 openid

## 定时任务说明

系统自动运行以下定时任务：

- **每天 00:01**：创建当天的服药记录
- **每 1 分钟**：检查即将到时间的服药，发送提醒
- **每 5 分钟**：检查漏服情况，发送漏服提醒

## 技术栈

**后端：**
- FastAPI - Web 框架
- SQLAlchemy - ORM
- Paho MQTT - MQTT 客户端
- APScheduler - 定时任务
- SQLite - 数据库（可切换为 MySQL/PostgreSQL）

**前端：**
- Vue 3
- Element Plus - UI 组件库
- Vue Router - 路由
- Axios - HTTP 客户端
- Vite - 构建工具
