# 地震事件检测系统

基于 Python + ObsPy 的模板匹配 (Matched Filter) 地震事件检测系统，包含前端可视化界面。

## 系统架构

### 后端
- **框架**: FastAPI
- **核心算法**: ObsPy + 互相关模板匹配
- **数据库**: SQLite + SQLAlchemy
- **功能**:
  - 模板波形管理
  - 连续波形滑动窗口互相关检测
  - 地震事件存储和查询
  - 波形片段提取和对齐

### 前端
- **框架**: React + TypeScript
- **UI组件**: Material-UI
- **可视化**: Chart.js
- **功能**:
  - 模板上传和管理
  - 事件检测配置和执行
  - 检测结果列表展示
  - 波形对齐可视化

## 快速开始

### 1. 生成测试数据

```bash
cd scripts
python generate_test_data.py
```

这将生成：
- `test_data/template.mseed` - 模板波形（3秒，包含一个地震事件）
- `test_data/continuous.mseed` - 连续波形（60秒，包含3个重复事件）

### 2. 启动后端服务

```bash
# 方式一：使用启动脚本
chmod +x start_backend.sh
./start_backend.sh

# 方式二：手动启动
cd backend
pip install -r ../requirements.txt
python main.py
```

后端服务将在 `http://localhost:8000` 启动

API 文档: `http://localhost:8000/docs`

### 3. 启动前端服务

```bash
# 方式一：使用启动脚本
chmod +x start_frontend.sh
./start_frontend.sh

# 方式二：手动启动
cd frontend
npm install
npm run dev
```

前端服务将在 `http://localhost:3000` 启动

## 使用流程

### 1. 上传模板
1. 进入「模板管理」标签页
2. 输入模板名称（如："示例地震模板"）
3. 选择模板文件 `test_data/template.mseed`
4. 点击「上传模板」

### 2. 执行检测
1. 进入「事件检测」标签页
2. 选择刚才上传的模板
3. 调整相关系数阈值（建议 0.75-0.9）
4. 选择连续波形文件 `test_data/continuous.mseed`
5. 点击「开始检测」

### 3. 查看结果
1. 进入「检测结果」标签页
2. 点击检测结果的「查看」图标
3. 进入「波形对齐」标签页查看模板与检测事件的波形对比

## API 接口

### 模板管理
- `POST /templates/upload` - 上传模板
- `GET /templates` - 获取所有模板
- `GET /templates/{id}` - 获取单个模板
- `DELETE /templates/{id}` - 删除模板

### 事件检测
- `POST /detect` - 执行模板匹配检测
- `GET /detections` - 获取检测结果列表
- `GET /detections/{id}` - 获取单个检测结果
- `DELETE /detections/{id}` - 删除检测结果

### 波形数据
- `POST /waveforms/aligned` - 获取对齐的波形数据

## 核心算法说明

### 模板匹配 (Matched Filter)
1. **归一化**: 对模板和连续波形进行Z-score归一化
2. **互相关**: 使用 `scipy.signal.correlate` 计算互相关系数
3. **峰值检测**: 在互相关序列中寻找超过阈值的峰值
4. **事件提取**: 提取峰值位置对应的波形片段

### 相关系数阈值
- 高阈值 (>=0.9): 高置信度检测，可能漏检
- 中阈值 (0.8-0.9): 平衡检测率和误报率
- 低阈值 (0.7-0.8): 可能增加误报，但减少漏检

## 项目结构

```
.
├── backend/                    # 后端代码
│   ├── main.py                # FastAPI 主应用
│   ├── database.py            # 数据库模型
│   ├── schemas.py             # Pydantic 数据模型
│   └── matched_filter.py      # 模板匹配算法
├── frontend/                   # 前端代码
│   ├── src/
│   │   ├── components/        # React 组件
│   │   ├── services/          # API 服务
│   │   ├── types/             # TypeScript 类型
│   │   └── App.tsx            # 主应用
│   └── package.json
├── scripts/                    # 工具脚本
│   └── generate_test_data.py  # 测试数据生成
├── templates/                  # 模板文件存储
├── test_data/                  # 测试数据
├── requirements.txt            # Python 依赖
└── README.md                   # 项目说明
```

## 技术栈

### 后端
- Python 3.8+
- FastAPI 0.109+
- ObsPy 1.4+
- SQLAlchemy 2.0+
- NumPy, SciPy

### 前端
- React 18+
- TypeScript 5+
- Material-UI 5+
- Chart.js 4+
- Axios
