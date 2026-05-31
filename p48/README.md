# 3D 料堆体积测量系统

基于 C++ PCL 点云库、Python Flask 和 Three.js 的三维料堆体积测量系统。

## 功能特性

- **点云处理**: 支持 Intel RealSense 等深度相机点云输入
- **地面分割**: RANSAC 算法进行地面平面分割
- **多料堆分离**: 欧几里得聚类算法分离多个料堆
- **体积计算**: 基于积分法/凸包法计算料堆体积
- **可视化**: Three.js 前端实时展示点云和体积数值
- **历史记录**: SQLite 数据库保存测量历史
- **REST API**: 完整的 HTTP API 接口

## 项目结构

```
p48/
├── backend/
│   ├── cpp/                          # C++ PCL 处理模块
│   │   ├── include/                  # 头文件
│   │   │   ├── point_cloud_processor.h
│   │   │   ├── ground_segmentation.h
│   │   │   ├── pile_segmentation.h
│   │   │   └── volume_calculator.h
│   │   ├── src/                      # 源文件
│   │   │   ├── main.cpp
│   │   │   ├── point_cloud_processor.cpp
│   │   │   ├── ground_segmentation.cpp
│   │   │   ├── pile_segmentation.cpp
│   │   │   └── volume_calculator.cpp
│   │   └── CMakeLists.txt
│   └── api/                          # Python Flask API
│       ├── app.py                    # 主应用
│       ├── database.py               # 数据库操作
│       ├── requirements.txt
│       └── uploads/                  # 上传文件目录
├── frontend/                         # Three.js 前端
│   ├── index.html
│   └── app.js
├── database/                         # SQLite 数据库
└── scripts/                          # 启动脚本
    ├── build_cpp.sh
    ├── start_backend.sh
    ├── start_frontend.sh
    └── start_all.sh
```

## 快速开始

### 环境要求

#### C++ 模块
- CMake >= 3.10
- PCL (Point Cloud Library) >= 1.8
- Boost >= 1.65

#### Python 后端
- Python >= 3.8
- Flask
- Open3D
- NumPy

### 安装依赖

#### C++ 模块 (可选，Python版本已实现完整功能)

```bash
# Ubuntu/Debian
sudo apt-get install libpcl-dev libboost-all-dev cmake

# macOS
brew install pcl boost cmake

# 编译
./scripts/build_cpp.sh
```

#### Python 后端

```bash
cd backend/api
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 启动系统

#### 方式一：一键启动

```bash
./scripts/start_all.sh
```

#### 方式二：分别启动

```bash
# 终端1: 启动后端
./scripts/start_backend.sh

# 终端2: 启动前端
./scripts/start_frontend.sh
```

### 访问应用

- 前端界面: http://localhost:8080
- 后端API: http://localhost:5000

## API 接口文档

### 健康检查

```http
GET /api/health
```

响应:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T12:00:00.000000"
}
```

### 处理点云

```http
POST /api/process
```

支持两种输入方式:

1. **上传点云文件** (multipart/form-data):
   - `file`: .pcd 或 .ply 文件

2. **JSON 点云数据** (application/json):
   ```json
   {
     "points": [[x1, y1, z1], [x2, y2, z2], ...]
   }
   ```

3. **无参数**: 自动生成测试点云

响应:
```json
{
  "piles": [
    {
      "id": 0,
      "volume": 0.1234,
      "centroid_x": -0.8,
      "centroid_y": 0.5,
      "centroid_z": 0.3,
      "points": [[x1, y1, z1], ...]
    }
  ],
  "total_piles": 2,
  "total_volume": 0.2567,
  "ground_points": [[x1, y1, z1], ...],
  "measurement_id": 1
}
```

### 获取测量记录列表

```http
GET /api/measurements?limit=100
```

### 获取单条测量记录

```http
GET /api/measurements/{id}
```

### 删除测量记录

```http
DELETE /api/measurements/{id}
```

### 获取点云数据

```http
GET /api/measurements/{id}/pointcloud
```

响应:
```json
{
  "points": [[x1, y1, z1], ...],
  "colors": [[r1, g1, b1], ...]
}
```

### 生成测试数据

```http
POST /api/test/generate
```

## 核心算法说明

### 1. 地面分割 (RANSAC)

使用随机采样一致 (RANSAC) 算法拟合地面平面模型：

```cpp
pcl::SACSegmentation<pcl::PointXYZ> seg;
seg.setModelType(pcl::SACMODEL_PLANE);
seg.setMethodType(pcl::SAC_RANSAC);
seg.setDistanceThreshold(0.02);  // 距离阈值
```

### 2. 多料堆分离 (欧几里得聚类)

基于 KD-Tree 的欧几里得距离聚类：

```cpp
pcl::EuclideanClusterExtraction<pcl::PointXYZ> ec;
ec.setClusterTolerance(0.05);     // 聚类容差 (m)
ec.setMinClusterSize(100);        // 最小点数
ec.setMaxClusterSize(50000);      // 最大点数
```

### 3. 体积计算

采用积分法计算体积：
1. 计算每个点到地平面的距离（高度）
2. 估计料堆投影面积
3. 体积 = 投影面积 × 平均高度 × 形状系数

## 前端操作说明

- **鼠标左键拖动**: 旋转视角
- **鼠标右键拖动**: 平移视角
- **鼠标滚轮**: 缩放
- **生成测试数据**: 自动创建包含两个料堆的测试场景
- **上传点云文件**: 支持 .pcd, .ply 格式

## 数据库结构

### measurements 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| timestamp | DATETIME | 测量时间 |
| total_volume | REAL | 总体积 (m³) |
| pile_count | INTEGER | 料堆数量 |
| pile_volumes | TEXT | JSON 格式的料堆详情 |
| point_cloud_path | TEXT | 点云文件路径 |
| created_at | DATETIME | 创建时间 |

### pile_details 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| measurement_id | INTEGER | 关联测量ID |
| pile_id | INTEGER | 料堆ID |
| volume | REAL | 体积 (m³) |
| centroid_x/y/z | REAL | 质心坐标 |

## 配置参数

可在 `backend/api/app.py` 中调整：

- 地面分割阈值: `distance_threshold=0.02`
- 聚类容差: `eps=0.05`
- 最小聚类点数: `min_points=50`

## 常见问题

### 1. C++ 编译失败

确保已正确安装 PCL 和 Boost 库。如果不想使用 C++ 模块，Python 版本已实现完整功能。

### 2. 点云显示异常

检查点云文件格式，确保是 ASCII 或 Binary PCD 格式。

### 3. 体积计算不准确

调整以下参数:
- 减小地面距离阈值获得更精确的地面分割
- 调整聚类容差适应不同密度的点云
- 增加最小聚类点数过滤噪声

## 许可证

MIT License
