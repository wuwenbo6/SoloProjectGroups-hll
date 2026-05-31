# Lennard-Jones 流体全栈模拟应用

基于 OpenMM + Three.js 的分子动力学实时模拟可视化平台。

## 功能特性

- 🔬 **后端分子模拟**: 使用 OpenMM 进行 Lennard-Jones 流体的分子动力学模拟
- 🎨 **3D 可视化**: Three.js 实时渲染原子运动（球体表示）
- 🌡️ **实时参数调节**: 温度、压力、力场参数（ε/σ）实时调整
- 🖱️ **拖拽调节**: 滑动条实时控制力场参数
- 💾 **数据库存储**: SQLite 保存模拟参数配置
- ⚡ **WebSocket 通信**: 毫秒级实时数据同步
- 📊 **实时统计**: 势能、动能、总能量实时显示

## 项目结构

```
p9/
├── backend/
│   ├── app.py          # Flask API + WebSocket 服务器
│   ├── simulation.py   # OpenMM 分子模拟核心
│   ├── database.py     # SQLite 数据库操作
│   └── requirements.txt
└── frontend/
    ├── index.html      # UI 界面
    └── app.js          # Three.js + WebSocket 客户端
```

## 快速开始

### 1. 安装后端依赖

```bash
cd backend
pip install -r requirements.txt
```

### 2. 启动后端服务器

```bash
cd backend
python app.py
```

服务器将在 `http://localhost:5000` 启动。

### 3. 访问应用

在浏览器中打开:
```
http://localhost:5000
```

## 使用说明

### 模拟控制

1. **初始化模拟**: 设置粒子数量后点击初始化
2. **开始模拟**: 启动分子动力学模拟
3. **停止模拟**: 暂停模拟
4. **重置模拟**: 重置到初始状态

### 参数调节

- **温度 (50-1000 K)**: 调节系统温度，影响粒子运动速度
- **压力 (0.1-100 bar)**: 调节系统压力
- **ε (0.1-10 kJ/mol)**: Lennard-Jones 势阱深度，控制粒子间吸引力
- **σ (0.1-1 nm)**: 粒子直径，控制粒子大小和排斥作用

### 配置管理

- 保存当前参数配置到数据库
- 加载已保存的配置
- 删除不需要的配置

### 3D 视图操作

- **左键拖动**: 旋转视角
- **滚轮**: 缩放视图

## API 接口

### REST API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/init` | 初始化模拟 |
| POST | `/api/start` | 开始模拟 |
| POST | `/api/stop` | 停止模拟 |
| POST | `/api/reset` | 重置模拟 |
| GET | `/api/state` | 获取当前状态 |
| POST | `/api/parameters` | 更新参数 |
| GET | `/api/configs` | 获取所有配置 |
| POST | `/api/configs` | 保存配置 |
| POST | `/api/configs/:id/load` | 加载配置 |

### WebSocket

- 连接后自动接收 `simulation_state` 事件，实时获取模拟状态数据

## 技术栈

**后端:**
- Python 3.8+
- OpenMM 8.1.1 - 分子动力学模拟引擎
- Flask 3.0 - Web 框架
- Flask-SocketIO - WebSocket 支持
- SQLite - 配置存储

**前端:**
- Three.js r128 - 3D 渲染
- Socket.IO 4.x - WebSocket 客户端
- 原生 JavaScript + CSS3
