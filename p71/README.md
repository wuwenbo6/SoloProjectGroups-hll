# AI 动作识别训练系统

基于 MediaPipe + 3D CNN 的实时动作识别 Web 应用。

## 功能特性

- 🎯 **实时骨架提取**：使用 MediaPipe Pose 提取 33 个人体关键点
- 🧠 **智能动作识别**：基于 3D CNN 模型识别深蹲、俯卧撑等动作
- 📊 **动作计数**：实时统计各类动作完成次数
- 📝 **训练日志**：SQLite 数据库存储历史训练记录
- 📈 **数据可视化**：训练趋势和统计图表

## 技术栈

### 前端
- React 18 + TypeScript
- Vite
- TailwindCSS
- MediaPipe Pose
- Zustand (状态管理)
- Recharts (图表)

### 后端
- FastAPI
- SQLAlchemy + SQLite
- NumPy
- WebSocket 支持

## 快速开始

### 后端服务

```bash
cd backend

# 创建虚拟环境
python3 -m venv venv
source venv/bin/activate  # macOS/Linux

# 安装依赖
pip install -r requirements.txt

# 启动服务
python main.py
```

后端服务将运行在 http://localhost:8000

API 文档: http://localhost:8000/docs

### 前端应用

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

前端应用将运行在 http://localhost:3000

## 项目结构

```
p71/
├── frontend/                # 前端应用
│   ├── src/
│   │   ├── components/     # UI 组件
│   │   ├── hooks/          # 自定义 Hooks
│   │   ├── pages/          # 页面组件
│   │   ├── store/          # 状态管理
│   │   ├── types/          # 类型定义
│   │   └── main.tsx        # 入口文件
│   └── package.json
├── backend/                 # 后端服务
│   ├── app/
│   │   ├── api/            # API 路由
│   │   ├── models/         # 数据库模型
│   │   ├── schemas/        # Pydantic 模型
│   │   └── services/       # 业务逻辑
│   ├── models/             # ML 模型
│   └── main.py
└── README.md
```

## API 接口

### 训练日志

- `GET /api/training` - 获取所有训练记录
- `POST /api/training` - 保存训练记录
- `GET /api/training/{id}` - 获取单条记录
- `DELETE /api/training/{id}` - 删除记录

### 动作识别

- `POST /api/recognize` - 识别动作序列
- `POST /api/recognize/reset` - 重置计数
- `WS /api/recognize/ws` - WebSocket 实时识别

## 支持的动作

- 🏋️ 深蹲 (Squat)
- 💪 俯卧撑 (Pushup)
- 🧍 站立 (Stand)

## 关键点说明

MediaPipe Pose 提取 33 个人体关键点：

- 0-10: 面部关键点
- 11-22: 躯干和手臂关键点
- 23-32: 腿部关键点

## 许可证

MIT License
