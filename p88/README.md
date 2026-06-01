# EIT 3D 阻抗成像系统

一个完整的电阻抗断层成像（EIT）系统，包含后端、前端和数据库。

## 系统架构

```
p88/
├── backend/           # 后端 Python 服务
│   ├── eit_core_simple.py  # EIT 核心算法（简化版）
│   ├── database.py         # 数据库模型
│   ├── app.py              # Flask API 接口
│   ├── run.py              # 服务器启动脚本
│   ├── requirements.txt    # Python 依赖
│   └── eit_database.db     # SQLite 数据库（自动生成）
└── frontend/          # 前端 Three.js 可视化
    ├── src/
    │   ├── main.js         # 主应用逻辑
    │   └── EITVisualizer.js # Three.js 3D渲染器
    ├── index.html          # 主页面
    ├── vite.config.js      # Vite 配置
    └── package.json        # Node.js 依赖
```

## 功能特性

### 后端
- ✅ 16电极EIT模拟
- ✅ GREIT 重建算法
- ✅ 高斯牛顿重建算法
- ✅ 边界电压模拟
- ✅ SQLite数据库存储测量数据
- ✅ RESTful API接口

### 前端
- ✅ Three.js 3D可视化
- ✅ Marching Cubes 等值面渲染
- ✅ X/Y/Z轴切片显示
- ✅ 等值面阈值调节
- ✅ 测量数据管理（保存/加载）

## 快速开始

### 1. 启动后端服务器

```bash
cd backend
pip install -r requirements.txt
python run.py
```

后端服务器将在 `http://localhost:9000` 启动。

### 2. 启动前端开发服务器

```bash
cd frontend
npm install
npm run dev
```

前端服务器将在 `http://localhost:3002` 启动。

### 3. 访问应用

在浏览器中打开 `http://localhost:3002`

## 使用指南

### 工作流程

1. **设置异常参数**（可选）
   - 在"模拟异常"文本框中输入JSON格式的异常配置
   - 或点击"使用默认异常"加载预设配置

2. **模拟边界电压**
   - 点击"模拟边界电压"按钮生成v0（基线）和v1（测量）电压

3. **重建阻抗分布**
   - 选择重建算法（GREIT或高斯牛顿）
   - 点击"开始重建"按钮

4. **3D可视化控制**
   - 鼠标拖拽：旋转视角
   - 滚轮：缩放
   - 等值面滑块：调节显示阈值
   - X/Y/Z切片开关：显示对应轴的切片
   - 切片位置滑块：调节切片位置

5. **数据管理**
   - 输入测量名称，点击"保存到数据库"保存当前测量
   - 在历史记录列表中点击加载之前的测量
   - 点击"刷新列表"更新历史记录

## API 接口文档

### GET /api/anomaly/sample
获取默认异常配置示例

**响应：**
```json
{
  "success": true,
  "data": [
    {"x": 0.3, "y": 0.2, "d": 0.2, "perm": 10.0},
    {"x": -0.2, "y": -0.2, "d": 0.15, "perm": 0.1}
  ]
}
```

### POST /api/simulate
模拟边界电压

**请求体：**
```json
{
  "anomaly": [{"x": 0.3, "y": 0.2, "d": 0.2, "perm": 10.0}]
}
```

**响应：**
```json
{
  "success": true,
  "data": {
    "v0": [...],
    "v1": [...],
    "anomaly": [...]
  }
}
```

### POST /api/reconstruct
重建阻抗分布

**请求体：**
```json
{
  "v0": [...],
  "v1": [...],
  "method": "greit",
  "grid_size": 32
}
```

**响应：**
```json
{
  "success": true,
  "data": {
    "reconstruction": [...],
    "volume": {
      "volume": [...],
      "shape": [32, 32, 32]
    },
    "method": "greit"
  }
}
```

### GET /api/measurements
获取所有测量记录

**响应：**
```json
{
  "success": true,
  "data": [...],
  "count": 10
}
```

### POST /api/measurements
保存新的测量记录

**请求体：**
```json
{
  "name": "测量名称",
  "v0": [...],
  "v1": [...],
  "reconstruction": [...],
  "volume": {...},
  "method": "greit"
}
```

### GET /api/measurements/:id
获取指定测量的详细数据

### DELETE /api/measurements/:id
删除指定测量记录

## 异常配置格式

异常配置为JSON数组，每个异常对象包含：
- `x`: X坐标 (-1 到 1)
- `y`: Y坐标 (-1 到 1)
- `d`: 直径
- `perm`: 电导率值

## 技术栈

**后端：**
- Python 3.9+
- Flask 3.0
- NumPy / SciPy
- SQLAlchemy
- SQLite

**前端：**
- Three.js r160
- Vite 5.0
- 原生 JavaScript

## 注意事项

- 当前EIT核心模块为简化版，使用数值模拟替代完整的FEM求解
- 如需使用完整的pyEIT库，请从GitHub安装：`pip install git+https://github.com/liubenyuan/pyEIT.git`
- 网络连接问题可能导致pyEIT安装失败，使用简化版可确保系统正常运行
