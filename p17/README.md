# Sentinel-2 遥感影像处理系统

基于 Python + GDAL + FastAPI + OpenLayers 的遥感影像处理系统，支持 Sentinel-2 JPEG2000 影像的植被指数计算、可视化分析和区域统计。

## 功能特性

### 后端功能
- 🛰️ **Sentinel-2 影像读取**: 支持 JPEG2000 (.jp2) 和 TIFF 格式
- 📊 **植被指数计算**:
  - NDVI (归一化植被指数)
  - EVI (增强植被指数)
  - NDWI (归一化水体指数)
- 💾 **数据库存储**: SQLite 存储处理任务和统计结果
- 📥 **GeoTIFF 下载**: 支持下载计算结果
- 📈 **区域统计**: 支持多边形区域的均值、中位数、最值、标准差计算

### 前端功能
- 🗺️ **OpenLayers 地图**: 交互式地图展示
- 🔄 **图层对比**: 左右滑动对比不同指数图层
- ⏱️ **时间滑块**: 时序分析界面框架
- 📐 **绘制统计**: 绘制多边形进行区域统计
- 🎨 **可视化图例**: NDVI/EVI/NDWI 色带图例

## 项目结构

```
p17/
├── backend/
│   ├── __init__.py
│   ├── app.py              # FastAPI 主应用
│   ├── config.py           # 配置文件
│   ├── database.py         # 数据库连接
│   ├── models.py           # SQLAlchemy 模型
│   ├── schemas.py          # Pydantic 模式
│   ├── image_processor.py  # GDAL 影像处理
│   └── tileserver.py       # 瓦片服务
├── frontend/
│   └── index.html          # 前端页面
├── data/
│   ├── uploads/            # 上传文件存储
│   └── processed/          # 处理结果存储
├── static/                 # 静态文件
├── requirements.txt        # Python 依赖
├── start.sh               # 启动脚本
└── README.md
```

## 快速开始

### 环境要求
- Python 3.8+
- GDAL 3.x
- 支持 Sentinel-2 L1C/L2A 产品

### 方法一：使用启动脚本（推荐）

```bash
chmod +x start.sh
./start.sh
```

### 方法二：手动启动

1. **创建虚拟环境**
```bash
python3 -m venv venv
source venv/bin/activate
```

2. **安装依赖**
```bash
pip install -r requirements.txt
```

3. **启动服务**
```bash
python -m uvicorn backend.app:app --host 0.0.0.0 --port 8000 --reload
```

4. **访问系统**
   - 前端界面: http://localhost:8000
   - API 文档: http://localhost:8000/docs

## 使用说明

### 1. 上传影像
- 在左侧面板输入任务名称
- 拖放或点击选择 Sentinel-2 JP2/TIFF 文件
- 系统自动后台处理 NDVI/EVI/NDWI

### 2. 查看图层
- 点击任务列表中的已完成任务
- 在右侧控制面板切换 NDVI/EVI/NDWI 图层

### 3. 图层对比
- 打开"图层对比"开关
- 选择要对比的图层
- 拖动中间滑块进行左右对比

### 4. 区域统计
- 点击工具栏的 📐 按钮
- 在地图上绘制多边形
- 系统自动计算并显示区域统计结果

### 5. 下载结果
- 点击下载按钮获取 GeoTIFF 格式文件

## API 接口

### 任务管理
- `POST /api/tasks` - 创建处理任务
- `GET /api/tasks` - 获取任务列表
- `GET /api/tasks/{id}` - 获取任务详情
- `DELETE /api/tasks/{id}` - 删除任务

### 统计功能
- `POST /api/tasks/{id}/statistics` - 计算区域统计
- `GET /api/tasks/{id}/statistics` - 获取统计结果

### 数据获取
- `GET /api/tasks/{id}/preview/{index_type}` - 获取预览图
- `GET /api/tasks/{id}/download/{index_type}` - 下载 GeoTIFF

## 指数计算公式

### NDVI (归一化植被指数)
```
NDVI = (NIR - Red) / (NIR + Red)
```

### EVI (增强植被指数)
```
EVI = 2.5 * (NIR - Red) / (NIR + 6*Red - 7.5*Blue + 1)
```

### NDWI (归一化水体指数)
```
NDWI = (Green - NIR) / (Green + NIR)
```

## Sentinel-2 波段对应

| 波段序号 | 波段名称 | 波长 (nm) | 用途 |
|---------|---------|----------|------|
| B02 | Blue | 492.4 | 蓝色 |
| B03 | Green | 559.8 | 绿色 |
| B04 | Red | 664.6 | 红色 |
| B08 | NIR | 832.8 | 近红外 |

## 技术栈

**后端:**
- FastAPI - Web 框架
- SQLAlchemy - ORM
- GDAL - 地理数据处理
- NumPy - 数值计算
- Pillow - 图像处理
- Matplotlib - 色带渲染

**前端:**
- OpenLayers 8 - WebGIS 地图
- 原生 JavaScript - 交互逻辑
- CSS3 - 样式设计

## 注意事项

1. **GDAL 安装**: 如遇 GDAL 安装问题，可使用 conda 安装:
   ```bash
   conda install -c conda-forge gdal
   ```

2. **Sentinel-2 数据**: 建议使用 L2A 级别产品（已大气校正）

3. **大文件处理**: 大影像处理可能需要较长时间，请耐心等待

4. **数据库**: 默认使用 SQLite，生产环境建议更换为 PostgreSQL

## 许可证

MIT License
