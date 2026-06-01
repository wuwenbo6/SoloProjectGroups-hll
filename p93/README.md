# WebRTC 远程控制系统

一个基于 WebRTC 的远程控制应用，支持屏幕共享和鼠标键盘事件模拟。

## 系统架构

```
主控端(浏览器) <--WebRTC--> 信令服务器(Node.js) <--WebRTC--> 被控端Agent(Node.js)
```

## 功能特性

- ✅ 屏幕捕获与共享 (getDisplayMedia)
- ✅ WebRTC 点对点连接
- ✅ DataChannel 传输鼠标键盘事件
- ✅ 多客户端支持（多房间）
- ✅ 鼠标移动、点击、滚轮
- ✅ 键盘按键（支持组合键）
- ✅ 实时日志显示

## 目录结构

```
p93/
├── package.json          # 项目配置
├── server/
│   └── index.js          # 信令服务器
├── public/
│   ├── index.html        # 主控端页面
│   └── master.js         # 主控端逻辑
└── agent/
    └── index.js          # 被控端Agent
```

## 安装依赖

```bash
# 如果遇到npm权限问题，请先执行：
sudo chown -R $(whoami) ~/.npm

# 安装依赖
npm install
```

## 启动服务

### 1. 启动信令服务器

```bash
npm start
# 或
node server/index.js
```

服务器将在 `http://localhost:3000` 启动

### 2. 启动被控端 Agent

在被控机器上运行：

```bash
# 使用默认房间ID (test-room)
npm run agent

# 或指定房间ID和服务器地址
ROOM_ID=my-room SIGNALING_SERVER=http://localhost:3000 node agent/index.js
```

### 3. 使用主控端

打开浏览器访问 `http://localhost:3000`

1. 输入房间ID或点击"创建房间"生成随机ID
2. 点击"加入房间"作为主控端
3. 点击"开始屏幕共享"选择要共享的屏幕
4. 在"被控端列表"中点击"连接"按钮连接到被控端
5. 连接成功后，在视频区域的操作会实时同步到被控端

## 配置说明

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| PORT | 信令服务器端口 | 3000 |
| SIGNALING_SERVER | 信令服务器地址 | http://localhost:3000 |
| ROOM_ID | Agent连接的房间ID | test-room |

## 技术栈

### 后端 (信令服务器)
- Express
- Socket.io
- CORS

### 前端 (主控端)
- 原生 JavaScript
- WebRTC API (RTCPeerConnection)
- MediaDevices API (getDisplayMedia)
- RTCDataChannel

### 被控端 Agent
- Node.js
- wrtc (Node.js WebRTC实现)
- robotjs (系统输入模拟)
- socket.io-client

## 支持的事件类型

### 鼠标事件
- `mousemove` - 鼠标移动
- `mousedown` - 鼠标按下 (支持 left/right/middle)
- `mouseup` - 鼠标释放
- `scroll` - 鼠标滚轮

### 键盘事件
- `keydown` - 按键按下
- `keyup` - 按键释放
- 支持组合键 (Ctrl/Shift/Alt/Command)

## 多客户端支持

系统支持多房间模式：
1. 不同房间的主控端和Agent互不干扰
2. 一个主控端可以连接多个Agent
3. 一个房间内可以有多个Agent

## 安全说明

⚠️ **注意安全**：
- 这是一个演示项目，生产环境需要添加身份验证
- 屏幕共享可能包含敏感信息
- 仅在受信任的网络中使用
- 建议配合 HTTPS 使用

## 常见问题

### 1. robotjs 安装失败
确保安装了系统依赖：
- macOS: `xcode-select --install`
- Linux: `sudo apt-get install libxtst-dev libpng++-dev`
- Windows: 需要 Visual C++ Build Tools

### 2. WebRTC 连接失败
- 检查防火墙设置
- 确保 STUN 服务器可访问
- 内网环境可能需要配置 TURN 服务器

### 3. 屏幕共享失败
- 浏览器需要授权屏幕共享权限
- 某些操作系统可能需要额外的权限设置

## 许可证

MIT