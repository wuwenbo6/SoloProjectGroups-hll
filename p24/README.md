# 缺陷检测系统 (Defect Detection System)

基于元学习(MAML)和OpenVINO的表面缺陷检测系统，支持少量样本(每类5张)快速训练和部署。

## 功能特性

- **元学习训练**: 使用MAML算法实现小样本学习，每类仅需5张训练图片
- **缺陷检测**: 检测划痕(scratch)和凹坑(dent)两种缺陷
- **OpenVINO推理**: 支持Intel OpenVINO加速推理
- **REST API**: FastAPI提供完整的API接口
- **热力图展示**: 前端可视化展示缺陷区域热力图
- **数据库存储**: SQLite存储检测历史记录

## 项目结构

```
p24/
├── backend/
│   ├── api/              # REST API (FastAPI)
│   ├── database/         # 数据库模型和CRUD操作
│   ├── detection/        # 缺陷检测和OpenVINO推理
│   ├── maml/             # MAML元学习模型和训练
│   ├── models/           # 训练好的模型文件
│   └── generate_samples.py  # 生成示例数据
├── frontend/
│   ├── templates/        # HTML模板
│   └── static/           # 静态资源
├── data/
│   ├── train/            # 训练数据 (每类5张)
│   ├── test/             # 测试数据
│   ├── uploads/          # 用户上传的图片
│   └── heatmaps/         # 生成的热力图
├── requirements.txt      # Python依赖
├── run.py               # 启动脚本
└── .env                 # 配置文件
```

## 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 生成示例数据

```bash
cd backend
python generate_samples.py
```

### 3. 训练MAML模型

```bash
cd backend/maml
python train.py
```

### 4. 启动服务

```bash
python run.py
```

访问: http://localhost:8000

## API接口

### 检测缺陷
```
POST /api/detect
Content-Type: multipart/form-data
Body: file=<image_file>
```

响应:
```json
{
  "success": true,
  "result": {
    "class": "scratch",
    "class_id": 1,
    "confidence": 0.95,
    "probabilities": {"normal": 0.03, "scratch": 0.95, "dent": 0.02},
    "defects": [
      {"x": 100, "y": 50, "width": 80, "height": 3, "area": 240, "class": "scratch"}
    ],
    "heatmap_base64": "...",
    "blended_heatmap_base64": "..."
  }
}
```

### 获取历史记录
```
GET /api/records?skip=0&limit=100
```

### 获取统计信息
```
GET /api/statistics
```

### 获取类别信息
```
GET /api/classes
```

## 缺陷类别

| 类别 | 描述 |
|------|------|
| normal | 正常，无缺陷 |
| scratch | 表面划痕 |
| dent | 表面凹坑 |

## 技术栈

- **后端框架**: FastAPI
- **深度学习**: PyTorch
- **元学习**: MAML (Model-Agnostic Meta-Learning)
- **推理引擎**: OpenVINO
- **数据库**: SQLAlchemy + SQLite
- **前端**: HTML5 + Bootstrap 5
