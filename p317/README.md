# eCPRI 帧解析监控系统

一个完整的eCPRI（增强型通用公共无线接口）帧解析和监控系统，包含Python后端解析器和Web前端展示界面。

## 功能特性

### 后端（Python）
- 解析eCPRI帧的公共头部和负载
- 提取序列号、消息类型（IQ Data/Real-time Control等）
- 自动计算帧间延迟
- 按流ID统计延迟数据（平均、最大、最小）
- RESTful API接口

### 前端（Web）
- 实时展示流状态监控
- 显示每个流的延迟统计信息
- 最近帧记录表格
- 支持手动输入十六进制帧数据解析
- 自动生成测试数据功能
- 每秒自动刷新数据

## 项目结构

```
.
├── app.py              # Flask API服务
├── ecpri_parser.py     # eCPRI帧解析核心模块
├── index.html          # 前端展示页面
├── test_ecpri.py       # 单元测试
├── requirements.txt    # Python依赖
└── README.md           # 项目说明
```

## 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 启动服务

```bash
python app.py
```

### 3. 访问Web界面

打开浏览器访问：http://localhost:5000

## API 接口

### POST /api/parse
解析单个eCPRI帧

**请求体：**
```json
{
  "hex_data": "100000140001000100000000000000000000000000000000"
}
```

**响应：**
```json
{
  "success": true,
  "frame": {
    "protocol_revision": 1,
    "message_type": 0,
    "message_type_name": "IQ Data",
    "sequence_id": 1,
    "stream_id": 1,
    "latency_ms": 12.34
  }
}
```

### GET /api/streams
获取所有流的统计信息

### GET /api/frames
获取最近的帧记录

### POST /api/generate-test
生成测试数据

**请求体：**
```json
{
  "count": 50,
  "stream_count": 5,
  "delay": 0.1
}
```

## eCPRI 帧格式

### 公共头部（4字节）
| 字节 | 位 | 字段 |
|------|----|------|
| 0 | 7-4 | 协议版本 |
| 0 | 0 | C位 |
| 1 | 7-0 | 消息类型 |
| 2-3 | 15-0 | 负载长度 |

### 消息类型
- 0: IQ Data
- 1: Bit Sequence
- 2: Real-time Control Data
- 3-7: 其他类型

## 运行测试

```bash
python test_ecpri.py -v
```

## 使用说明

1. **手动解析帧**：在输入框中输入十六进制eCPRI帧数据，点击"解析帧"
2. **生成测试数据**：设置帧数和流数，点击"生成测试数据"
3. **查看流状态**：左侧面板显示各流的延迟统计
4. **查看帧记录**：底部表格显示最近的帧详细信息
5. **自动刷新**：默认开启每秒自动刷新，可手动关闭
