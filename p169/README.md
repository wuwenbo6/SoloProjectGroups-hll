# SIM卡ISO 7816-4文件解析器

一个基于Flask的Web应用，用于上传和解析SIM卡透明二进制文件，展示ISO 7816-4标准的文件结构（MF, DF, EF）和访问权限。

## 功能特性

- 📤 支持拖放或点击上传二进制文件
- 📁 解析ISO 7816-4文件结构（MF/DF/EF）
- 🔍 展示文件ID、名称、类型和大小
- 🔐 显示详细的访问权限信息
- 🎨 美观的树形结构展示
- 📱 响应式设计，支持移动端

## 项目结构

```
.
├── app.py                 # Flask后端应用
├── iso7816_parser.py      # ISO 7816-4文件解析模块
├── requirements.txt       # Python依赖包
├── start.sh               # 启动脚本
├── templates/
│   └── index.html        # 前端页面
├── static/               # 静态资源目录
└── uploads/              # 临时上传目录（自动创建）
```

## 快速开始

### 方法一：使用启动脚本（推荐）

```bash
./start.sh
```

### 方法二：手动启动

1. 创建虚拟环境：
```bash
python3 -m venv venv
source venv/bin/activate
```

2. 安装依赖：
```bash
pip install -r requirements.txt
```

3. 启动应用：
```bash
python app.py
```

4. 在浏览器中访问：http://localhost:5001

## 支持的文件格式

- `.bin` - 二进制文件
- `.hex` - HEX格式文件
- `.sim` - SIM卡文件
- `.dat` - 数据文件

## ISO 7816-4 文件类型

### MF (Master File) - 主文件
- 文件ID: `3F00`
- 是整个卡的根目录
- 包含所有DF和EF

### DF (Dedicated File) - 专用文件
- 类似于目录
- 包含其他DF或EF
- 常见DF:
  - `7F10` - DF TELECOM (电信目录)
  - `7F20` - DF GSM (GSM应用目录)
  - `7F21` - DF USIM (USIM应用目录)
  - `7F22` - DF ISIM (ISIM应用目录)

### EF (Elementary File) - 基本文件
- 包含实际数据
- 常见EF:
  - `6F05` - EF ICCID (集成电路卡识别码)
  - `6F07` - EF IMSI (国际移动用户识别码)
  - `6F20` - EF MSISDN (手机号码)
  - `6F30` - EF SMS (短消息)
  - `6F31` - EF ADN (缩位拨号号码)
  - `6F32` - EF FDN (固定拨号号码)

## 访问权限说明

| 权限值 | 说明 |
|--------|------|
| Always | 始终允许 |
| CHV1 | 需要PIN1验证 |
| CHV2 | 需要PIN2验证 |
| ADM1-ADM10 | 需要管理员权限 |
| Never | 禁止访问 |
| RFU | 保留 |

## API接口

### POST /api/upload
上传并解析文件

**请求:**
- `Content-Type: multipart/form-data`
- 参数: `file` - 二进制文件

**响应:**
```json
{
  "success": true,
  "file_info": {
    "filename": "example.bin",
    "size": 1024,
    "hex_preview": "00112233..."
  },
  "structure": {
    "fid": "3F00",
    "name": "MF (Master File)",
    "file_type": "MF",
    "size": 1024,
    "lifecycle": "N/A",
    "access_permissions": {...},
    "children": [...]
  }
}
```

### GET /api/sample
获取示例数据结构

## 技术栈

- **后端**: Python 3.7+, Flask
- **前端**: HTML5, CSS3, JavaScript (原生)
- **数据格式**: JSON

## 许可证

MIT License
