# 金属凝固枝晶生长相场模拟器

一个全栈应用，基于相场模型（Phase Field Model）模拟金属凝固过程中的枝晶生长，使用Three.js进行3D可视化。

## 技术栈

### 后端
- **Python 3.11+**
- **FastAPI** - Web框架
- **NumPy/SciPy** - PDE数值求解
- **SQLAlchemy** - ORM
- **SQLite** - 数据库
- **WebSocket** - 实时通信

### 前端
- **React 18** + **TypeScript**
- **Vite** - 构建工具
- **Three.js** + **React Three Fiber** - 3D渲染
- **TailwindCSS** - 样式
- **Zustand** - 状态管理
- **Recharts** - 图表

## 项目结构

```
p108/
├── backend/
│   ├── app/
│   │   ├── api/           # API路由
│   │   ├── core/          # 配置、数据库
│   │   ├── models/        # 数据模型
│   │   ├── schemas/       # Pydantic模式
│   │   ├── services/      # 业务逻辑（求解器、模拟服务）
│   │   └── main.py        # 应用入口
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── components/    # React组件
    │   ├── store/         # Zustand状态
    │   ├── types/         # TypeScript类型
    │   ├── utils/         # 工具函数
    │   ├── hooks/         # 自定义hooks
    │   └── main.tsx
    └── package.json
```

## 快速开始

### 1. 启动后端

```bash
cd backend

# 创建虚拟环境
python -m venv venv
source venv/bin/activate  # macOS/Linux
# 或 venv\Scripts\activate  # Windows

# 安装依赖
pip install -r requirements.txt

# 启动服务
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

后端API文档: http://localhost:8000/docs

### 2. 启动前端

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

前端地址: http://localhost:5173

## 功能特性

### 模拟参数
- **过冷度 (ΔT)**: 0.1 - 2.0 K，控制生长驱动力
- **各向异性强度**: 0.0 - 0.1，控制枝晶的方向性
- **各向异性模式**: 立方体(4重对称) / 八面体(6重对称)
- **界面宽度**: 1.0 - 5.0
- **界面迁移率**: 0.1 - 2.0

### 3D可视化
- 实时显示枝晶生长形态
- 支持拖拽旋转、滚轮缩放
- 发光效果和泛光后处理
- 颜色编码显示相场值

### 数据管理
- 保存参数配置到数据库
- 加载历史配置
- 实时显示自由能变化曲线

## 相场模型

基于Kobayashi枝晶生长模型，求解Allen-Cahn方程：

$$\tau \frac{\partial \phi}{\partial t} = \nabla \cdot (\epsilon^2 \nabla \phi) + \phi(1-\phi)(\phi-0.5+m(T))$$

其中：
- $\phi$ 为相场序参数（0=液相，1=固相）
- $\epsilon$ 为界面能参数（含各向异性）
- $m(T)$ 为温度相关的驱动力项
- 温度场耦合潜热释放

## API接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/health | 健康检查 |
| GET | /api/parameters | 获取所有参数配置 |
| POST | /api/parameters | 保存参数配置 |
| DELETE | /api/parameters/:id | 删除参数配置 |
| WS | /ws/simulate | WebSocket模拟连接 |

## 许可证

MIT License
