# SAS Backplane LED Management System

SAS背板LED管理与温度监控系统，通过CLI工具控制SAS硬盘背板的LED指示灯（定位灯/错误灯/活动灯），读取enclosure温度传感器数据，并提供Web界面实时展示硬盘槽位状态。

## 功能特性

- **LED灯控制**：独立控制每个槽位的定位灯、错误灯、活动灯
- **槽位状态监控**：实时显示所有硬盘槽位的状态
- **温度监控**：读取enclosure温度传感器，支持告警阈值
- **Web界面**：现代化深色主题，可视化硬盘槽位状态
- **自动刷新**：支持配置自动刷新间隔
- **模拟模式**：无需真实硬件即可测试和演示

## 技术栈

### 后端
- Python 3.9+
- Flask 3.x - Web框架
- Flask-CORS - 跨域支持
- sg3_utils (sg_ses) - SAS设备管理

### 前端
- React 18 + TypeScript
- Vite - 构建工具
- TailwindCSS 3.x - CSS框架
- Zustand - 状态管理
- Lucide React - 图标库

## 项目结构

```
p228/
├── backend/
│   ├── cli/
│   │   ├── __init__.py
│   │   ├── ses_cli.py          # sg_ses 命令封装
│   │   └── parser.py           # 输出解析器
│   ├── api/
│   │   ├── __init__.py
│   │   ├── app.py              # Flask 应用
│   │   └── routes.py           # API 路由
│   ├── requirements.txt
│   ├── config.py
│   └── run.py                  # 启动入口
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Header.tsx
│   │   │   ├── SlotGrid.tsx
│   │   │   ├── SlotCard.tsx
│   │   │   ├── TempPanel.tsx
│   │   │   ├── ControlPanel.tsx
│   │   │   └── StatCards.tsx
│   │   ├── hooks/
│   │   │   └── useApi.ts
│   │   ├── store/
│   │   │   └── index.ts
│   │   ├── types/
│   │   │   └── index.ts
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
└── README.md
```

## 快速开始

### 环境要求

- Python 3.9+
- Node.js 18+
- sg3_utils (Linux系统需要安装：`sudo apt install sg3-utils` 或 `sudo yum install sg3_utils`)

### 安装后端依赖

```bash
cd backend
pip install -r requirements.txt
```

### 启动后端服务

```bash
cd backend
SIMULATION_MODE=true python run.py
```

或使用真实硬件：

```bash
cd backend
ENCLOSURE_DEVICES=/dev/sg1 python run.py
```

服务将在 http://localhost:5000 启动

### 安装前端依赖

```bash
cd frontend
npm install
```

### 启动前端开发服务器

```bash
cd frontend
npm run dev
```

前端开发服务器将在 http://localhost:5173 启动

## API 文档

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| GET | `/api/enclosures` | 获取enclosure列表 |
| GET | `/api/status` | 获取完整系统状态 |
| GET | `/api/slots` | 获取所有槽位状态 |
| GET | `/api/slots/{slot}` | 获取单个槽位状态 |
| POST | `/api/led/{slot}/{type}/{action}` | 控制LED灯 |
| GET | `/api/temperature` | 获取温度传感器数据 |

### LED控制参数

- `slot`: 槽位号 (1-based)
- `type`: LED类型 - `locate` (定位灯), `fault` (错误灯), `active` (活动灯)
- `action`: 操作 - `on` (开启), `off` (关闭)

示例：
```bash
# 开启3号槽位的定位灯
curl -X POST http://localhost:5000/api/led/3/locate/on

# 关闭5号槽位的错误灯
curl -X POST http://localhost:5000/api/led/5/fault/off
```

## 配置选项

环境变量：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `ENCLOSURE_DEVICES` | `/dev/sg1` | enclosure设备路径，多个用逗号分隔 |
| `SIMULATION_MODE` | `auto` | 模拟模式 - `auto`, `true`, `false` |
| `TEMP_WARNING_THRESHOLD` | `45` | 温度告警阈值 (°C) |
| `TEMP_CRITICAL_THRESHOLD` | `55` | 温度临界阈值 (°C) |
| `DEFAULT_POLL_INTERVAL` | `5` | 默认轮询间隔 (秒) |
| `SIMULATED_SLOT_COUNT` | `24` | 模拟模式槽位数量 |
| `API_HOST` | `0.0.0.0` | API监听地址 |
| `API_PORT` | `5000` | API监听端口 |
| `API_DEBUG` | `False` | Flask debug模式 |

## 构建生产版本

### 前端构建

```bash
cd frontend
npm run build
```

构建产物将输出到 `frontend/dist` 目录。

### 部署

可以将前端构建产物放置在Flask应用的静态目录中，实现单服务部署：

```bash
cp -r frontend/dist/* backend/static/
```

然后启动后端服务即可同时提供前端页面和API。

## CLI 工具使用

可以直接使用CLI类进行编程：

```python
from cli import SesCli

# 创建CLI实例
cli = SesCli('/dev/sg1')

# 获取槽位状态
slots = cli.get_slot_status()
for slot in slots:
    print(f"Slot {slot['slot']}: locate={slot['locate']}, fault={slot['fault']}")

# 开启定位灯
cli.set_led(3, 'locate', 'on')

# 获取温度
temps = cli.get_temperature()
for temp in temps:
    print(f"{temp['name']}: {temp['current']}°C")
```

## License

MIT
