# NFSv4 Client Toolkit

一个用于挂载和访问 NFSv4 共享的 Python 工具包，提供命令行界面和 HTTP REST API 供前端浏览。

## 功能特性

- **NFSv4 客户端**: 基于 `libnfs` 库实现，支持挂载远程 NFSv4 共享
- **文件操作**: 支持读取文件、列出目录、获取文件元数据
- **命令行工具**: 提供直观的 CLI 界面，支持 mount/list/read/stat/serve 等命令
- **HTTP REST API**: 基于 Flask 的 RESTful API，支持前端浏览器访问
- **流式下载**: 支持大文件分块流式下载
- **文件搜索**: 支持递归搜索文件

## 前置要求

### 1. 安装 libnfs 库

本工具依赖 `libnfs` C 库及其 Python 绑定：

**macOS:**
```bash
brew install libnfs
```

**Ubuntu/Debian:**
```bash
sudo apt-get install libnfs-dev
```

**CentOS/RHEL:**
```bash
sudo yum install libnfs-devel
```

### 2. 安装 Python 绑定

```bash
pip install libnfs
```

### 3. 验证安装

```bash
nfs4-client check
```

## 安装

```bash
# 克隆项目后安装
pip install -e .

# 或者安装依赖
pip install -r requirements.txt
```

## 命令行使用

### 检查环境
```bash
nfs4-client check
```

### 测试挂载
```bash
nfs4-client mount nfs://server.example.com/export/share
```

### 列出目录
```bash
# 列出根目录
nfs4-client list nfs://server.example.com/export/share

# 列出指定目录，显示详细信息
nfs4-client ls nfs://server.example.com/export/share /documents --human-readable

# 显示隐藏文件，JSON 输出
nfs4-client ls nfs://server.example.com/export/share / -a --json
```

### 读取文件
```bash
# 读取文本文件
nfs4-client read nfs://server.example.com/export/share /notes.txt

# 读取二进制文件并保存
nfs4-client cat nfs://server.example.com/export/share /file.pdf --binary --output file.pdf
```

### 查看文件信息
```bash
nfs4-client stat nfs://server.example.com/export/share /documents
```

### 启动 HTTP API 服务
```bash
# 启动服务，监听本地 8000 端口
nfs4-client serve nfs://server.example.com/export/share

# 监听所有网络接口，指定端口
nfs4-client serve nfs://server.example.com/export/share --host 0.0.0.0 --port 8080
```

## HTTP REST API

启动服务后，可以通过以下端点访问：

### 健康检查
```
GET /api/health
```

响应示例：
```json
{
  "status": "healthy",
  "nfs_mounted": true,
  "nfs_host": "server.example.com",
  "nfs_export": "/export/share"
}
```

### 列出目录
```
GET /api/ls?path=/documents
GET /api/ls?path=/documents&hidden=true
```

响应示例：
```json
{
  "success": true,
  "path": "/documents",
  "count": 5,
  "files": [
    {
      "name": "reports",
      "path": "/documents/reports",
      "is_dir": true,
      "size": 4096,
      "mode": 16877,
      "mode_str": "drwxr-xr-x",
      "uid": 1000,
      "gid": 1000,
      "mtime": 1717200000,
      "mtime_str": "Wed Jun  1 12:00:00 2025"
    }
  ]
}
```

### 获取文件信息
```
GET /api/stat?path=/documents/report.pdf
```

### 读取文本文件
```
GET /api/read?path=/notes.txt
GET /api/read?path=/notes.txt&encoding=utf-8
```

### 下载文件
```
GET /api/download?path=/file.pdf
GET /api/download?path=/file.pdf&inline=true
```

### 搜索文件
```
GET /api/search?q=report&path=/&type=file
GET /api/search?q=doc&path=/documents&type=all&max_depth=3
```

参数说明：
- `q`: 搜索关键词（文件名包含）
- `type`: 类型过滤（`file`/`dir`/`all`）
- `max_depth`: 最大递归深度（默认 5）
- `hidden`: 是否包含隐藏文件

## Python API 使用

```python
from nfs4_client import NFS4Client

# 创建客户端
client = NFS4Client("nfs://server.example.com/export/share")

# 挂载
client.mount()

# 列出目录
files = client.listdir("/")
for f in files:
    print(f"{f.name} ({f.size} bytes)")

# 读取文件
content = client.read_file("/notes.txt")
print(content)

# 分块读取大文件
for chunk in client.read_file_chunked("/large_file.iso"):
    process_chunk(chunk)

# 递归遍历
for dirpath, dirnames, filenames in client.walk("/"):
    print(f"Directory: {dirpath}")
    for f in filenames:
        print(f"  File: {f}")

# 使用上下文管理器（自动挂载和卸载）
with NFS4Client("nfs://server.example.com/export/share") as client:
    content = client.read_file("/notes.txt")

# 卸载
client.umount()
```

## 项目结构

```
p213/
├── nfs4_client/
│   ├── __init__.py       # 包初始化
│   ├── __main__.py       # 支持 python -m 运行
│   ├── nfs_client.py     # NFSv4 客户端核心模块
│   ├── cli.py            # 命令行界面
│   └── api.py            # HTTP REST API
├── requirements.txt      # Python 依赖
├── setup.py              # 安装脚本
├── pyproject.toml        # 项目配置
└── README.md             # 本文档
```

## 核心模块说明

### [nfs_client.py](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p213/nfs4_client/nfs_client.py)

核心 NFSv4 客户端实现，提供：
- `NFS4Client` 类：管理 NFS 连接和操作
- `NFSFileInfo` 数据类：封装文件元数据
- 支持上下文管理器自动管理连接

### [cli.py](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p213/nfs4_client/cli.py)

命令行界面实现，提供：
- `check`: 检查 libnfs 安装
- `mount`: 测试挂载 NFS 共享
- `list`/`ls`: 列出目录内容
- `read`/`cat`: 读取文件内容
- `stat`: 查看文件元数据
- `serve`: 启动 HTTP API 服务

### [api.py](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p213/nfs4_client/api.py)

HTTP REST API 实现，基于 Flask 框架，提供：
- 健康检查端点
- 目录浏览端点
- 文件读取和下载端点
- 文件搜索端点
- CORS 支持

## 注意事项

1. **NFS 版本**: 本工具支持 NFSv3 和 NFSv4，取决于服务端配置
2. **权限**: 确保 NFS 服务器允许客户端 IP 访问
3. **防火墙**: 确保端口 111 (portmapper) 和 2049 (NFS) 已开放
4. **性能**: 大文件传输建议使用分块读取 (`read_file_chunked`)
5. **线程安全**: NFS 上下文不是线程安全的，多线程环境请为每个线程创建独立客户端

## 故障排除

### 挂载失败
- 检查 NFS 服务器是否运行
- 检查网络连接和防火墙
- 确认 `/etc/exports` 配置正确

### 权限被拒
- 检查 NFS 导出配置中的权限设置
- 确认 UID/GID 映射正确

### 性能问题
- 调整 `read_size` 参数（默认 1MB）
- 使用 `auto_mount=True` 减少重复挂载开销
- 考虑启用 NFS 客户端缓存

## License

MIT License
