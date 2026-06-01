# 颜值评分与年龄分类系统

基于 Python + FastAPI + OpenVINO 的智能图像分析系统，支持颜值评分（0-10分）和年龄分类。

## 功能特性

- ✨ **颜值评分**：基于图像特征的0-10分智能评分
- 👶 **年龄分类**：自动识别年龄段（0-2岁, 3-9岁, 10-19岁, 20-29岁, 30-39岁, 40-49岁, 50-59岁, 60+岁）
- 📸 **单张分析**：拖拽上传单张图片进行分析
- 📁 **批量处理**：支持同时上传并分析多张图片
- 📋 **历史记录**：自动保存所有分析结果，支持分页浏览
- 📊 **统计数据**：实时显示总分析次数、平均分数、年龄分布等统计信息
- 💾 **数据库存储**：使用 SQLite 持久化存储分析结果

## 技术栈

- **后端框架**: FastAPI
- **推理引擎**: OpenVINO
- **数据库**: SQLAlchemy + SQLite
- **图像处理**: OpenCV + NumPy
- **前端**: 原生 HTML/CSS/JavaScript

## 项目结构

```
p98/
├── main.py                  # 主应用入口
├── requirements.txt         # 依赖包列表
├── database/
│   ├── models.py           # 数据库模型
│   └── app.db              # SQLite数据库（自动生成）
├── models/
│   └── model_inference.py  # 模型推理模块
├── static/
│   └── index.html          # 前端页面
├── uploads/                # 上传图片存储目录
└── README.md
```

## 安装与运行

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 启动服务

```bash
python main.py
```

或者使用 uvicorn：

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. 访问应用

打开浏览器访问：http://localhost:9876

## API 接口文档

启动服务后，访问以下地址查看完整的 API 文档：

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

### 主要接口

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/analyze` | 单张图片分析 |
| POST | `/api/analyze/batch` | 批量图片分析 |
| GET | `/api/history` | 获取历史记录列表 |
| GET | `/api/history/{id}` | 获取单条历史记录详情 |
| DELETE | `/api/history/{id}` | 删除历史记录 |
| GET | `/api/stats` | 获取统计数据 |

## 使用 OpenVINO 真实模型

当前版本包含模拟推理功能以便快速测试。要使用真实的 OpenVINO 预训练模型：

1. 从 OpenVINO Model Zoo 下载或转换模型
2. 将模型文件（`.xml` 和 `.bin`）放入 `models/` 目录：
   - `models/beauty_model.xml` 和 `models/beauty_model.bin`（颜值评分模型）
   - `models/age_model.xml` 和 `models/age_model.bin`（年龄分类模型）
3. 重启应用，系统会自动检测并使用 OpenVINO 推理

## 快速使用

1. 启动服务后访问 http://localhost:8000
2. **单张分析模式**：
   - 点击或拖拽图片到上传区域
   - 点击"开始分析"按钮
   - 查看右侧的分析结果
3. **批量处理模式**：
   - 切换到"批量处理"标签
   - 选择或拖拽多张图片
   - 点击"批量分析"按钮
   - 查看批量处理结果列表
4. 在页面底部查看历史记录和统计数据
