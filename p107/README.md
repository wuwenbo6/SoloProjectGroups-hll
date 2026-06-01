# CAN Analyzer - CAN报文分析工具

一个基于Electron和Python的CAN报文分析工具，支持自动识别信号边界、生成DBC文件等功能。

## 功能特性

- **CAN报文捕获**: 支持PCAN硬件设备和虚拟设备两种模式
- **信号自动识别**: 使用K-means聚类算法自动识别信号边界
- **DBC文件生成**: 自动生成标准的DBC数据库文件
- **报文列表展示**: 实时展示捕获的CAN报文
- **信号曲线图表**: 可视化展示信号值随时间的变化
- **手动标注功能**: 支持手动添加、编辑、删除信号定义
- **项目管理**: 基于SQLite数据库存储分析项目

## 系统要求

- Node.js >= 16.0.0
- Python >= 3.8
- npm >= 8.0.0

## 安装步骤

### 1. 安装Python依赖

```bash
pip3 install -r requirements.txt
```

### 2. 安装Node.js依赖

```bash
npm install
```

如果遇到npm权限问题：
```bash
sudo chown -R $(whoami) ~/.npm
npm install
```

## 运行应用

### 开发模式

```bash
npm run dev
```

### 普通模式

```bash
npm start
```

## 使用说明

### 1. 创建项目
- 点击"新建项目"按钮
- 输入项目名称和描述
- 选择创建的项目

### 2. 捕获CAN报文
- 选择设备模式（虚拟设备/PCAN）
- 点击"开始采集"按钮
- 采集完成后点击"停止采集"

### 3. 分析信号
- 点击"分析信号"按钮
- 系统将自动使用K-means算法识别信号边界
- 在"信号分析"标签页查看识别结果

### 4. 查看信号曲线
- 切换到"信号曲线"标签页
- 在下拉菜单中选择要查看的信号
- 查看信号值随时间的变化曲线

### 5. 手动标注信号
- 在左侧CAN ID列表中选择一个CAN ID
- 点击"手动添加信号"按钮
- 填写信号的各项参数（起始位、位长度、符号等）

### 6. 生成DBC文件
- 分析完成后点击"生成DBC"按钮
- 选择保存位置
- DBC文件将被自动生成

## 项目结构

```
p107/
├── package.json          # Node.js项目配置
├── requirements.txt      # Python依赖
├── src/
│   ├── electron/
│   │   └── main.js       # Electron主进程
│   └── renderer/
│       ├── index.html    # 前端页面
│       ├── styles.css    # 样式文件
│       └── renderer.js   # 前端逻辑
├── python/
│   ├── main.py           # Python后端入口
│   ├── can_capture.py    # CAN报文捕获模块
│   ├── signal_analyzer.py # 信号分析（K-means聚类）
│   ├── dbc_generator.py  # DBC文件生成模块
│   └── database.py       # 数据库操作模块
└── data/                 # 数据存储目录
```

## 技术栈

### 前端
- Electron: 跨平台桌面应用框架
- Chart.js: 图表库
- HTML5/CSS3/JavaScript

### 后端
- Python 3
- python-can: CAN总线通信库
- scikit-learn: 机器学习库（K-means聚类）
- numpy: 数值计算库
- SQLite: 嵌入式数据库

## K-means信号识别算法说明

本工具使用K-means聚类算法来自动识别CAN报文中的信号边界：

1. **特征提取**: 计算每个bit的变化率、位置和变化梯度
2. **肘部法则**: 自动确定最优聚类数
3. **聚类分析**: 使用K-means对bit进行聚类
4. **信号分割**: 根据聚类结果划分信号边界
5. **置信度评估**: 基于变化率、唯一性和方差评估信号质量

## 许可证

MIT License
