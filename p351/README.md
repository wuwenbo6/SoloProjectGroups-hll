# PostgreSQL 逻辑复制模拟器

一个用于模拟PostgreSQL逻辑复制机制的Web应用，实现发布-订阅模式，并在主键冲突时按时间戳保留最新记录。

## 功能特性

- **发布-订阅复制**：模拟Publisher和Subscriber之间的逻辑复制
- **WAL日志流**：展示数据变更的WAL事件流
- **冲突检测与解决**：主键冲突时自动按时间戳保留最新记录
- **实时监控**：WebSocket实时推送状态更新
- **可视化面板**：
  - 冲突计数统计（总冲突数、保留传入数、保留本地数）
  - 饼图展示冲突解决分布
  - 详细的冲突解决日志
  - 发布端/订阅端数据对比展示
- **自动模拟**：可配置间隔和冲突率的自动数据生成

## 技术栈

### 后端
- Python 3.9+
- Flask (Web框架)
- Flask-SocketIO (WebSocket实时通信)
- 内存数据存储（无需真实PostgreSQL）

### 前端
- React 18 + TypeScript
- Vite (构建工具)
- Tailwind CSS (样式)
- Zustand (状态管理)
- Recharts (图表)
- Socket.IO Client (实时通信)
- Lucide React (图标)

## 项目结构

```
p351/
├── backend/                    # Python后端代码
│   ├── __init__.py
│   ├── models.py              # 数据模型定义
│   ├── conflict_resolver.py   # 冲突解决策略
│   ├── publisher.py           # 发布端逻辑
│   ├── subscriber.py          # 订阅端逻辑
│   ├── simulator.py           # 模拟器引擎
│   └── app.py                 # Flask应用与API
├── src/                        # 前端代码
│   ├── components/
│   │   ├── ControlPanel.tsx   # 控制面板
│   │   ├── DataTable.tsx      # 数据表组件
│   │   ├── ConflictPanel.tsx  # 冲突监控面板
│   │   └── WALLog.tsx         # WAL日志组件
│   ├── store/
│   │   └── useSimStore.ts     # Zustand状态管理
│   ├── types/
│   │   └── index.ts           # TypeScript类型定义
│   ├── pages/
│   │   └── Home.tsx           # 主页面
│   └── App.tsx
├── run.py                     # 后端启动脚本
├── test_backend.py            # 后端测试脚本
├── requirements.txt           # Python依赖
└── package.json               # Node.js依赖
```

## 快速开始

### 1. 安装Python依赖

```bash
pip install -r requirements.txt
```

### 2. 安装Node.js依赖

```bash
npm install
```

### 3. 启动后端服务

```bash
python3 run.py
# 默认端口 5001
```

### 4. 启动前端开发服务器

```bash
npm run dev
# 默认端口 5173
```

### 5. 访问应用

打开浏览器访问 http://localhost:5173

## API接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/state` | 获取当前模拟状态 |
| GET | `/api/conflicts` | 获取冲突统计 |
| POST | `/api/insert` | 向Publisher插入数据 |
| POST | `/api/update` | 更新Publisher数据 |
| POST | `/api/upsert` | 更新或插入数据 |
| POST | `/api/trigger-conflict` | 手动触发冲突 |
| POST | `/api/simulate` | 开始/停止自动模拟 |
| POST | `/api/reset` | 重置模拟器 |

## 核心算法

### 冲突解决策略

```python
class TimestampConflictResolver:
    def resolve(self, incoming, existing):
        if incoming.timestamp > existing.timestamp:
            return incoming, "保留传入记录：时间戳更新"
        return existing, "保留本地记录：时间戳更新或相等"
```

当主键冲突发生时：
1. 比较传入记录和本地记录的时间戳
2. 保留时间戳较新的记录
3. 记录冲突日志，包含冲突详情和解决原因

## 测试

运行后端测试：

```bash
python3 test_backend.py
```

测试覆盖：
- 数据模型验证
- 冲突解决器验证
- Publisher功能
- Subscriber功能
- Simulator集成测试
- 端到端流程测试

## 架构设计

```
┌─────────────────┐     WAL Events     ┌─────────────────┐
│   Publisher     │ ─────────────────> │   Subscriber    │
│  (发布端)       │                    │   (订阅端)      │
└─────────────────┘                    └─────────────────┘
          │                                     │
          │                                     ▼
          │                          ┌─────────────────┐
          │                          │ ConflictResolver│
          │                          │  (冲突解决器)    │
          │                          └─────────────────┘
          │                                     │
          ▼                                     ▼
┌─────────────────────────────────────────────────────────┐
│                    Flask API / WebSocket                │
└─────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────┐
│                React Dashboard (前端界面)               │
└─────────────────────────────────────────────────────────┘
```

## 界面功能

### 控制面板
- 手动插入/更新记录
- 手动触发冲突
- 自动模拟控制（间隔、冲突率可调）
- 重置功能

### 数据展示区
- 发布端数据表（蓝色标识）
- 订阅端数据表（绿色标识）
- 数据不一致行高亮显示

### 冲突监控面板
- 实时冲突计数统计
- 饼图展示冲突解决分布
- 冲突解决日志列表（包含时间戳对比）

### WAL日志区
- 实时WAL事件流
- 事件类型彩色标识（INSERT/UPDATE/DELETE）
- 自动滚动/暂停功能
