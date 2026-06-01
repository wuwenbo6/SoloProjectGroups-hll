# SQLIDS - SQL Injection Detection System

基于 libpcap 的实时 SQL 注入检测工具，支持 HTTP 流量监控和主动阻断。

## 功能特性

### 核心检测功能
- 实时网络抓包（基于 libpcap）
- **TCP 流重组**：解决分片包特征跨包漏报问题
- HTTP 请求解析（GET/POST/PUT/DELETE 等）
- **双引擎检测**：
  - 正则表达式匹配（15+ 内置规则）
  - **机器学习异常检测**（字符频率、n-gram分析、信息熵、关键词权重）
- 综合评分机制（正则60% + 异常40%）
- 主动阻断（发送 TCP RST 包）

### 管理功能
- **Web 管理界面**（Dashboard 仪表盘、实时报警、配置查看）
- **SQLite 数据库存储**报警记录
- **报警导出**（CSV/JSON 格式）
- 日志记录
- IP 白名单支持
- 流超时自动清理

## 依赖

- libpcap 开发库
- SQLite3 开发库
- pthread 线程库
- GCC 编译器

## 编译

```bash
make
```

## 使用方法

需要 root 权限运行。

### 基本使用

```bash
# 监控 eth0 网卡的 80 端口
sudo ./sqlids -i eth0

# 启用机器学习检测 + Web管理界面
sudo ./sqlids -i eth0 -m -W

# 监控指定端口并启用阻断模式
sudo ./sqlids -i eth0 -p 8080 -b

# 完整功能: ML检测 + Web界面 + 阻断 + 日志
sudo ./sqlids -i any -m -W -P 8080 -b -l sqlids.log

# 自定义异常阈值
sudo ./sqlids -i eth0 -m -t 0.6

# 使用白名单并记录日志
sudo ./sqlids -i any -w whitelist.txt -l sqlids.log

# 启用详细输出
sudo ./sqlids -i eth0 -v
```

### 命令行选项

- `-i, --interface`：指定网卡接口（默认: any）
- `-p, --port`：指定 HTTP 端口（默认: 80）
- `-l, --log`：指定日志文件路径（默认: stdout）
- `-d, --db`：指定 SQLite 数据库文件（默认: sqlids.db）
- `-w, --whitelist`：指定白名单文件
- `-b, --block`：启用阻断模式，检测到 SQL 注入时发送 RST 包
- `-m, --ml`：启用机器学习异常检测
- `-t, --threshold`：设置异常检测阈值（默认: 0.7）
- `-W, --web`：启用 Web 管理界面
- `-P, --web-port`：Web 管理界面端口（默认: 8080）
- `-v, --verbose`：启用详细输出
- `-h, --help`：显示帮助信息

## 白名单配置

白名单文件格式：

```
# 注释行以 # 开头
# 格式: IP_ADDRESS [PORT]

# 信任的服务器（所有端口）
192.168.1.100

# 指定端口
192.168.1.101 8080
```

## 技术实现

### TCP 流重组

为解决 SQL 注入特征跨 TCP 分段导致的漏报问题，实现了完整的 TCP 流追踪机制：

1. **流表管理**：基于四元组（源IP/目的IP/源端口/目的端口）追踪 TCP 连接
2. **序列号排序**：按 TCP 序列号排序缓存分段数据
3. **动态缓冲区**：自动扩展重组缓冲区（最大 1MB）
4. **增量检测**：每收到新分段都进行重组和检测
5. **超时清理**：30秒无活动的流自动清理，防止内存泄漏

### SQL 注入检测规则

内置检测规则包括：

- 经典 SQL 注入（OR/AND 条件注入）
- UNION SELECT 注入
- 数据库操作语句（SELECT/INSERT/DELETE/UPDATE/DROP）
- SQL 注释注入
- 多语句注入
- 存储过程注入
- 时间盲注
- 函数盲注
- 信息收集注入
- 文件操作注入

## 重要限制说明

### HTTPS 流量无法解密

**本工具无法直接检测 HTTPS 流量**，原因：

1. **TLS/SSL 加密**：HTTPS 流量经过端到端加密，中间人无法直接读取明文
2. **需要 MITM（中间人攻击）**：若需检测 HTTPS，必须实现 SSL 终止代理

#### 可能的 HTTPS 检测方案

| 方案 | 说明 | 优缺点 |
|------|------|--------|
| **反向代理模式** | 将 SQLIDS 部署在反向代理（如 Nginx）后面 | ✓ 不侵入客户端<br>✓ 可获明文<br>✗ 需修改网络架构 |
| **SSL MITM 代理** | 实现代理服务器（类似 Burp/Charles），动态签发证书 | ✓ 完全透明检测<br>✗ 需要客户端信任根证书<br>✗ 违反安全政策风险 |
| **集成 WAF** | 在应用层集成（如 Apache/Nginx 模块） | ✓ 精准检测<br>✗ 需修改 Web 服务器配置 |
| **HTTP/2 明文** | 部分内网环境使用明文 HTTP/2 | ✓ 高性能<br>✗ 仅限特定场景 |

**推荐架构**：在 Load Balancer / WAF 层解密后，将流量镜像给 SQLIDS 检测。

## 输出示例

```
[2024-05-24 10:30:00] [INFO] SQLIDS starting...
[2024-05-24 10:30:00] [INFO] Interface: eth0
[2024-05-24 10:30:00] [INFO] Port: 80
[2024-05-24 10:30:00] [INFO] Block mode: ON
[2024-05-24 10:30:00] [INFO] Whitelist entries: 3
[2024-05-24 10:30:00] [INFO] SQLi patterns loaded: 15
[2024-05-24 10:30:15] [DEBUG] HTTP GET /index.php from 192.168.1.100:12345 (stream reassembled, 1024 bytes)
[2024-05-24 10:30:15] [ALERT] SQL Injection detected from 192.168.1.100:12345 -> 10.0.0.1:80
[2024-05-24 10:30:15] [ALERT]   Method: GET
[2024-05-24 10:30:15] [ALERT]   URI: /index.php?id=1' OR '1'='1
[2024-05-24 10:30:15] [INFO] RST packet sent to block connection
```

## 注意事项

1. 本工具需要 root 权限运行（用于 libpcap 抓包和 RAW Socket 发 RST 包）
2. 阻断模式（-b）会发送伪造的 RST 包，可能影响正常连接
3. 正则表达式匹配可能产生误报，建议配合白名单使用
4. **仅支持 HTTP 明文流量**，HTTPS 需要额外的解密层
5. TCP 流重组最大缓冲区 1MB，适用于常规 Web 请求
6. 生产环境使用前请充分测试并调整检测规则

## 项目结构

```
.
├── Makefile          # 编译配置
├── sqlids.h          # 头文件和数据结构定义
├── main.c            # 主程序入口和参数解析
├── capture.c         # libpcap 抓包和流处理
├── stream.c          # TCP 流追踪和重组
├── http.c            # HTTP 请求解析
├── sqli.c            # 正则表达式 SQL 注入检测
├── ml.c              ✨ 机器学习异常检测
├── rst.c             # RST 包发送
├── database.c        ✨ SQLite 数据库存储
├── export.c          ✨ 报警导出（CSV/JSON）
├── webserver.c       ✨ 嵌入式 Web 服务器
├── utils.c           # 工具函数（日志、白名单）
├── whitelist.txt     # 白名单示例
└── README.md         # 使用说明
```
