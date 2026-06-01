# GMR帧解析系统

## 项目概述

GMR (GEO Mobile Radio) 帧解析系统，用于解析GMR协议的超帧、复帧、基本帧结构，提取BCH码和业务时隙，计算同步状态，并通过前端界面展示时隙占用图。

## 功能特性

### 后端功能
- **帧结构解析**：支持超帧（36个复帧）、复帧（32个基本帧）、基本帧（24个时隙）
- **BCH编解码**：BCH(63,51,2) 编码和译码，支持错误检测和纠正
- **同步检测**：基于同步字的帧同步检测，支持多级同步状态计算
- **时隙分类**：信令时隙、业务时隙、空闲时隙、保护时隙
- **RESTful API**：基于Flask的API接口，支持十六进制数据和二进制文件解析

### 前端功能
- **时隙占用图**：可视化展示所有时隙的占用状态
- **BCH码信息**：显示BCH码的解码结果和错误统计
- **业务时隙列表**：展示占用的业务时隙详细信息
- **统计信息**：同步率、占用率、时隙分布等统计数据
- **测试数据生成**：可配置的测试数据生成器

## 项目结构

```
p284/
├── backend/
│   ├── app.py                  # Flask API服务
│   ├── gmr_parser.py         # GMR帧解析核心模块
│   ├── test_data_generator.py # 测试数据生成器
│   ├── test_parser.py        # 单元测试
│   ├── requirements.txt    # Python依赖
│   └── start_server.sh   # 启动脚本
├── frontend/
│   ├── index.html        # 前端页面
│   ├── styles.css       # 样式文件
│   └── app.js         # 前端逻辑
└── README.md
```

## 快速开始

### 方式一：使用启动脚本（推荐）

```bash
cd backend
chmod +x start_server.sh
./start_server.sh
```

### 方式二：手动启动

1. **安装依赖**
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

2. **运行测试**
```bash
python test_parser.py
```

3. **启动后端服务**
```bash
python app.py
```

4. **打开前端页面**

直接在浏览器中打开 `frontend/index.html`

## API接口

### 健康检查
```
GET /api/health
```

### 获取常量配置
```
GET /api/constants
```

### 解析十六进制数据
```
POST /api/parse/hex
Content-Type: application/json

{
    "hex_data": "..."
}
```

### 解析二进制文件
```
POST /api/parse/binary
Content-Type: multipart/form-data

file: <二进制文件>
```

### 生成测试数据
```
POST /api/test/generate
Content-Type: application/json

{
    "occupancy_rate": 0.6,
    "error_rate": 0.01
}
```

### 生成并解析测试数据
```
POST /api/test/parse
Content-Type: application/json

{
    "occupancy_rate": 0.6,
    "error_rate": 0.01
}
```

### 获取同步状态
```
GET /api/sync-status
```

### 获取时隙占用数据
```
GET /api/timeslot-occupancy
```

### 获取BCH码信息
```
GET /api/bch-codes?limit=100
```

### 获取业务时隙
```
GET /api/traffic-timeslots?limit=100
```

### 获取统计信息
```
GET /api/statistics
```

## 技术栈

### 后端
- Python 3.8+
- Flask 3.0+
- bitarray
- numpy

### 前端
- 原生 JavaScript (ES6+)
- HTML5
- CSS3

## GMR帧结构

### 超帧 (Superframe)
- 大小: 36 × 38400 = 1,382,400 比特
- 包含: 36 个复帧

### 复帧 (Multiframe)
- 大小: 38400 比特
- 包含: 32 个基本帧

### 基本帧 (Basic Frame)
- 大小: 1200 比特
- 结构:
  - 同步字: 16 比特
  - BCH码: 4 × 63 = 252 比特
  - 业务时隙: 24 × 50 = 1200 比特

### 时隙类型
- **信令时隙 (0-2)**: 用于信令传输
- **业务时隙 (3-21)**: 用于业务数据传输
- **保护时隙 (22-23)**: 保护间隔

## BCH码参数

- 码长: 63 比特
- 信息位: 51 比特
- 校验位: 12 比特
- 纠错能力: 2 比特错误

## 同步状态

- **locked (已锁定)**: 90% 以上的基本帧同步成功
- **acquiring (同步中)**: 50%-90% 的基本帧同步成功
- **searching (搜索中)**: 少于 50% 的基本帧同步成功

## 许可证

MIT License
