# 分布式追踪系统

一个基于 Go + Elasticsearch 的分布式追踪系统，支持接收 OTLP trace 数据、存储和可视化展示。

## 功能特性

- ✅ **OTLP 数据接收**: 支持 OpenTelemetry OTLP 格式的 trace 数据
- ✅ **Elasticsearch 存储**: 使用 Elasticsearch 存储 span 数据
- ✅ **Trace ID 搜索**: 支持按 Trace ID 精确搜索
- ✅ **火焰图展示**: 使用 D3.js 渲染火焰图可视化
- ✅ **服务依赖图**: 展示服务间调用关系和依赖
- ✅ **服务列表和操作筛选**: 按服务名称和操作名称筛选 traces
- ✅ **高吞吐缓冲队列**: 内置缓冲队列防止 span 丢失（支持 100K+ 队列容量）
- ✅ **Worker 池异步处理**: 多 worker 并发批量写入 Elasticsearch
- ✅ **命名空间支持**: 支持 `service.namespace` 属性防止服务名冲突
- ✅ **队列监控指标**: 实时监控队列状态、处理进度和丢失统计
- ✅ **持续采样**: 支持配置采样率，慢 Trace/错误 Trace 强制采样
- ✅ **慢 Trace 报警**: 自动检测并记录慢 Trace、慢 Span 报警
- ✅ **报警管理**: 报警列表展示、标记已解决、阈值配置
- ✅ **JSON 导出**: 支持单 Trace 和批量 Trace 导出 JSON/CSV

## 项目结构

```
.
├── backend/                    # Go 后端代码
│   ├── cmd/
│   │   └── server/
│   │       └── main.go        # 服务入口
│   ├── internal/
│   │   ├── api/                # API 处理层
│   │   ├── collector/          # OTLP 数据收集器
│   │   └── storage/            # Elasticsearch 存储层 + 缓冲队列
│   ├── pkg/
│   │   └── model/              # 数据模型
│   └── go.mod
├── static/                      # 前端静态文件
│   └── index.html              # 前端页面（火焰图、依赖图）
├── docker-compose.yml          # Docker Compose 配置
├── generate_test_data.py       # 测试数据生成脚本
└── README.md
```

## 快速开始

### 1. 启动 Elasticsearch

使用 Docker Compose 启动 Elasticsearch 和 Kibana：

```bash
docker-compose up -d
```

等待 Elasticsearch 启动完成（约 30 秒）：

```bash
curl http://localhost:9200
```

### 2. 启动后端服务

确保已安装 Go 1.21+：

```bash
cd backend
go mod download
go run cmd/server/main.go
```

服务将在 `http://localhost:8080` 启动。

### 3. 生成测试数据

打开新终端，运行测试数据生成脚本：

```bash
pip install requests
python generate_test_data.py
```

脚本提供多种模式：
- **单条模式**: 按 Enter 发送单条 trace
- **高负载模式**: 输入 `high` 发送 100 条 trace
- **持续模式**: 输入 `continuous` 持续发送

### 4. 访问前端

打开浏览器访问：`http://localhost:8080`

## API 接口

### Trace 相关

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/trace/:id` | 根据 Trace ID 获取详细信息 |
| GET | `/api/traces` | 搜索 traces (支持 service 和 operation 参数) |
| GET | `/api/traces/recent` | 获取最近的 traces |

### 服务相关

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/services` | 获取所有服务名称（包含命名空间） |
| GET | `/api/services/:service/operations` | 获取指定服务的所有操作 |
| GET | `/api/dependencies` | 获取服务依赖关系 |

### 系统监控

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| GET | `/api/stats` | 队列统计信息 |

### OTLP 接收

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/v1/traces` | 接收 OTLP JSON 格式的 trace 数据 |

## 前端功能

### 1. Trace 列表
- 查看最近的 trace 列表
- 按服务名称筛选
- 显示每个 trace 的服务标签和时长

### 2. 火焰图
- 可视化展示 trace 的调用层级
- 每个 span 按服务着色（包含命名空间区分）
- 点击 span 查看详细信息
- 鼠标悬停显示 tooltip

### 3. 服务依赖图
- 力导向图展示服务间调用关系
- 连线粗细表示调用次数
- 可拖拽节点调整位置
- 支持时间范围筛选

## 配置说明

环境变量：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `ELASTICSEARCH_URLS` | `http://localhost:9200` | Elasticsearch 地址，多个用逗号分隔 |
| `PORT` | `8080` | 服务端口 |
| `QUEUE_SIZE` | `100000` | 缓冲队列最大容量 |
| `WORKER_COUNT` | `10` | Worker 数量 |
| `BATCH_SIZE` | `500` | 批量写入大小 |
| `FLUSH_INTERVAL_SEC` | `5` | 定时刷新间隔（秒） |

### 队列监控

通过 `/api/stats` 接口获取实时统计：

```json
{
  "enabled": true,
  "stats": {
    "queue_size": 0,
    "queue_capacity": 100000,
    "total_queued": 15000,
    "total_processed": 14800,
    "total_dropped": 0,
    "total_errors": 0,
    "worker_count": 10
  }
}
```

## 服务命名空间

为避免服务名重复（如不同环境有相同的服务名），系统支持 `service.namespace` 属性：

### OTLP 格式示例

```json
{
  "resourceSpans": [{
    "resource": {
      "attributes": [
        {"key": "service.name", "value": {"stringValue": "order-service"}},
        {"key": "service.namespace", "value": {"stringValue": "production"}}
      ]
    }
  }]
}
```

服务名会被格式化为：`production/order-service`

### 在依赖图中
- 不同命名空间的同名服务会被区分显示
- 例如：`production/user-service` 和 `staging/user-service` 会被视为不同节点

## OpenTelemetry 集成示例

### Go 应用集成

```go
import (
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
    "go.opentelemetry.io/otel/sdk/trace"
    "go.opentelemetry.io/otel/sdk/resource"
    semconv "go.opentelemetry.io/otel/semconv/v1.20.0"
)

func initTracer() {
    exporter, err := otlptracehttp.New(
        context.Background(),
        otlptracehttp.WithEndpoint("localhost:8080"),
        otlptracehttp.WithInsecure(),
        otlptracehttp.WithURLPath("/v1/traces"),
    )
    if err != nil {
        log.Fatal(err)
    }

    provider := trace.NewTracerProvider(
        trace.WithBatcher(exporter),
        trace.WithResource(resource.NewWithAttributes(
            semconv.SchemaURL,
            semconv.ServiceNameKey.String("your-service"),
            semconv.ServiceNamespaceKey.String("production"),
        )),
    )

    otel.SetTracerProvider(provider)
}
```

## 高吞吐优化

### 工作原理

```
OTLP 请求 → 解析 → 入队(缓冲Channel) → Worker池消费 → 批量写入ES
```

1. **缓冲队列**: 使用有界 Channel，容量可配置（默认 100K）
2. **异步处理**: 请求立即返回 200，不阻塞发送方
3. **批量写入**: Worker 积累到一定数量或定时刷新
4. **自动重试**: 写入失败自动重试 3 次
5. **优雅关闭**: 收到 SIGTERM 信号后等待队列排空

### 调优建议

| 场景 | QUEUE_SIZE | WORKER_COUNT | BATCH_SIZE |
|------|-----------|--------------|------------|
| 开发/测试 | 1000 | 2 | 50 |
| 普通生产 | 50000 | 5 | 200 |
| 高吞吐生产 | 200000 | 20 | 1000 |

## 报警功能

### 报警类型

1. **慢 Trace 报警**: Trace 总耗时超过阈值
2. **慢 Span 报警**: 单个 Span 耗时超过阈值

### 严重等级

| 等级 | 触发条件 |
|------|----------|
| warning | 耗时 > 阈值 × 1 |
| error | 耗时 > 阈值 × 2 |
| critical | 耗时 > 阈值 × 5 |

### 报警配置

通过 API 动态配置：

```bash
# 获取当前配置
curl http://localhost:8080/api/alerts/config

# 更新配置
curl -X PUT http://localhost:8080/api/alerts/config \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "slow_trace_threshold_ms": 1000,
    "slow_span_threshold_ms": 500,
    "max_alerts_per_minute": 60
  }'
```

也可以在前端「系统设置」页面进行可视化配置。

## 采样功能

### 采样策略

1. **概率采样**: 按配置的采样率随机采样
2. **慢 Trace 强制采样**: 超过阈值的 Trace 始终采样
3. **错误 Trace 强制采样**: 包含错误状态的 Trace 始终采样

### 配置示例

```bash
# 获取采样配置
curl http://localhost:8080/api/sampling/config

# 更新采样配置
curl -X PUT http://localhost:8080/api/sampling/config \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "sampling_rate": 0.5,
    "slow_trace_always_sample": true,
    "error_always_sample": true
  }'
```

### 采样统计

```bash
curl http://localhost:8080/api/sampling/stats
```

返回：
```json
{
  "total_traces": 10000,
  "sampled_traces": 5234,
  "actual_rate": 0.5234,
  "configured_rate": 0.5
}
```

## 数据导出

### 单 Trace 导出

```bash
# JSON 格式
curl http://localhost:8080/api/trace/{trace_id}/export?format=json

# CSV 格式
curl http://localhost:8080/api/trace/{trace_id}/export?format=csv
```

### 批量导出

```bash
# JSON 格式（包含元数据）
curl "http://localhost:8080/api/traces/export?format=json&limit=100"

# NDJSON 格式（每行一个对象）
curl "http://localhost:8080/api/traces/export?format=ndjson&limit=100"

# CSV 格式
curl "http://localhost:8080/api/traces/export?format=csv&limit=100&service=api-gateway"
```

## 技术栈

- **后端**: Go + Gin
- **存储**: Elasticsearch 7.x
- **前端**: HTML + JavaScript + D3.js
- **数据格式**: OpenTelemetry OTLP (JSON)

## 故障排查

### Elasticsearch 连接失败
- 确保 Docker Compose 已启动：`docker-compose ps`
- 检查端口 9200 是否被占用
- 查看日志：`docker-compose logs elasticsearch`

### 没有数据显示
- 确认 `generate_test_data.py` 正在运行
- 检查后端日志确认收到 trace 数据
- 查看队列状态：`curl http://localhost:8080/api/stats`
- 在 Kibana (`http://localhost:5601`) 中查看 spans 索引

### Span 丢失
- 检查 `/api/stats` 中 `total_dropped` 指标
- 增加 `QUEUE_SIZE` 或 `WORKER_COUNT`
- 检查 Elasticsearch 性能和日志

## 许可证

MIT License
