## 1. 架构设计

```mermaid
flowchart TB
    subgraph "前端 (React + Vite)"
        "A[服务发现界面]"
        "B[JSON 编辑器]"
        "C[响应展示]"
    end
    subgraph "Go 后端 (HTTP + gRPC)"
        "D[REST API 层]"
        "E[Reflection 客户端]"
        "F[动态调用引擎]"
    end
    subgraph "外部 gRPC 服务"
        "G[gRPC Server (带 Reflection)"]
    end
    "A" --> "D"
    "B" --> "D"
    "D" --> "E"
    "D" --> "F"
    "E" --> "G"
    "F" --> "G"
    "C" <--> "D"
```

## 2. 技术说明

- 前端：React@18 + TypeScript + Tailwind CSS + Vite
- 后端：Go 1.22+ (net/http + grpc-go + grpcurl)
- 前后端通信：REST JSON API
- 无数据库，所有数据通过 gRPC Reflection 实时获取

### 关键 Go 依赖

| 依赖 | 用途 |
|------|------|
| google.golang.org/grpc | gRPC 客户端核心 |
| google.golang.org/grpc/reflection | 反射客户端 |
| github.com/jhump/protoreflect | 动态 protobuf 解析与构造 |
| github.com/gorilla/websocket | 可选：流式响应 |

## 3. 路由定义

| 路由 | 用途 |
|------|------|
| / | 前端主页 |
| /api/connect | 连接 gRPC 服务，获取服务列表 |
| /api/services | 获取某服务的所有方法及签名 |
| /api/invoke | 动态调用指定 gRPC 方法 |

## 4. API 定义

### 4.1 连接 gRPC 服务

```
POST /api/connect
Request:  { "address": "localhost:50051", "tls": false }
Response: { "services": ["grpc.reflection.v1.ServerReflection", "helloworld.Greeter"] }
```

### 4.2 获取方法签名

```
POST /api/services
Request:  { "address": "localhost:50051", "tls": false, "service": "helloworld.Greeter" }
Response: {
  "service": "helloworld.Greeter",
  "methods": [
    {
      "name": "SayHello",
      "fullMethod": "/helloworld.Greeter/SayHello",
      "inputType": "helloworld.HelloRequest",
      "outputType": "helloworld.HelloReply",
      "inputSchema": { "name": "string" },
      "outputSchema": { "message": "string" }
    }
  ]
}
```

### 4.3 动态调用

```
POST /api/invoke
Request:  {
  "address": "localhost:50051",
  "tls": false,
  "method": "/helloworld.Greeter/SayHello",
  "requestJson": "{\"name\": \"World\"}",
  "timeout": 10
}
Response: {
  "response": "{\"message\": \"Hello World\"}",
  "duration": "12ms",
  "status": "OK"
}
```

### 4.4 错误响应

```
{
  "error": "rpc error: code = NotFound desc = service not found",
  "status": "NOT_FOUND",
  "duration": "5ms"
}
```

## 5. 服务器架构图

```mermaid
flowchart LR
    "HTTP Handler" --> "Reflection Service"
    "HTTP Handler" --> "Invocation Engine"
    "Reflection Service" --> "gRPC Conn Pool"
    "Invocation Engine" --> "gRPC Conn Pool"
    "gRPC Conn Pool" --> "Target gRPC Server"
```

## 6. 核心流程设计

### 6.1 反射发现流程

1. 建立 gRPC 连接（支持 plaintext/TLS）
2. 创建 ServerReflection 客户端
3. 发送 ServerReflectionRequest 获取文件列表
4. 解析 FileDescriptorProto 获取服务、方法、消息定义
5. 递归解析依赖的 proto 文件
6. 构建完整的类型签名信息返回前端

### 6.2 动态调用流程

1. 根据 method 路径定位 Service 和 Method
2. 通过 Reflection 获取请求类型的 FileDescriptor
3. 使用 protoreflect 动态构造请求消息（JSON → dynamic.Message）
4. 通过 gRPC invoke 发起调用
5. 将响应 dynamic.Message 转为 JSON 返回

## 7. 项目结构

```
p184/
├── backend/              # Go 后端
│   ├── main.go           # 入口，HTTP 路由
│   ├── go.mod
│   ├── go.sum
│   ├── handler/          # HTTP 处理器
│   │   ├── connect.go    # 连接与发现
│   │   ├── services.go   # 方法签名
│   │   └── invoke.go     # 动态调用
│   ├── grpcutil/         # gRPC 工具
│   │   ├── reflect.go    # 反射客户端封装
│   │   └── dynamic.go    # 动态消息构造与调用
│   └── model/            # 数据模型
│       └── types.go
├── src/                  # React 前端
│   ├── components/
│   ├── pages/
│   ├── hooks/
│   ├── utils/
│   └── App.tsx
├── package.json
├── vite.config.ts
└── tsconfig.json
```
