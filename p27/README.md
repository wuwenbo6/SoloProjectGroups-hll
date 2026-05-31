# Logtail Search - 实时日志搜索工具

一个基于Rust的CLI工具，提供实时日志监控、倒排索引搜索和Web界面功能。

## 功能特性

- 📝 **实时Tail日志**: 使用文件系统事件监控日志文件变化
- 📦 **Zstandard压缩**: 自动将日志数据用Zstandard算法压缩存储，支持动态字典训练
- 🔍 **倒排索引**: 构建关键字到位置的倒排索引，实现快速搜索，支持中文分词
- 🌐 **HTTP服务**: 提供RESTful API进行搜索查询
- 📄 **多文件合并**: 支持同时监控和搜索多个日志文件
- ✨ **高亮显示**: Web界面搜索结果关键词高亮，支持上下文查看
- 🔐 **AES-GCM加密**: 支持AES-256-GCM加密存储压缩数据
- ☁️ **S3兼容存储**: 支持上传压缩文件到S3兼容的分布式存储
- 📤 **导出功能**: 支持导出解压后的日志片段（JSON/TXT/CSV格式）

## 项目结构

```
p27/
├── Cargo.toml              # Rust项目配置
├── src/
│   ├── main.rs            # 程序入口
│   ├── cli.rs             # CLI参数解析
│   ├── index.rs           # 倒排索引实现
│   ├── tail.rs            # 日志文件tail监控
│   ├── server.rs          # HTTP服务和API
│   └── storage.rs         # Zstandard压缩存储
├── static/
│   └── index.html         # 前端搜索界面
└── test_logs/
    ├── app1.log           # 测试日志1
    └── app2.log           # 测试日志2
```

## 安装依赖

### 1. 安装Rust

```bash
# 使用rustup安装Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 配置环境变量
source $HOME/.cargo/env
```

### 2. 编译项目

```bash
cargo build --release
```

## 使用方法

### 基本使用

```bash
# 监控单个日志文件
cargo run -- -f /var/log/app.log

# 监控多个日志文件
cargo run -- -f test_logs/app1.log -f test_logs/app2.log

# 指定主机和端口
cargo run -- -f test_logs/*.log -h 0.0.0.0 -p 8080

# 禁用压缩
cargo run -- -f test_logs/*.log --no-compress
```

### 命令行参数

| 参数 | 缩写 | 默认值 | 说明 |
|------|------|--------|------|
| `--files` | `-f` | 必填 | 要监控的日志文件路径（可多个） |
| `--host` | `-h` | 127.0.0.1 | HTTP服务监听地址 |
| `--port` | `-p` | 3000 | HTTP服务监听端口 |
| `--compress` | `-c` | true | 是否启用Zstandard压缩 |

## API接口

### 1. 搜索接口

```
GET /api/search?q=<keyword>&context=<lines>
```

**参数:**
- `q`: 搜索关键词（必填）
- `context`: 上下文行数（可选，默认2）

**响应示例:**
```json
{
  "success": true,
  "data": {
    "keyword": "error",
    "positions": [...],
    "lines": [
      {
        "file": "test_logs/app1.log",
        "line_number": 7,
        "content": "2024-01-15 10:00:20 ERROR Failed to connect...",
        "context_before": [...],
        "context_after": [...]
      }
    ]
  },
  "error": null
}
```

### 2. 文件列表接口

```
GET /api/files
```

返回当前监控的所有日志文件列表。

### 3. 健康检查接口

```
GET /api/health
```

## Web界面

启动服务后，在浏览器访问 `http://localhost:3000` 即可使用Web搜索界面：

- **实时搜索**: 输入关键词即输即搜
- **上下文调整**: 可选择显示0-5行上下文
- **结果高亮**: 匹配关键词黄色高亮显示
- **多文件支持**: 自动合并显示所有文件的搜索结果

## 技术实现

### 倒排索引

倒排索引使用 `HashMap<String, Vec<LinePosition>>` 结构：
- Key: 小写关键词
- Value: 该关键词出现的所有位置列表（文件、行号、偏移）

### Zstandard压缩

每行日志独立压缩，存储格式：
```
[4字节长度][压缩数据][4字节长度][压缩数据]...
```

### 文件监控

使用 `notify` crate监控文件系统事件，支持：
- 实时检测文件新增内容
- 处理文件截断（log rotation）
- 多文件并行监控

## 测试

```bash
# 1. 启动服务
cargo run -- -f test_logs/app1.log -f test_logs/app2.log

# 2. 测试API搜索
curl "http://localhost:3000/api/search?q=error&context=2"

# 3. 添加新日志行测试实时tail
echo "2024-01-15 10:05:00 ERROR Test error message" >> test_logs/app1.log

# 4. 再次搜索验证新内容已被索引
curl "http://localhost:3000/api/search?q=test"

# 5. 测试中文搜索
curl "http://localhost:3000/api/search?q=错误&context=2"
```

## 更新日志

### v0.2.0 (修复版本)
- **修复中文分词问题**: 集成 `jieba-rs` 中文分词库，支持中英文混合搜索
- **修复压缩字典问题**: 实现Zstandard动态字典训练与更新机制，提高压缩率
  - 自动收集日志样本
  - 100行样本后训练初始字典
  - 每1000行样本更新字典
  - 字典文件持久化存储
- **改进前端高亮**: 支持多关键词和中文子串高亮

## 性能特点

- **低内存占用**: 仅存储索引，原始内容可从压缩文件恢复
- **快速搜索**: 倒排索引实现O(1)关键词查找
- **高压缩率**: Zstandard+字典训练相比gzip有更好的压缩率
- **实时更新**: 索引随日志追加实时更新
- **数据安全**: 可选AES-256-GCM加密保护数据
- **分布式存储**: 支持S3兼容对象存储持久化
- **灵活导出**: 支持多种格式导出搜索结果

## 许可证

MIT
