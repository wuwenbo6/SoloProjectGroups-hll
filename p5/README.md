# 弈智围棋 - 智能围棋对战平台

## 功能特性

- 🎮 **双人对战**：本地双人轮流落子
- 🤖 **AI对战**：基于简化KataGo引擎，三档难度可选
- 📊 **实时分析**：胜率曲线、AI推荐点
- 🗣️ **语音解说**：实时播报胜率变化和推荐落子
- 📝 **棋谱记录**：自动保存对局到数据库
- 🔥 **热点图分析**：可视化落子热点分布

## 技术栈

### 前端
- React 18 + TypeScript
- Vite + TailwindCSS
- Zustand 状态管理
- Recharts 图表库
- WebSocket 实时通信
- Web Speech API 语音合成

### 后端
- Python + FastAPI
- WebSocket 支持
- SQLite 数据库
- 简化版KataGo AI引擎

## 快速开始

### 启动后端服务

```bash
cd backend
chmod +x start.sh
./start.sh
```

或手动安装：

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py
```

后端服务将在 `http://localhost:8000` 启动

### 启动前端开发服务器

```bash
npm install
npm run dev
```

前端服务将在 `http://localhost:5173`

## API 接口

- `GET /api/records` - 获取棋谱列表
- `POST /api/records` - 保存棋谱
- `GET /api/records/{id}` - 获取单条棋谱
- `GET /api/records/{id}/heatmap` - 获取热点图数据
- `WebSocket /ws/game` - 实时对弈连接

## 项目结构

```
├── backend/
│   ├── main.py              # FastAPI主入口
│   ├── requirements.txt     # Python依赖
│   └── app/
│       ├── database.py      # 数据库操作
│       ├── game_logic.py    # 围棋规则逻辑
│       └── ai_engine.py     # AI引擎
├── src/
│   ├── components/
│   │   └── GoBoard.tsx      # Canvas棋盘组件
│   ├── pages/
│   │   ├── Home.tsx         # 首页/大厅
│   │   ├── Game.tsx         # 对弈页面
│   │   └── Records.tsx      # 棋谱记录
│   ├── store/
│   │   └── gameStore.ts     # Zustand状态管理
│   ├── hooks/
│   │   ├── useWebSocket.ts  # WebSocket hook
│   │   └── useSpeech.ts     # 语音合成hook
│   └── App.tsx
└── package.json
```

## 使用说明

1. 启动后端服务
2. 启动前端开发服务器
3. 访问 `http://localhost:5173`
4. 选择对战模式和棋盘大小
5. 开始对弈！

## 注意事项

- AI引擎为简化版KataGo，使用策略评估算法
- 语音合成需要浏览器支持Web Speech API（推荐使用Chrome/Edge）
- 棋谱数据保存在 `backend/go_game.db` SQLite数据库中
