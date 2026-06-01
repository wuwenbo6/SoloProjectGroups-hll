# MongoDB Change Streams 模拟器

一个用于演示 MongoDB Change Streams 工作原理的全栈模拟器，支持实时变更监听、resumeToken 断点续传和客户端断线重连。

## ✨ 功能特性

### 核心功能
- **实时变更监听**：通过 WebSocket 实时推送 Insert/Update/Delete 变更事件
- **ResumeToken 机制**：每个事件携带唯一的恢复令牌，格式为 Base64(timeStamp:sequence)
- **断点续传**：客户端重连时携带 resumeToken，服务端自动补发所有错过的事件
- **断线重连**：支持手动模拟网络中断，演示重连后的数据恢复过程
- **事件日志**：完整记录所有变更事件，支持导出 JSON 和详细查看

### 界面特性
- 三栏式布局：数据操作区、变更流监听器、事件日志面板
- 深色科技风格，MongoDB 标志性绿色主题
- 响应式设计，支持移动端和平板设备
- 实时状态指示器，重连进度显示
- 流畅的动画效果和微交互

## 🏗️ 技术架构

### 技术栈
- **前端**：React 18 + TypeScript + Vite + TailwindCSS 3 + Zustand
- **后端**：Node.js + Express 4 + ws (WebSocket)
- **通信协议**：HTTP + WebSocket
- **数据存储**：内存模拟（无需真实 MongoDB）

### 项目结构
```
p360/
├── api/                          # 后端代码
│   ├── routes/
│   │   ├── auth.ts              # 认证路由（模板默认）
│   │   └── collection.ts        # 集合操作 API
│   ├── services/
│   │   ├── ChangeStreamsService.ts   # Change Streams 模拟器核心
│   │   └── CollectionService.ts      # 内存集合存储
│   ├── websocket/
│   │   └── WebSocketManager.ts       # WebSocket 连接管理
│   ├── app.ts                   # Express 应用
│   ├── server.ts                # HTTP 服务器入口
│   └── index.ts                 # Vercel 部署入口
├── shared/
│   └── types.ts                 # 前后端共享类型定义
├── src/                          # 前端代码
│   ├── components/               # UI 组件
│   │   ├── ChangeStreamsListener.tsx   # 变更流监听器
│   │   ├── CollectionView.tsx          # 集合数据视图
│   │   ├── ConnectionStatus.tsx        # 连接状态控制
│   │   ├── DataOperationPanel.tsx      # 数据操作面板
│   │   ├── EventCard.tsx               # 事件卡片组件
│   │   ├── EventLogPanel.tsx           # 事件日志面板
│   │   └── Toast.tsx                   # 消息提示组件
│   ├── hooks/
│   │   ├── useChangeStreams.ts   # Change Streams WebSocket Hook
│   │   └── useTheme.ts           # 主题 Hook（模板默认）
│   ├── services/
│   │   └── api.ts               # HTTP API 客户端
│   ├── store/
│   │   └── index.ts             # Zustand 状态管理
│   ├── pages/
│   │   └── Home.tsx             # 主页面
│   ├── lib/
│   │   └── utils.ts             # 工具函数
│   ├── App.tsx                  # 应用根组件
│   ├── main.tsx                 # 入口文件
│   └── index.css                # 全局样式
├── .trae/documents/
│   ├── prd.md                   # 产品需求文档
│   └── tech-arch.md             # 技术架构文档
└── test-core.js                 # 核心逻辑测试脚本
```

## 🔧 核心算法

### ResumeToken 生成与解析
```typescript
// 生成: Base64.encode(`${timestamp}:${sequence}`)
const data = `${Date.now()}:${++this.sequence}`;
const token = { _data: Buffer.from(data).toString('base64') };

// 解析
const decoded = Buffer.from(token, 'base64').toString();
const [timestamp, sequence] = decoded.split(':');
```

### 断点续传逻辑
```typescript
// 客户端断线时保存最后收到的 resumeToken
// 重连时发送: { type: 'connect', resumeAfter: lastToken }

// 服务端根据 resumeToken 过滤事件
getEventsAfter(resumeToken?: string): ChangeEvent[] {
  if (!resumeToken) return this.eventLog;
  const { sequence } = this.parseResumeToken(resumeToken);
  return this.eventLog.filter(event => {
    const eventSeq = this.parseResumeToken(event._id._data).sequence;
    return eventSeq > sequence;
  });
}
```

## 🚀 快速开始

### 安装依赖
```bash
# 推荐使用 pnpm（更快）
pnpm install

# 或使用 npm
npm install --legacy-peer-deps
```

### 启动开发环境
```bash
# 同时启动前后端
npm run dev

# 或分别启动
npm run server:dev    # 后端: http://localhost:3001
npm run client:dev    # 前端: http://localhost:5173
```

### 访问应用
打开浏览器访问 http://localhost:5173

## 📖 使用说明

### 基本操作流程
1. **建立连接**：点击页面顶部的「连接」按钮，建立 WebSocket 连接
2. **执行数据操作**：在左侧面板选择 Insert/Update/Delete，输入 JSON 数据后执行
3. **观察变更事件**：中间面板实时显示接收到的变更事件，注意 resumeToken 的变化
4. **模拟断线**：点击「断开」按钮，模拟网络中断
5. **断线期间操作**：断开连接后继续执行几次数据操作
6. **恢复连接**：点击「重连（续传）」按钮，系统将自动补发所有错过的事件
7. **验证续传**：检查补发的事件数量和顺序，确认数据完整性

### ResumeToken 说明
- 每个变更事件都有一个唯一的 `resumeToken`（显示为琥珀色高亮）
- `resumeToken` 编码了事件的时间戳和序列号
- 客户端断线时会自动保存最后收到的 `resumeToken`
- 重连时携带 `resumeToken`，服务端从断点处开始补发事件
- 补发的事件会标记为「补发」标签，并有特殊的颜色标识

## 🔌 API 接口

### HTTP API
| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/collection/insert` | 插入文档 |
| PUT | `/api/collection/update/:id` | 更新文档 |
| DELETE | `/api/collection/delete/:id` | 删除文档 |
| GET | `/api/collection` | 获取所有文档 |
| GET | `/api/collection/events` | 获取历史事件（支持 `resumeAfter` 查询参数） |
| POST | `/api/collection/clear` | 清空集合和事件日志 |

### WebSocket 消息协议
```typescript
// 客户端 -> 服务端
interface ConnectMessage {
  type: 'connect';
  resumeAfter?: string;  // 断点续传令牌
}

// 服务端 -> 客户端
interface EventMessage {
  type: 'change';
  event: ChangeEvent;
  isResumed: boolean;    // 是否为重连补发
}

interface ConnectedMessage {
  type: 'connected';
  startingToken?: string;
  missedEventCount?: number;
}

interface ResumeCompleteMessage {
  type: 'resumeComplete';
  totalResumed: number;
}
```

## 🧪 测试验证

### 核心逻辑测试
运行独立测试脚本验证 Change Streams 核心逻辑：
```bash
node test-core.js
```

预期输出：
- 验证 Insert/Update/Delete 事件创建
- 验证 resumeToken 生成和解析
- 验证断点续传正确过滤事件

### TypeScript 类型检查
```bash
npm run check
```

### 手动测试场景
1. **正常监听**：连接后执行操作，确认事件实时推送
2. **断线重连**：断开后执行操作，重连后确认所有事件补发
3. **空Token重连**：重置Token后重连，确认补发所有历史事件
4. **并发连接**：多个浏览器标签页同时连接，确认广播正常
5. **数据一致性**：检查集合视图与变更事件的数据一致性

## 🎨 设计特色

### 视觉设计
- **主色调**：MongoDB 标志性深绿色 (#00ED64)
- **深色主题**：减少眼睛疲劳，适合开发者使用
- **等宽字体**：JetBrains Mono 用于代码和数据展示
- **界面字体**：Space Grotesk 提供现代感
- **微妙动效**：新事件滑入、连接状态脉冲、Toast 滑入

### 交互设计
- 事件卡片可展开查看完整 JSON 结构
- 一键填充示例数据，快速测试
- 事件日志支持导出 JSON 文件
- 移动端 Tab 切换，优化小屏体验
- 操作结果即时 Toast 反馈

## 📚 学习要点

这个模拟器可以帮助理解以下 MongoDB Change Streams 概念：

1. **变更事件结构**：`operationType`、`fullDocument`、`updateDescription`
2. **Resume Token**：作用、格式、如何用于断点续传
3. **集群时间**：`clusterTime` 的作用
4. **幂等性**：如何处理重复事件
5. **事件顺序**：保证事件按操作顺序送达
6. **故障恢复**：客户端断线后如何恢复数据流

## 📝 开发说明

### 添加新的操作类型
1. 在 `shared/types.ts` 扩展 `ChangeEvent['operationType']`
2. 在 `CollectionService.ts` 添加对应的操作方法
3. 在前端 `DataOperationPanel.tsx` 添加操作按钮

### 自定义 Token 格式
修改 `ChangeStreamsService.ts` 中的 `generateResumeToken` 方法。

### 修改 WebSocket 路径
在 `vite.config.ts` 和 `api/websocket/WebSocketManager.ts` 中同步修改。

## 🤝 常见问题

**Q: 为什么重连后没有收到补发事件？**
A: 请确保断线期间确实执行了数据操作，且重连时 `resumeToken` 不为空。

**Q: 如何重置所有状态？**
A: 点击集合视图右上角的清空按钮，或调用 `POST /api/collection/clear`。

**Q: 支持多客户端吗？**
A: 是的，服务端会向所有连接的客户端广播变更事件。

**Q: 数据会持久化吗？**
A: 不会，所有数据都存储在内存中，重启服务后会清空。

## 📄 License

MIT License
