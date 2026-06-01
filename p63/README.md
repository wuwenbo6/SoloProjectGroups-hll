# 文档转换服务 (Document Converter)

基于 Node.js + LibreOffice Headless 的文档转换服务，支持将 ODT/DOCX 文档转换为 PDF/HTML 格式。

## 功能特性

- 📁 **文件上传**: 支持拖拽和点击上传 ODT/DOCX/DOC 格式文档
- 🔄 **格式转换**: 支持转换为 PDF 和 HTML 格式
- 🚦 **并发队列**: 支持并发转换（默认同时处理 2 个任务）
- 💾 **数据持久化**: SQLite 数据库存储转换记录
- 👁️ **在线预览**: PDF.js 实现 PDF 在线预览（支持翻页）
- 📥 **文件下载**: 转换完成后可直接下载结果文件

## 系统要求

- Node.js 16+
- LibreOffice（必须已安装）

### 安装 LibreOffice

**macOS**:
```bash
brew install --cask libreoffice
```

**Ubuntu/Debian**:
```bash
sudo apt-get install libreoffice
```

**Windows**:
从官网下载并安装: https://www.libreoffice.org/

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动服务

```bash
npm start
```

开发模式（自动重启）:
```bash
npm run dev
```

### 3. 访问应用

打开浏览器访问: http://localhost:3000

## API 接口

### 上传并转换文档

```
POST /api/convert
Content-Type: multipart/form-data

Parameters:
- document: 文档文件 (ODT/DOCX/DOC)
- format: 输出格式 ('pdf' 或 'html')

Response:
{
  "jobId": "uuid",
  "status": "queued",
  "message": "Conversion job has been queued"
}
```

### 查询转换状态

```
GET /api/status/:jobId

Response:
{
  "jobId": "uuid",
  "status": "pending|queued|processing|completed|failed",
  "originalFilename": "document.docx",
  "format": "pdf",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "completedAt": "2024-01-01T00:00:05.000Z",
  "errorMessage": null
}
```

### 下载转换结果

```
GET /api/download/:jobId
```

### 预览转换结果

```
GET /api/preview/:jobId
```

### 获取所有转换任务

```
GET /api/conversions
```

### 删除转换任务

```
DELETE /api/conversions/:jobId
```

### 获取队列状态

```
GET /api/queue/status

Response:
{
  "queued": 0,
  "processing": 0
}
```

## 项目结构

```
.
├── server.js              # 主服务器文件
├── package.json           # 项目配置
├── database/
│   └── db.js             # SQLite 数据库配置
├── services/
│   ├── converter.js      # LibreOffice 转换服务
│   └── conversionQueue.js # 并发队列管理
├── frontend/
│   ├── index.html        # 前端页面
│   ├── styles.css        # 样式文件
│   └── app.js            # 前端逻辑
├── uploads/              # 上传文件目录
├── downloads/            # 转换结果目录
└── database/             # 数据库文件目录
```

## 配置说明

### 环境变量配置

可以通过环境变量自定义配置：

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `PORT` | 服务端口 | 3000 |
| `MAX_FILE_SIZE` | 最大文件大小（MB） | 500 |
| `CONVERSION_TIMEOUT` | 转换超时时间（毫秒） | 600000 (10分钟) |
| `EXTRA_FONT_DIR` | 额外字体目录（多目录用分隔符分隔） | 无 |

示例：
```bash
PORT=8080 MAX_FILE_SIZE=1000 CONVERSION_TIMEOUT=1200000 npm start
```

### 修改并发数

编辑 `services/conversionQueue.js`:

```javascript
module.exports = new ConversionQueue(4); // 修改为同时处理 4 个任务
```

### 修改文件大小限制

使用环境变量（推荐）:
```bash
MAX_FILE_SIZE=1000 npm start  # 1GB
```

或编辑 `server.js`:

```javascript
const maxFileSize = 1000 * 1024 * 1024; // 1GB
```

## 中文字体问题

### 问题现象
转换包含中文的文档时，PDF 中的中文显示为方块或乱码。

### 原因
LibreOffice 在 headless 模式下运行时，无法找到系统中的中文字体。

### 解决方案

**1. 安装中文字体**

**macOS**:
- 系统通常已自带中文字体（如 PingFang SC）
- 如需额外字体，可从 Font Book 添加

**Ubuntu/Debian**:
```bash
sudo apt-get install fonts-wqy-microhei fonts-wqy-zenhei fonts-noto-cjk
```

**CentOS/RHEL**:
```bash
sudo yum install wqy-microhei-fonts wqy-zenhei-fonts
```

**2. 指定额外字体目录**

如果字体安装在非标准位置，可以通过环境变量指定：

```bash
EXTRA_FONT_DIR="/path/to/your/fonts:/another/font/path" npm start
```

**3. 常见字体目录**

系统会自动搜索以下字体目录：
- macOS: `/System/Library/Fonts`, `/Library/Fonts`, `~/Library/Fonts`
- Linux: `/usr/share/fonts`, `/usr/local/share/fonts`, `~/.fonts`
- Windows: `C:\Windows\Fonts`

**4. 验证字体识别**

启动服务时，控制台会显示检测到的字体目录：
```
Font directories: /System/Library/Fonts, /Library/Fonts
```

## 大文件转换

### 默认配置
- 最大文件大小：500MB
- 转换超时时间：10分钟

### 处理大文件

如果需要转换更大的文件：

```bash
# 支持 2GB 文件，超时 30 分钟
MAX_FILE_SIZE=2000 CONVERSION_TIMEOUT=1800000 npm start
```

### 性能建议

1. **增加并发数**：如果服务器性能好，可以同时处理更多任务
2. **使用 SSD**：大文件转换时磁盘 IO 很重要
3. **足够内存**：建议至少 4GB 可用内存
4. **分批处理**：超大文件建议分批转换

## 注意事项

1. 确保 LibreOffice 已正确安装并可在命令行中执行 `soffice` 命令
2. 大文件转换可能需要较长时间，请耐心等待
3. 转换队列默认最大并发数为 2，可根据服务器性能调整
4. 上传的文件和转换结果会保存在本地目录中，请定期清理
5. 中文字体请确保系统已安装，否则转换后会乱码

## 故障排查

### 转换失败

1. 检查 LibreOffice 是否安装: `soffice --version`
2. 查看服务器控制台的错误日志
3. 确认输入文件格式是否受支持
4. 检查磁盘空间是否充足

### 中文乱码

1. 确认系统已安装中文字体
2. 检查服务启动日志中的字体目录列表
3. 尝试使用 `EXTRA_FONT_DIR` 指定字体路径
4. 重启 LibreOffice 进程（`killall soffice`）

### 转换超时

1. 增加 `CONVERSION_TIMEOUT` 环境变量的值
2. 检查文件是否过大或损坏
3. 确认服务器性能是否足够

### npm 安装失败

如果遇到权限问题，可以尝试:
```bash
mkdir -p .npm-cache
npm_config_cache=.npm-cache npm install
```

## License

MIT
