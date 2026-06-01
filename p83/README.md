# 视频摘要生成器

基于 Electron + Python + OpenCV 的视频摘要应用，自动检测视频中的移动目标并生成摘要视频。

## 功能特性

- 🎬 **移动目标检测**: 使用 OpenCV 背景减除算法 (MOG2) 检测视频中的运动物体
- 👥 **多目标跟踪**: 自动跟踪视频中的多个移动目标
- ⏱️ **智能摘要生成**: 自动提取多目标同时出现的时间段，拼接生成摘要视频
- 👁️ **预览功能**: 生成关键帧预览，查看分析结果
- 💾 **数据库存储**: 使用 SQLite 存储源视频信息和分析结果
- 📤 **导出功能**: 支持导出生成的摘要视频

## 技术栈

### 前端 (Electron)
- Electron 28.0.0
- sql.js (SQLite 数据库)
- HTML5 + CSS3 + JavaScript

### 后端 (Python)
- OpenCV 4.8+ (背景减除、视频处理)
- Flask 3.0+ (HTTP API)
- NumPy (数值计算)

## 安装说明

### 1. 安装 Node.js 依赖
```bash
npm install
```

### 2. 安装 Python 依赖
```bash
pip3 install -r requirements.txt
```

## 运行应用

```bash
npm start
```

开发模式（带开发者工具）:
```bash
npm run dev
```

## 使用说明

### 1. 上传视频
- 点击"选择视频文件"按钮或拖放视频文件到上传区域
- 支持格式: MP4, AVI, MOV, MKV

### 2. 分析视频
- 点击"分析视频"按钮开始检测移动目标
- 系统会使用背景减除算法检测视频中的运动物体
- 自动跟踪多目标并记录出现时间段

### 3. 预览结果
- 点击"预览"按钮查看分析结果
- 显示关键帧预览和统计信息
- 包括运动片段数量、总时长、压缩率等

### 4. 生成摘要
- 点击"生成摘要"按钮创建摘要视频
- 系统会自动拼接多目标同时出现的时间段
- 生成压缩后的摘要视频

### 5. 导出视频
- 点击"导出"按钮保存摘要视频到指定位置

## 项目结构

```
p83/
├── main.js              # Electron 主进程
├── package.json         # Node.js 依赖配置
├── database.js          # SQLite 数据库模块
├── index.html           # 应用界面
├── styles.css           # 样式文件
├── renderer.js          # 前端渲染逻辑
├── requirements.txt     # Python 依赖
├── python/
│   ├── server.py        # Flask API 服务器
│   ├── video_processor.py   # 视频处理模块
│   └── summary_generator.py # 摘要生成模块
└── README.md
```

## 核心算法

### 背景减除 (MOG2)
使用高斯混合模型进行背景建模，有效检测移动物体：
- 自适应学习率
- 阴影检测
- 形态学操作去噪

### 目标跟踪
基于质心距离的跟踪算法：
- 计算检测框质心
- 匈牙利算法匹配
- 处理目标出现/消失

### 智能摘要
- 检测多目标同时出现的时间段
- 自动合并相邻时间段
- 计算压缩率和统计信息

## 系统要求

- Node.js 16+
- Python 3.8+
- 操作系统: macOS / Windows / Linux

## 许可证

MIT License
