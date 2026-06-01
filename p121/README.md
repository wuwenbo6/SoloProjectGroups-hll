# IFC 全栈应用 - 模型查看与碰撞检测

## 项目概述

基于 Python + Three.js 的全栈 IFC 模型查看器，支持：
- IFC 文件解析与几何信息提取（三角面）
- 几何轻量化处理（同类型合并、二次误差度量简化）
- Three.js 3D 模型展示与交互
- AABB 层级包围盒碰撞检测
- SQLite 数据库存储模型数据

## 项目结构

```
p121/
├── backend/
│   ├── app.py                 # Flask 主应用，API 路由
│   ├── models.py              # 数据库模型（SQLAlchemy）
│   ├── ifc_parser.py          # IFC 文件解析（IfcOpenShell）
│   ├── geometry_processor.py  # 几何轻量化（合并/简化/压缩）
│   ├── requirements.txt       # Python 依赖
│   ├── uploads/               # 上传的 IFC 文件存储
│   └── instance/              # SQLite 数据库存储
└── frontend/
    ├── index.html             # 前端页面
    ├── css/style.css          # 样式
    └── js/
        ├── viewer.js          # Three.js 查看器
        ├── collision.js       # AABB 层级碰撞检测
        └── main.js            # 主应用逻辑
```

## 技术栈

### 后端
- **Flask** - Web 框架
- **IfcOpenShell** - IFC 文件解析
- **SQLAlchemy** - ORM
- **Trimesh** - 几何处理与简化
- **NumPy** - 数值计算
- **SQLite** - 数据库

### 前端
- **Three.js** - 3D 渲染
- **OrbitControls** - 相机控制
- **AABB BVH** - 层级包围盒碰撞检测

## 安装与运行

### 后端

```bash
cd backend
pip install -r requirements.txt
python app.py
```

服务器将运行在 `http://localhost:5000`

### 前端

前端由 Flask 直接托管，访问 `http://localhost:5000` 即可打开查看器。

## API 接口

### 模型管理
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/models` | 获取所有模型列表 |
| GET | `/api/models/<id>` | 获取单个模型信息 |
| POST | `/api/models` | 上传并解析 IFC 文件 |
| DELETE | `/api/models/<id>` | 删除模型 |

### 几何处理
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/models/<id>/merge` | 按 IFC 类型合并构件 |
| POST | `/api/models/<id>/simplify` | 简化几何（参数: face_ratio） |

### 数据获取
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/models/<id>/geometry` | 获取完整几何数据 |
| GET | `/api/models/<id>/elements` | 获取构件列表 |
| GET | `/api/models/<id>/elements/<eid>` | 获取单个构件详情 |

### 碰撞检测
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/models/<id>/collisions` | 检测 AABB 碰撞 |

## 使用流程

1. **上传 IFC 文件**: 选择 `.ifc` 或 `.ifczip` 文件，点击"上传并解析"
2. **查看模型**: 解析完成后自动加载到 3D 视图
3. **轻量化处理**:
   - 点击"合并同类型构件"将相同 IFC 类型的构件合并
   - 拖动滑块设置简化比例，点击"简化几何"减少面数
4. **碰撞检测**: 点击"检测碰撞"查看 AABB 碰撞结果
5. **交互**:
   - 鼠标左键拖动旋转视角
   - 右键拖动平移
   - 滚轮缩放
   - 点击构件高亮选中
   - 点击碰撞项查看具体碰撞

## 核心算法

### IFC 解析
- 使用 IfcOpenShell 遍历所有 `IfcProduct`
- 通过 `ifcopenshell.geom.create_shape()` 提取三角化网格
- 提取顶点坐标、面索引、材质颜色
- 计算每个构件的 AABB 包围盒

### 几何轻量化
- **合并**: 将相同 IFC 类型的构件几何合并为单个网格
- **简化**: 使用 Trimesh 的二次误差度量 (QEM) 简化算法
- **压缩**: 顶点坐标四舍五入到 4 位小数

### 碰撞检测
- **后端**: 基于 AABB 的两两检测
- **前端**: AABB BVH 层级树结构（二叉树，按最长轴分裂）
- 支持点查询和范围查询
