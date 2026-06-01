# PBF 区域裁剪工具

基于 Python + Osmium 的后端服务，支持用户上传区域 GeoJSON，从 PBF 文件中裁剪出该区域的数据，并导出为 OSM 或 GeoJSON 格式。前端提供实时进度条展示。

## 功能特性

- 📁 **GeoJSON 上传**：支持拖拽上传区域 GeoJSON 文件
- 📦 **PBF 文件支持**：三种方式选择 PBF 文件（列表选择、路径输入、直接上传）
- ✂️ **区域裁剪**：使用 Osmium 高效裁剪 PBF 数据
- 📊 **实时进度**：通过 SSE（Server-Sent Events）推送实时进度
- 💾 **多格式导出**：支持导出为 OSM XML 或 GeoJSON 格式
- 🎨 **美观界面**：现代化的 Web 界面，响应式设计

## 技术栈

- **后端**：Python 3.9+, FastAPI, Uvicorn
- **核心库**：osmium (PBF 处理), Shapely (几何操作)
- **前端**：原生 HTML/CSS/JavaScript, SSE 流式传输
- **异步处理**：asyncio 异步任务 + 线程安全回调

## 安装依赖

```bash
pip3 install -r requirements.txt
```

## 目录结构

```
.
├── app.py                 # FastAPI 主服务
├── pbf_clip.py            # PBF 裁剪核心逻辑
├── requirements.txt       # Python 依赖
├── templates/
│   └── index.html         # 前端页面
├── uploads/               # 上传的 GeoJSON 文件
├── outputs/               # 裁剪结果输出目录
└── data/                  # PBF 文件存放目录
```

## 快速开始

### 1. 启动服务

```bash
python3 app.py
```

服务将在 `http://localhost:8000` 启动。

### 2. 使用 Web 界面

打开浏览器访问 `http://localhost:8000`，按照以下步骤操作：

1. **上传区域 GeoJSON**：点击或拖拽上传包含多边形区域的 GeoJSON 文件
2. **选择 PBF 文件**：
   - 从列表选择（自动扫描 `data/` 目录）
   - 输入 PBF 文件绝对路径
   - 直接上传 PBF 文件
3. **选择输出格式**：GeoJSON 或 OSM XML
4. **点击开始裁剪**，查看实时进度
5. **下载结果**

### 3. API 接口

#### 上传 GeoJSON

```
POST /upload/geojson
Content-Type: multipart/form-data

file: <geojson-file>
```

响应：
```json
{
  "file_id": "uuid",
  "filename": "example.geojson",
  "bounds": { "min_lon": ..., "max_lat": ... },
  "area": ...
}
```

#### 上传 PBF

```
POST /upload/pbf
Content-Type: multipart/form-data

file: <pbf-file>
```

#### 列出可用 PBF

```
GET /pbf/list
```

#### 开始裁剪任务

```
POST /clip
Content-Type: application/json

{
  "geojson_id": "uuid",
  "pbf_path": "/path/to/file.osm.pbf",
  "output_format": "geojson"  // 或 "osm"
}
```

响应：
```json
{
  "task_id": "task-uuid",
  "status": "running"
}
```

#### 实时进度流

```
GET /stream/{task_id}
Accept: text/event-stream
```

SSE 事件数据格式：
```json
{
  "task_id": "task-uuid",
  "status": "processing",
  "progress": 45.2,
  "message": "processing: 45.2%",
  "details": {
    "nodes_processed": 123456,
    "ways_processed": 12345,
    "kept_nodes": 1234,
    "kept_ways": 123
  },
  "phase": "processing"
}
```

完成时：
```json
{
  "status": "completed",
  "progress": 100,
  "stats": { ... },
  "download_url": "/download/{task_id}"
}
```

#### 查询任务状态

```
GET /status/{task_id}
```

#### 下载结果

```
GET /download/{task_id}
```

## 使用示例

### 准备测试数据

1. 下载一个小的 PBF 文件，例如：
   - 从 Geofabrik 下载：https://download.geofabrik.de/
   - 或者使用 osmium 工具提取小区域

2. 将 PBF 文件放入 `data/` 目录：
   ```bash
   mv your-file.osm.pbf data/
   ```

3. 准备一个区域 GeoJSON（多边形），例如：
   ```json
   {
     "type": "Feature",
     "geometry": {
       "type": "Polygon",
       "coordinates": [[
         [116.3, 39.8],
         [116.5, 39.8],
         [116.5, 40.0],
         [116.3, 40.0],
         [116.3, 39.8]
       ]]
     }
   }
   ```

## 核心模块说明

### pbf_clip.py

- **`ClipHandler`**：Osmium Handler，用于裁剪并导出 OSM 格式
- **`GeoJSONExportHandler`**：Osmium Handler，用于导出 GeoJSON 格式
- **`CountHandler`**：统计 PBF 文件中的元素数量
- **`clip_pbf_to_osm()`**：裁剪并导出 OSM XML
- **`clip_pbf_to_geojson()`**：裁剪并导出 GeoJSON
- **`load_geojson_boundary()`**：加载并验证 GeoJSON 边界

### app.py

- FastAPI 路由定义
- 异步任务管理
- SSE 进度推送
- 文件上传和下载

## 注意事项

1. **PBF 文件大小**：大的 PBF 文件可能需要较长处理时间
2. **内存使用**：处理大型区域时可能占用较多内存
3. **坐标系统**：确保 GeoJSON 使用 WGS84 (EPSG:4326) 坐标系
4. **边界验证**：GeoJSON 必须包含有效的 Polygon 或 MultiPolygon

## License

MIT
