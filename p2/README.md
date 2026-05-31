# 古籍汉字识别与校勘系统

基于 Electron + Python + CRNN 模型的古籍图像汉字识别与多版本校勘系统。

## 功能特性

1. **图像框选识别**
   - 支持加载古籍图像
   - 鼠标框选区域进行识别
   - 返回识别汉字、置信度和候选字
   - 支持手动修正识别结果

2. **多版本校勘**
   - 支持对比多个版本文本（如四库全书不同抄本）
   - 高亮显示差异字符
   - 鼠标悬停显示各版本对比

3. **数据库存储**
   - SQLite 数据库存储校勘记录
   - 支持查看历史校勘记录

4. **校勘记导出**
   - 支持导出为 TXT、JSON、HTML 格式

## 项目结构

```
p2/
├── electron/
│   └── main.js          # Electron 主进程
├── frontend/
│   ├── index.html       # 前端页面
│   ├── styles.css       # 样式文件
│   └── app.js           # 前端逻辑
├── backend/
│   ├── server.py        # Flask 后端服务
│   ├── database.py      # 数据库模型
│   └── crnn_model.py    # CRNN 识别模型
├── data/                # 数据目录（自动创建）
├── package.json         # Node.js 依赖
└── requirements.txt     # Python 依赖
```

## 安装与运行

### 1. 安装 Python 依赖

```bash
pip install -r requirements.txt
```

### 2. 安装 Node.js 依赖

```bash
npm install
```

### 3. 运行应用

```bash
npm run dev
```

或者分别启动：

```bash
# 启动 Python 后端
python backend/server.py

# 启动 Electron（新终端）
npm start
```

## 使用说明

### 图像识别

1. 点击"打开图像"按钮加载古籍图像
2. 在图像上用鼠标框选要识别的汉字区域
3. 系统自动识别并显示结果、置信度和候选字
4. 可点击候选字或手动输入进行修正

### 版本校勘

1. 点击"开始校勘"按钮
2. 在各版本输入框中输入或粘贴文本
3. 点击"使用识别结果"可快速填入当前识别结果
4. 点击"对比版本"查看差异
5. 输入校勘说明后点击"保存校勘"
6. 点击"导出校勘记"可导出为 TXT/JSON/HTML 格式

### 查看历史

1. 点击"校勘记录"查看所有历史校勘记录
2. 点击记录可查看详情

## 关于 CRNN 模型

当前版本使用演示模式（随机生成汉字）进行功能展示。

要使用真实的 CRNN 模型：

1. 准备训练好的 PyTorch 模型文件
2. 修改 `backend/crnn_model.py` 中的 `load_model` 方法加载模型
3. 实现 `_real_recognize` 方法进行真实推理
4. 在 `CRNNRecognizer` 初始化时传入模型路径

## 技术栈

- **前端**: Electron, HTML5, CSS3, JavaScript
- **后端**: Python, Flask
- **数据库**: SQLite (SQLAlchemy)
- **图像处理**: Pillow, NumPy
- **OCR 模型**: CRNN (Convolutional Recurrent Neural Network)
