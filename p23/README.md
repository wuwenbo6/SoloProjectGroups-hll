# 城市排水管网降雨-径流模拟系统

基于 Python + PySWMM + Leaflet 的排水管网模拟可视化系统

## 功能特性

- 🌧️ **降雨-径流模拟**: 使用 PySWMM 引擎进行水文水动力模拟
- 🗺️ **管网可视化**: Leaflet 地图展示排水管网节点和管道
- 🔥 **淹没热力图**: 动态展示节点水深和淹没范围
- ⚙️ **参数可调**: 支持修改汇水区面积、管道糙率等参数
- 💾 **数据存储**: SQLite 数据库存储模拟结果和管网数据

## 项目结构

```
p23/
├── backend/
│   ├── app/
│   │   ├── __init__.py      # Flask 应用初始化
│   │   ├── models.py        # 数据库模型
│   │   ├── routes.py        # API 路由
│   │   └── simulator.py     # PySWMM 模拟引擎
│   └── run.py               # 启动脚本
├── frontend/
│   ├── templates/
│   │   └── index.html       # 主页面
│   └── static/
│       └── js/
│           └── app.js       # 前端应用逻辑
├── data/
│   └── swmm/
│       └── example_network.inp  # SWMM 示例输入文件
└── requirements.txt         # Python 依赖
```

## 数据库设计

### 主要数据表

| 表名 | 说明 |
|------|------|
| Simulation | 模拟记录 |
| SimulationParameter | 模拟参数 |
| NodeResult | 节点模拟结果 |
| LinkResult | 管道模拟结果 |
| NetworkNode | 管网节点信息 |
| NetworkLink | 管网管道信息 |
| Subcatchment | 汇水区信息 |

## API 接口

### 模拟控制
- `POST /api/simulate` - 运行新模拟
- `GET /api/simulations` - 获取模拟列表

### 结果查询
- `GET /api/simulations/<id>/nodes` - 节点水深结果
- `GET /api/simulations/<id>/links` - 管道流量结果
- `GET /api/simulations/<id>/heatmap` - 热力图数据
- `GET /api/simulations/<id>/flooding` - 淹没数据

### 管网信息
- `GET /api/network` - 获取管网 GeoJSON
- `GET /api/nodes` - 获取所有节点
- `GET /api/links` - 获取所有管道
- `GET /api/subcatchments` - 获取所有汇水区

### 参数修改
- `POST /api/parameters/subcatchment/area` - 修改汇水区面积
- `POST /api/parameters/link/roughness` - 修改管道糙率

## 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 启动服务

```bash
cd backend
python run.py
```

### 3. 访问系统

打开浏览器访问: http://localhost:5000

## 使用说明

1. **运行模拟**: 输入模拟名称，点击"开始模拟"按钮
2. **查看结果**: 在历史模拟列表中选择模拟结果
3. **动态展示**: 使用时间轴滑块或播放按钮查看淹没过程
4. **修改参数**: 在参数设置面板中调整汇水区面积或管道糙率
5. **查看详情**: 点击地图上的节点查看实时水深数据

## 技术栈

**后端:**
- Flask - Web 框架
- PySWMM - SWMM 模拟引擎
- SQLAlchemy - ORM 框架
- SQLite - 数据库

**前端:**
- Leaflet - 地图库
- Leaflet.heat - 热力图插件
- 原生 JavaScript

## 注意事项

- 首次运行会自动创建数据库和表结构
- 模拟过程可能需要几分钟时间，请耐心等待
- 示例管网位于北京市中心区域
