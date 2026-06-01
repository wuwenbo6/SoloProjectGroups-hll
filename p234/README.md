# XMPP 消息归档服务器组件 (XEP-0136)

基于 Node.js + xmpp.js 实现的 XMPP 服务器组件，支持 XEP-0136 消息归档协议，消息存储到 SQLite 数据库，前端可通过 XMPP 或 HTTP API 查询历史消息。

## 功能特性

- ✅ **XEP-0136 消息归档协议支持**
  - 首选项管理 (pref)
  - 会话列表查询 (list collections)
  - 消息检索 (retrieve collection)
  - 会话删除 (remove collection)

- ✅ **数据库存储**
  - SQLite 持久化存储
  - 支持按联系人、日期范围查询
  - 支持关键词全文搜索
  - **按月份分组存储** (如 2025-05)
  - **自动统一为裸 JID** (去除 resource 部分)
  - **单聊/群聊分开存储**

- ✅ **查询方式**
  - 按日期范围筛选
  - 按联系人筛选
  - 按聊天类型筛选 (单聊/群聊)
  - 关键词全文搜索
  - 结果分页支持

- ✅ **多接口支持**
  - XMPP Component 接口
  - HTTP REST API
  - WebSocket 实时接口

- ✅ **MUC 群聊归档**
  - 支持群聊消息归档
  - 保存发送者昵称和真实 JID
  - 按群组分别归档

- ✅ **HTML 格式导出**
  - 美观的聊天记录导出
  - 支持按会话/按类型/按月份筛选导出
  - 自动区分单聊和群聊样式

## 项目结构

```
.
├── src/
│   ├── server.js          # 主服务器入口
│   ├── database.js        # 数据库操作模块
│   └── xep0136.js         # XEP-0136 协议处理器
├── public/
│   └── index.html         # 前端测试页面
├── data/                  # 数据库文件目录 (自动创建)
├── package.json
├── .env                   # 环境变量配置
└── README.md
```

## 安装与运行

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

编辑 `.env` 文件：

```env
# XMPP 组件配置
XMPP_SERVICE=localhost
XMPP_PORT=5347
XMPP_DOMAIN=archive.localhost
XMPP_SECRET=mysecret

# 数据库配置
DB_PATH=./data/messages.db

# HTTP/WebSocket 服务端口
HTTP_PORT=3000
```

### 3. 启动服务

```bash
npm start
```

或使用开发模式（自动重启）：

```bash
npm run dev
```

服务启动后：
- HTTP API: http://localhost:3000
- WebSocket: ws://localhost:3000
- 前端测试页面: http://localhost:3000

## 使用说明

### 前端测试页面

打开浏览器访问 http://localhost:3000，可以使用测试客户端：

1. **生成测试数据**
   - 单聊消息：点击「发送单聊」→「生成测试消息」
   - 群聊消息：点击「群聊消息」→「生成群聊测试消息」

2. **查看会话列表** - 左侧显示所有会话，支持：
   - 按聊天类型筛选（全部/单聊/群聊）
   - 按联系人筛选
   - 按月份分组显示
   - 图标区分单聊（👤）和群聊（👥）

3. **查看消息记录** - 点击会话查看详细消息，支持：
   - 按月份筛选
   - 按日期范围筛选
   - 群聊消息显示发送者昵称

4. **关键词搜索** - 切换到「关键词搜索」标签页进行全文搜索，支持：
   - 按月份筛选
   - 按日期范围筛选
   - 按联系人筛选

5. **发送消息**
   - 单聊：切换到「发送单聊」标签页发送并归档新消息
   - 群聊：切换到「群聊消息」标签页发送群聊消息

6. **导出消息**
   - 导出当前会话：在「消息记录」标签页点击「导出为 HTML」
   - 导出全部消息：在「群聊消息」标签页选择导出选项后点击「导出全部为 HTML」
   - 支持按类型（单聊/群聊）和月份筛选导出

### HTTP API 接口

#### 1. 获取会话列表

```
GET /api/collections/:owner
```

参数：
- `with` (可选): 按联系人 JID 筛选
- `start` (可选): 开始时间戳 (毫秒)
- `end` (可选): 结束时间戳 (毫秒)
- `max` (可选): 最大返回数量

示例：
```bash
curl "http://localhost:3000/api/collections/alice@localhost?max=10"
```

#### 2. 获取会话消息

```
GET /api/messages/:owner?with=user@domain
```

参数：
- `with` (必填): 联系人 JID
- `start` (可选): 开始时间戳
- `end` (可选): 结束时间戳
- `keyword` (可选): 关键词筛选
- `max` (可选): 最大返回数量

示例：
```bash
curl "http://localhost:3000/api/messages/alice@localhost?with=bob@localhost&start=1700000000000"
```

#### 3. 关键词搜索消息

```
GET /api/search/:owner?keyword=xxx
```

参数：
- `keyword` (必填): 搜索关键词
- `with` (可选): 限定联系人
- `start` (可选): 开始时间戳
- `end` (可选): 结束时间戳
- `max` (可选): 最大返回数量

示例：
```bash
curl "http://localhost:3000/api/search/alice@localhost?keyword=咖啡"
```

#### 4. 发送并归档消息

```
POST /api/messages
Content-Type: application/json

{
  "from": "alice@localhost",
  "to": "bob@localhost",
  "body": "你好，这是一条测试消息",
  "type": "chat"
}
```

### WebSocket 接口

连接到 `ws://localhost:3000`，发送 JSON 格式消息：

#### 发送消息并归档

```json
{
  "type": "archive",
  "data": {
    "from": "alice@localhost",
    "to": "bob@localhost",
    "body": "消息内容",
    "type": "chat"
  }
}
```

#### 获取会话列表

```json
{
  "type": "listCollections",
  "data": {
    "owner": "alice@localhost",
    "options": {
      "max": 50
    }
  }
}
```

#### 获取会话消息

```json
{
  "type": "retrieveCollection",
  "data": {
    "owner": "alice@localhost",
    "with": "bob@localhost",
    "options": {
      "start": 1700000000000
    }
  }
}
```

#### 关键词搜索

```json
{
  "type": "search",
  "data": {
    "owner": "alice@localhost",
    "keyword": "测试",
    "options": {}
  }
}
```

### XMPP XEP-0136 协议

服务器组件实现了完整的 XEP-0136 协议，可通过 XMPP 客户端直接访问。

#### 首选项查询

```xml
<iq type='get' id='pref1'>
  <pref xmlns='urn:xmpp:archive'/>
</iq>
```

#### 会话列表查询

```xml
<iq type='get' id='list1'>
  <query xmlns='urn:xmpp:archive'>
    <with>bob@localhost</with>
    <start>2024-01-01T00:00:00Z</start>
  </query>
</iq>
```

#### 消息检索

```xml
<iq type='get' id='ret1'>
  <retrieve xmlns='urn:xmpp:archive'
            with='bob@localhost'
            start='2024-01-01T00:00:00Z'>
    <keyword>咖啡</keyword>
  </retrieve>
</iq>
```

## 数据库设计

### collections 表 - 会话集合

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| owner | TEXT | 会话所有者 JID (裸 JID) |
| with_user | TEXT | 联系人用户名 |
| with_server | TEXT | 联系人服务器 |
| thread | TEXT | 消息线程 ID |
| month | TEXT | 月份 (YYYY-MM)，用于按月份分组 |
| start_time | INTEGER | 会话开始时间 |
| subject | TEXT | 会话主题 |

### messages 表 - 消息记录

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| collection_id | INTEGER | 关联会话 ID |
| utc_time | INTEGER | 消息时间戳 |
| body | TEXT | 消息内容 |
| direction | TEXT | 消息方向 (from/to) |
| type | TEXT | 消息类型 |
| name | TEXT | 发送方名称 |

### preferences 表 - 用户首选项

| 字段 | 类型 | 说明 |
|------|------|------|
| owner | TEXT | 用户 JID (主键) |
| save | TEXT | 保存模式 |
| expire | INTEGER | 过期时间 (秒) |
| otr | TEXT | OTR 模式 |

## 与 Prosody/ejabberd 集成

### Prosody 配置

在 Prosody 的 `config.lua` 中添加：

```lua
Component "archive.localhost"
    component_secret = "mysecret"
    component_port = 5347
```

重启 Prosody 后，本组件会自动连接。

### ejabberd 配置

在 ejabberd.yml 中添加：

```yaml
listen:
  -
    port: 5347
    module: ejabberd_service
    access: all
    shaper_rule: fast
    ip: "127.0.0.1"
    hosts:
      "archive.localhost":
        password: "mysecret"
```

## 技术栈

- **Node.js** - 运行环境
- **@xmpp/component** - XMPP 组件库
- **better-sqlite3** - SQLite 数据库驱动
- **Express** - HTTP 服务器
- **ws** - WebSocket 库
- **@xmpp/xml** - XML 构建/解析

## 开发说明

### 扩展功能

1. 添加更多 XEP-0136 特性（如 RSM 分页、修改会话）
2. 支持其他数据库（PostgreSQL、MySQL）
3. 添加消息加密存储
4. ✅ 实现消息导出功能 (HTML 格式)
5. 添加统计分析功能
6. 支持更多导出格式 (PDF、JSON、CSV)
7. 添加消息附件归档支持

### 注意事项

- 生产环境请使用 HTTPS/WSS
- 大流量场景建议使用 PostgreSQL 替代 SQLite
- 定期备份数据库文件
- 考虑添加消息过期清理机制

## 许可证

MIT
