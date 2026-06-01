# RT Dose Planning System

放射治疗剂量计划系统，基于Python + FastAPI后端和React + Three.js前端实现。

## 功能特性

### 后端 (Python + FastAPI)
- ✅ DICOM-RT 结构集和计划读取
- ✅ 笔形束剂量计算算法 (Pencil Beam Algorithm)
- ✅ SQLite数据库存储计划数据
- ✅ RESTful API接口
- ✅ 剂量分布计算和等剂量线提取

### 前端 (React + Three.js)
- ✅ 3D剂量云可视化
- ✅ 等剂量线显示
- ✅ 多角度切片查看 (X/Y/Z轴)
- ✅ 交互式3D视图 (旋转、缩放、平移)
- ✅ Material UI界面

## 项目结构

```
p73/
├── backend/                    # 后端Python代码
│   ├── __init__.py
│   ├── config.py              # 配置文件
│   ├── database.py            # 数据库模型
│   ├── dicom_reader.py        # DICOM-RT读取模块
│   ├── pencil_beam.py         # 笔形束剂量计算
│   ├── main.py                # FastAPI主入口
│   └── requirements.txt       # Python依赖
├── frontend/                   # 前端React代码
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── index.js
│   │   ├── App.js             # 主应用组件
│   │   └── components/
│   │       ├── DoseViewer3D.js  # 3D剂量查看器
│   │       └── SliceViewer.js   # 2D切片查看器
│   └── package.json           # Node.js依赖
├── start_backend.sh           # 后端启动脚本
├── start_frontend.sh          # 前端启动脚本
├── test_dose_calc.py          # 剂量计算测试
└── README.md                  # 本文件
```

## 快速开始

### 1. 启动后端

```bash
chmod +x start_backend.sh
./start_backend.sh
```

或手动执行：

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

后端API文档: http://localhost:8000/docs

### 2. 启动前端 (新开终端)

```bash
chmod +x start_frontend.sh
./start_frontend.sh
```

或手动执行：

```bash
cd frontend
npm install
npm start
```

前端访问: http://localhost:3000

## 使用说明

### 创建治疗计划

1. 在左侧面板的 "Create New Plan" 部分输入计划名称
2. 点击 "Create Plan" 创建新计划

### 添加射束

1. 选择一个计划
2. 点击 "Add Sample Beams (4-field)" 添加示例射束 (AP/PA/RT/LT四野)
3. 或通过API上传DICOM-RT计划文件

### 计算剂量

1. 确保计划至少有一个射束
2. 点击 "Calculate Dose" 运行笔形束剂量计算

### 查看剂量分布

1. 剂量计算完成后，选择视图模式：
   - **3D Volume**: 3D剂量云可视化
   - **Slice View**: 2D切片查看

2. 在3D视图中：
   - 鼠标左键拖拽：旋转视图
   - 鼠标滚轮：缩放
   - 鼠标右键拖拽：平移
   - 底部控制面板调整切片位置和轴方向

3. 在切片视图中：
   - 选择X/Y/Z轴方向
   - 拖动滑块浏览不同切片
   - 开启/关闭等剂量线显示

## API接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/plans/` | 创建新计划 |
| GET | `/plans/` | 获取计划列表 |
| GET | `/plans/{id}` | 获取计划详情 |
| DELETE | `/plans/{id}` | 删除计划 |
| POST | `/plans/{id}/beams/` | 添加射束 |
| POST | `/plans/{id}/calculate-dose` | 计算剂量 |
| GET | `/plans/{id}/dose/slice` | 获取剂量切片 |
| GET | `/plans/{id}/dose/iso-contours` | 获取等剂量线 |
| GET | `/plans/{id}/dose/volume` | 获取剂量体数据 |
| POST | `/plans/{id}/upload-rtplan` | 上传DICOM-RT计划 |
| POST | `/plans/{id}/upload-rtstruct` | 上传DICOM-RT结构集 |

## 技术细节

### 笔形束算法 (Pencil Beam)

- 基于深度剂量曲线 (PDD) 和侧向剖面
- 支持多射束叠加
- 高斯卷积模拟散射
- 射束方向：支持任意机架角、准直器角、床角

### 剂量可视化

- 10级等剂量线 (95% - 10%)
- 彩色编码：红(高) → 蓝(低)
- 3D点云剂量渲染
- 2D纹理贴图切片

## 测试

运行剂量计算测试：

```bash
python test_dose_calc.py
```

## 依赖

### 后端
- Python 3.8+
- FastAPI 0.104+
- NumPy, SciPy
- pydicom (DICOM读取)
- scikit-image (轮廓提取)
- SQLAlchemy (ORM)

### 前端
- React 18+
- Three.js (3D渲染)
- @react-three/fiber
- @react-three/drei
- Material UI

## 注意事项

1. 本系统为教学演示用途，临床使用需经过严格验证
2. 笔形束算法为简化版本，不代表临床精度
3. DICOM文件支持可能因厂商不同而有差异
