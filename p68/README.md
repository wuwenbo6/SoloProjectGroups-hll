# OSM History Viewer

OpenStreetMap 历史路网可视化应用

## 功能特性

- 🗺️ **地图视图**：Leaflet 地图展示历史路网数据
- ⏱️ **时间轴控制**：按年份滑动查看道路新增/消失
- 📊 **统计分析**：ECharts 图表展示路网演变趋势
- 📁 **数据管理**：上传 PBF 文件，自动解析历史数据
- 🌍 **多地区支持**：支持不同城市/地区的数据切换

## 技术栈

### 前端

- React 18 + TypeScript
- Vite
- Tailwind CSS
- Leaflet + react-leaflet
- ECharts
- Zustand

### 后端

- FastAPI (Python)
- SQLAlchemy
- pyosmium (PBF 解析)
- PostGIS (空间数据)

## 快速开始

### 启动后端

```bash
cd backend
pip install -r requirements.txt
python main.py
```

后端服务运行在 `http://localhost:8000`

### 启动前端

```bash
npm install
npm run dev
```

前端开发服务运行在 `http://localhost:5173`

## 项目结构

```
.
├── src/                    # 前端源码
│   ├── components/         # 组件
│   ├── pages/             # 页面
│   ├── store/             # 状态管理
│   ├── services/          # API 服务
│   └── types/             # 类型定义
├── backend/               # 后端源码
│   ├── main.py           # FastAPI 应用
│   ├── pbf_parser.py     # PBF 解析器
│   └── database/         # 数据库脚本
└── .trae/documents/      # 项目文档
```

## 使用说明

1. 启动后端和前端服务
2. 访问地图视图，选择目标地区
3. 使用时间轴播放或拖动查看历史路网变化
4. 在统计分析页面查看详细的路网演变数据
5. 在数据管理页面上传 OSM PBF 历史文件解析新数据
