# EtherNet/IP 标签读写工具

一个用于解析 EtherNet/IP 帧并提供标签读写操作的完整工具包，包含 Python 后端和 Web 前端。

## 功能特性

- ✅ **EtherNet/IP 帧解析** - 解析封装头 (ENIP Header) 和 CIP 消息
- ✅ **连接路径提取** - 解析 CIP 连接路径段
- ✅ **标签读写操作** - 支持多种 CIP 数据类型的读写
- ✅ **Web 管理界面** - 美观的前端界面进行操作
- ✅ **REST API** - 完整的 API 接口供编程调用

## 项目结构

```
p278/
├── backend/
│   ├── __init__.py
│   ├── enip_parser.py    # ENIP/CIP 解析核心模块
│   └── app.py            # Flask API 服务器
├── frontend/
│   ├── index.html        # 主页面
│   ├── style.css         # 样式文件
│   └── app.js            # 前端逻辑
├── test_parser.py        # 解析器测试脚本
├── requirements.txt      # Python 依赖
└── README.md
```

## 安装

```bash
# 克隆或下载项目
cd p278

# 安装 Python 依赖
pip install -r requirements.txt
```

## 快速开始

### 1. 运行后端服务

```bash
cd backend
python app.py
```

后端服务将在 `http://localhost:5000` 启动。

### 2. 打开前端界面

直接在浏览器中打开 `frontend/index.html` 文件，或者使用一个简单的 HTTP 服务器：

```bash
# 方式1: 直接打开
open frontend/index.html

# 方式2: 使用 Python HTTP 服务器
cd frontend
python -m http.server 8080
# 然后访问 http://localhost:8080
```

## 使用说明

### 功能模块

#### 1. 连接配置
- 输入 PLC 的 IP 地址和端口（默认 44818）
- 点击"连接"建立 EtherNet/IP 会话
- 连接成功后可进行标签操作

#### 2. 标签读写
- **读取标签**：输入标签名称和数据类型，点击读取
- **写入标签**：输入标签名称、数据类型和值，点击写入
- **操作历史**：记录所有读写操作

#### 3. 报文解析
- 输入十六进制的 EtherNet/IP 报文
- 点击"解析报文"查看详细解析结果
- 支持加载示例报文进行测试

### 支持的 CIP 数据类型

| 类型 | 说明 | 字节数 |
|------|------|--------|
| BOOL | 布尔值 | 1 |
| SINT | 8位有符号整数 | 1 |
| INT | 16位有符号整数 | 2 |
| DINT | 32位有符号整数 | 4 |
| LINT | 64位有符号整数 | 8 |
| USINT | 8位无符号整数 | 1 |
| UINT | 16位无符号整数 | 2 |
| UDINT | 32位无符号整数 | 4 |
| ULINT | 64位无符号整数 | 8 |
| REAL | 32位浮点数 | 4 |
| LREAL | 64位浮点数 | 8 |

## API 接口

### 解析报文
```http
POST /api/parse
Content-Type: application/json

{
  "hex_data": "6f00360000000000..."
}
```

### 连接 PLC
```http
POST /api/connect
Content-Type: application/json

{
  "host": "192.168.1.100",
  "port": 44818
}
```

### 读取标签
```http
POST /api/read-tag
Content-Type: application/json

{
  "session_id": "session_1234567890",
  "tag_name": "TestTag",
  "data_type": "DINT"
}
```

### 写入标签
```http
POST /api/write-tag
Content-Type: application/json

{
  "session_id": "session_1234567890",
  "tag_name": "TestTag",
  "value": 255,
  "data_type": "DINT"
}
```

### 获取示例报文
```http
GET /api/generate-example
```

### 获取数据类型列表
```http
GET /api/data-types
```

## 运行测试

```bash
python test_parser.py
```

## 技术实现

### EtherNet/IP 封装头结构

| 字段 | 字节 | 说明 |
|------|------|------|
| Command | 2 | 命令码 |
| Length | 2 | 数据长度 |
| Session Handle | 4 | 会话句柄 |
| Status | 4 | 状态码 |
| Sender Context | 8 | 发送方上下文 |
| Options | 4 | 选项 |

### CIP 消息结构

| 字段 | 字节 | 说明 |
|------|------|------|
| Service | 1 | 服务码 |
| Path Length | 1 | 路径长度（字） |
| Path | 可变 | 连接路径 |
| Data | 可变 | 请求/响应数据 |

## 代码引用

- 核心解析模块: [enip_parser.py](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p278/backend/enip_parser.py)
- API 服务器: [app.py](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p278/backend/app.py)
- 前端页面: [index.html](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p278/frontend/index.html)
- 前端脚本: [app.js](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p278/frontend/app.js)
- 测试脚本: [test_parser.py](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p278/test_parser.py)

## 注意事项

1. 确保目标 PLC 已启用 EtherNet/IP 通信
2. 确保网络连接正常且防火墙允许通信
3. 标签名称需要与 PLC 中的标签完全匹配
4. 数据类型需要与 PLC 中定义的类型一致

## 许可证

本项目仅供学习和研究使用。
