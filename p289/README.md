# OpenResty 日志处理模拟器

一个 Web 应用，模拟 OpenResty 环境，用户可以编写 Lua 脚本处理 access 日志（正则匹配提取），实时输出统计结果（URL 访问次数）。后端使用 Lua 沙箱执行脚本。

## 功能特性

### 核心功能
- Lua 脚本沙箱执行 - 使用 wasmoon (WebAssembly Lua 引擎)
- 5秒超时限制 - 防止无限循环阻塞服务
- 禁用危险库 - socket、io、os.execute 等危险操作被禁用
- print 输出重定向 - 沙箱内 print 输出到前端控制台
- 实时日志分析
- URL 访问统计
- 正则匹配提取数据

### 新增功能
- WebSocket 实时推送 - 分析结果实时推送到前端，图表实时刷新
- 脚本模板库 - 内置 4 个分析模板，支持自定义模板管理

## 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式

同时启动后端和前端开发服务器：

```bash
# 后端 (终端 1)
npx tsx src/server/index.ts

# 前端 (终端 2)
npx vite --host
```

- 前端: http://localhost:3000
- 后端 API: http://localhost:3001
- WebSocket: ws://localhost:3001/ws

## API 接口

### POST /api/execute

执行 Lua 脚本处理日志

**请求体:**

```json
{
  "luaCode": "function process_log(line) ... end",
  "accessLogs": ["log line 1", "log line 2"],
  "sessionId": "optional_session_id_for_websocket"
}
```

**响应:**

```json
{
  "success": true,
  "output": "print 输出内容",
  "stats": {
    "url:/api/users": 4,
    "method:GET": 8
  },
  "errors": [],
  "extractedData": [
    {"url": "/api/users", "method": "GET"}
  ]
}
```

### WebSocket 消息

**连接:** `ws://localhost:3001/ws`

**客户端发送:**
```json
{ "type": "subscribe", "data": { "sessionId": "session_xxx" } }
```

**服务端推送:**
- `execution:progress` - 执行进度
- `execution:result` - 执行完成结果
- `execution:error` - 执行错误
- `stats:update` - 统计数据更新

### 模板库 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/templates` | 获取所有模板 |
| GET | `/api/templates?category=基础` | 按分类获取模板 |
| GET | `/api/templates/:id` | 获取单个模板 |
| POST | `/api/templates` | 创建新模板 |
| PUT | `/api/templates/:id` | 更新模板 |
| DELETE | `/api/templates/:id` | 删除模板 |
| GET | `/api/templates/categories` | 获取所有分类 |

## Lua API

在 Lua 脚本中可以使用以下 API：

### print(...)
打印输出到控制台（已重定向到沙箱）

### stats.increment(key, value?)
增加统计计数
```lua
stats.increment('url:/api/users')      -- +1
stats.increment('url:/api/users', 2)   -- +2
```

### extractor.add(data)
添加提取的数据
```lua
extractor.add({
    url = "/api/users",
    method = "GET"
})
```

### ngx
模拟 OpenResty 的 ngx 模块（部分实现）

## 内置模板

1. 基础 URL 统计 - 统计访问日志中各 URL 的访问次数
2. 404 错误检测 - 找出返回 404 状态码的请求
3. 慢请求分析 - 统计响应时间超过阈值的请求
4. 用户代理分析 - 统计不同浏览器/客户端的访问情况

## 安全特性

- 5秒超时限制 - 通过 Lua debug.sethook 指令计数实现
- 禁用网络库 - socket、http 等网络库不可用
- 禁用文件系统 - io、lfs 等文件操作不可用
- 禁用系统命令 - os.execute 不可用
- 禁用模块加载 - require、package 不可用
- print 重定向 - 输出不会污染系统控制台

## 示例脚本

```lua
function process_log(line)
    local method, url = line:match('"(%u+)%s+([^%s]+)%s+HTTP')
    
    if method and url then
        stats.increment('url:' .. url)
        stats.increment('method:' .. method)
        
        extractor.add({
            url = url,
            method = method
        })
    end
end
```
