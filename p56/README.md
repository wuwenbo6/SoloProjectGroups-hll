# 🚗 无人车仿真系统

多智能体无人车协同仿真系统，支持DDS通信、冲突消解、ROS2桥接和3D可视化。

## ✨ 功能特性

- **🚙 DDS无人车节点**：多台无人车实时发布定位信息和规划路径
- **🔄 中央融合节点**：实时冲突检测与智能消解算法
- **🔗 DDS-ROS2桥接**：支持与ROS2系统无缝对接
- **🗄️ 事件数据库**：SQLite记录所有车辆状态、冲突和消解事件
- **🎮 Three.js可视化**：3D实时显示多车同步运动、路径、冲突警报
- **📊 实时监控面板**：系统统计、车辆状态、事件日志

## 📁 项目结构

```
p56/
├── src/
│   ├── dds_nodes/              # DDS节点模块
│   │   ├── idl/               # 数据类型定义
│   │   ├── vehicle_node.py    # 无人车DDS发布者
│   │   └── fusion_node.py     # 中央融合/冲突消解
│   ├── ros2_bridge/           # ROS2桥接模块
│   │   └── dds_ros2_bridge.py
│   ├── database/              # 数据库模块
│   │   └── event_logger.py
│   └── server/                # 后端服务器
│       └── main.py           # FastAPI + WebSocket服务
├── frontend/                  # 前端可视化
│   ├── index.html
│   └── main.js               # Three.js可视化
├── scripts/                   # 启动脚本
├── config/                    # 配置文件
├── requirements.txt           # Python依赖
└── package.json              # Node.js依赖
```

## 🚀 快速开始

### 方式一：一键启动（推荐）

```bash
chmod +x scripts/*.sh
./scripts/start_all.sh
```

### 方式二：分别启动

**后端服务：**
```bash
chmod +x scripts/start_backend.sh
./scripts/start_backend.sh
```

**前端开发服务：**
```bash
chmod +x scripts/start_frontend.sh
./scripts/start_frontend.sh
```

### 访问系统

打开浏览器访问：`http://localhost:8000`

## 🎛️ 操作说明

### 3D视图控制
- **鼠标左键拖动**：旋转视角
- **鼠标滚轮**：缩放视图
- **鼠标右键拖动**：平移视图

### 侧边栏面板
- **系统统计**：活跃车辆数、冲突总数、严重冲突数
- **车辆状态**：每辆车的实时位置和速度
- **冲突警报**：最近的冲突警告（红色=严重，橙色=警告）
- **事件日志**：系统事件记录
- **ROS2桥接**：可开关DDS-ROS2桥接功能

## 🔧 技术架构

### 通信流程

```
无人车节点 (DDS)
    ↓ 发布
定位/路径数据
    ↓
中央融合节点
    ├─→ 冲突检测 → 冲突消解
    ├─→ 数据库记录
    ├─→ ROS2桥接
    └─→ WebSocket
          ↓
    前端Three.js可视化
```

### 冲突检测算法

系统使用基于时间的预测冲突检测：
1. 对每辆车进行轨迹预测（最多5秒）
2. 计算两两车辆间的预测距离
3. 距离 < 5m：触发警告级冲突
4. 距离 < 2m：触发严重级冲突
5. 自动生成消解策略（减速、变道）

## 📊 数据库表结构

- `vehicle_states` - 车辆状态历史
- `vehicle_paths` - 路径规划记录
- `conflict_alerts` - 冲突警报记录
- `conflict_resolutions` - 消解策略记录

## 🔗 ROS2桥接

桥接模块支持将以下DDS话题转换为ROS2消息格式：
- `vehicle_state` → `nav_msgs/Odometry`
- `vehicle_path` → `nav_msgs/Path`

## 📝 API接口

- **WebSocket**：`/ws` - 实时数据推送
- **GET** `/api/statistics` - 系统统计
- **GET** `/api/conflicts` - 冲突历史
  - 参数：`severity` (可选: critical/warning)

## ⚙️ 配置说明

编辑 `config/simulation_config.yaml` 可调整：
- 车辆数量
- 冲突检测距离阈值
- 预测时间窗口
- 数据库路径
- ROS2话题名称

## 🛠️ 技术栈

**后端：**
- Python 3.8+
- FastAPI
- WebSocket
- SQLite3
- AsyncIO

**前端：**
- Three.js
- Vite
- Vanilla JavaScript

## 📝 开发说明

### 添加新车辆
修改 `src/server/main.py` 中的 `num_vehicles` 参数：

```python
await sim_manager.initialize(num_vehicles=10)
```

### 自定义冲突消解策略
编辑 `src/dds_nodes/fusion_node.py` 中的 `resolve_conflict` 方法。

### 扩展DDS数据类型
在 `src/dds_nodes/idl/vehicle_types.py` 中添加新的数据类。
