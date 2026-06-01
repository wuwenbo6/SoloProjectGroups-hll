# 城市内涝模拟系统

基于SWMM的全栈城市内涝模拟应用，支持降雨径流模拟与淹没分析可视化。

## 功能特性

- **SWMM水文模拟**: 使用pyswmm引擎进行城市雨洪模拟
- **重现期选择**: 支持2年一遇和50年一遇降雨场景
- **动态等值线**: Leaflet地图实时绘制淹没范围等值线
- **数据库存储**: SQLite持久化存储模拟结果
- **交互式界面**: 图层控制、透明度调节、统计信息展示

## 项目结构

```
p79/
├── backend/
│   ├── app.py              # Flask API服务器
│   ├── database.py         # SQLite数据库操作
│   └── swmm_simulator.py   # SWMM模拟核心逻辑
├── frontend/
│   ├── index.html          # 主页面
│   ├── css/
│   │   └── style.css       # 样式文件
│   └── js/
│       └── app.js          # 前端应用逻辑
├── requirements.txt        # Python依赖
└── README.md
```

## 安装依赖

```bash
pip3 install -r requirements.txt
```

## 启动应用

```bash
cd backend
python3 app.py
```

应用将在 `http://localhost:5000` 启动。

## API接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/simulate` | 运行模拟 |
| GET | `/api/simulation/<period>` | 获取模拟结果 |
| GET | `/api/simulations` | 列出可用模拟 |
| DELETE | `/api/simulation/<period>` | 删除模拟 |
| GET | `/api/contour/<period>` | 获取等值线数据 |

## 使用说明

1. 在浏览器中打开 `http://localhost:5001`
2. 选择重现期（2年/50年一遇）
3. 点击"运行模拟"按钮
4. 等待SWMM模拟完成
5. 在地图上查看淹没范围等值线和水深点
6. 使用控制面板切换图层显示和调整透明度

## 技术栈

**后端:**
- Python 3.9+
- Flask (Web框架)
- pyswmm (SWMM模拟)
- SQLite (数据库)
- NumPy/SciPy (数值计算)

**前端:**
- Leaflet (地图)
- 原生JavaScript
- CSS3
