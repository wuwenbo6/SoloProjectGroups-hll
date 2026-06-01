# ZooKeeper 监控系统

一个基于 Node.js + net 模块实现的 ZooKeeper 监控工具，通过四字命令（4LW）监控 ZooKeeper 集群状态。

## 功能特性

- **节点状态监控**：实时监控 ZooKeeper 节点的在线/离线状态
- **延迟监控**：显示最小/平均/最大延迟
- **未处理请求**：监控 Outstanding 请求数量，超过阈值自动告警
- **集群模式识别**：自动识别 Leader/Follower/Standalone 模式
- **WebSocket 实时推送**：服务端主动推送，避免轮询空白
- **Prometheus 格式导出**：`/metrics` 端点支持 Prometheus 抓取
- **自动基线告警**：延迟/未处理请求超过历史均值 2 倍自动告警
- **历史趋势图**：SVG 折线图展示最近 20 个采样点的延迟趋势
- **自定义节点**：支持添加自定义监控节点（本地存储）
- **响应式设计**：支持桌面和移动端

## 技术栈

- **后端**：Node.js + Express + net 模块 + ws (WebSocket)
- **前端**：原生 HTML/CSS/JavaScript
- **通信协议**：ZooKeeper 四字命令（4LW）
- **监控协议**：Prometheus exposition format

## 项目结构

```
.
├── package.json          # 项目配置
├── server.js           # Express 服务器
├── zookeeperClient.js # ZooKeeper 客户端
├── public/
│   ├── index.html    # 前端页面
│   ├── style.css   # 样式文件
│   └── app.js      # 前端逻辑
└── README.md         # 说明文档
```

## 安装与运行

### 1. 安装依赖

```bash
npm install
```

### 2. 启动服务

```bash
npm start
```

服务默认运行在 http://localhost:3000

### 3. 访问监控页面

打开浏览器访问 http://localhost:3000

## 配置说明

### 修改默认监控节点

编辑 [server.js](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p152/server.js#L13-L17) 中的 `zkHosts` 数组：

```javascript
const zkHosts = [
  { host: 'localhost', port: 2181 },
  { host: 'localhost', port: 2182 },
  { host: 'localhost', port: 2183 }
];
```

### 修改服务端口

通过环境变量指定端口：

```bash
PORT=8080 npm start
```

## API 接口

### 获取所有节点状态

```
GET /api/status
```

### 获取指定节点状态

```
GET /api/status?host=localhost&port=2181
```

### stat 命令

```
GET /api/stat?host=localhost&port=2181
```

### mntr 命令

```
GET /api/mntr?host=localhost&port=2181
```

### srvr 命令

```
GET /api/srvr?host=localhost&port=2181
```

### ruok 命令

```
GET /api/ruok?host=localhost&port=2181
```

### 通用四字命令

```
GET /api/command/:cmd?host=localhost&port=2181
```

支持的命令：`stat`, `mntr`, `srvr`, `ruok`, `conf`, `cons`, `dump`, `envi`, `reqs`, `wchs`, `wchp`, `wchc`, `dirs`, `crst`, `frst`, `isro`, `gtmk`, `stmk`, `hash`, `kill`

## ZooKeeper 四字命令说明

| 命令 | 说明 |
|------|------|
| `stat` | 服务器和连接客户端的基本信息 |
| `mntr` | 监控指标（推荐用于监控系统） |
| `srvr` | 服务器的完整信息 |
| `ruok` | 检查服务器是否正常运行 |
| `conf` | 服务器配置信息 |
| `cons` | 连接客户端的详细信息 |
| `dump` | 未处理的会话和临时节点 |
| `envi` | 服务器环境信息 |
| `reqs` | 未处理的请求 |
| `wchs` | Watch 统计信息 |
| `wchp` | 按路径列出 Watch |
| `wchc` | 按客户端列出 Watch |
| `dirs` | 日志和快照文件大小 |
| `crst` | 重置连接统计 |
| `frst` | 重置 Watch 统计 |
| `isro` | 检查是否为只读模式 |
| `gtmk` | 获取跟踪掩码 |
| `stmk` | 设置跟踪掩码 |
| `hash` | 最新 ZNode 树的哈希值 |
| `kill` | 关闭服务器 |

## 监控指标说明

### 核心指标

- **节点数量**：ZNode 总数
- **连接数**：当前客户端连接数
- **接收请求**：累计接收请求数
- **发送响应**：累计发送响应数
- **未处理请求**：Outstanding 请求数（超过 10 黄色告警，超过 100 红色告警）
- **延迟**：最小/平均/最大响应延迟（ms）

### mntr 详细指标

- `zk_avg_latency`：平均延迟
- `zk_max_latency`：最大延迟
- `zk_min_latency`：最小延迟
- `zk_packets_received`：接收包数
- `zk_packets_sent`：发送包数
- `zk_num_alive_connections`：活跃连接数
- `zk_outstanding_requests`：未处理请求数
- `zk_znode_count`：ZNode 数量
- `zk_watch_count`：Watch 数量
- `zk_ephemerals_count`：临时节点数量
- `zk_approximate_data_size`：数据大小
- `zk_open_file_descriptor_count`：打开文件描述符数

## 自动基线告警

系统自动计算历史基线并触发告警：

### 告警类型

| 告警ID | 级别 | 触发条件 |
|--------|------|----------|
| `high_latency` | warning | 平均延迟 > 历史均值 × ALERT_THRESHOLD |
| `high_outstanding` | error | 未处理请求 > 历史均值 × ALERT_THRESHOLD (且 > 10) |
| `critical_latency` | error | 平均延迟 > 1000ms |
| `critical_outstanding` | error | 未处理请求 > 1000 |

### 基线计算

- 使用最近 `HISTORY_WINDOW` 个采样点计算历史均值
- 服务启动后需要积累至少一个采样点才会触发基线告警
- 基线随数据积累自动更新

## Prometheus 集成

### 配置 Prometheus 抓取

在 `prometheus.yml` 中添加：

```yaml
scrape_configs:
  - job_name: 'zookeeper-monitor'
    static_configs:
      - targets: ['localhost:3000']
    scrape_interval: 5s
```

### 示例告警规则

```yaml
groups:
  - name: zookeeper_alerts
    rules:
      - alert: ZooKeeperDown
        expr: zookeeper_up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "ZooKeeper 节点 {{ $labels.host }}:{{ $labels.port }} 离线"

      - alert: HighLatency
        expr: zookeeper_latency_avg_ms > 100
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "ZooKeeper 延迟过高"
          description: "节点 {{ $labels.host }}:{{ $labels.port }} 平均延迟 {{ $value }}ms"
```

## WebSocket 协议

连接地址：`ws://<host>:<port>/ws`

### 服务端推送消息

| 类型 | 说明 |
|------|------|
| `connected` | 连接成功，包含 clientId 和配置参数 |
| `initial` | 初始状态数据 |
| `update` | 定时推送的状态更新 |
| `nodeAdded` / `nodeRemoved` | 节点操作确认 |
| `intervalUpdated` | 推送间隔更新确认 |
| `error` | 错误消息 |

### 客户端发送消息

| 类型 | 载荷 | 说明 |
|------|------|------|
| `addNode` | `{ host, port }` | 添加自定义节点 |
| `removeNode` | `{ host, port }` | 移除自定义节点 |
| `setPushInterval` | `{ interval }` | 设置推送间隔 |
| `refresh` | - | 请求立即刷新 |

## 注意事项

1. 确保 ZooKeeper 服务器已启用四字命令（默认启用）
2. 确保防火墙允许访问 ZooKeeper 的客户端端口（默认 2181）
3. 生产环境建议限制可访问的四字命令列表
4. 监控频率建议不低于 2 秒，避免对 ZooKeeper 造成过大压力

## License

ISC
