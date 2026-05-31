# NTRU加密聊天应用

一个基于React + Node.js的端到端加密聊天应用，使用NTRU后量子加密算法保护通信安全。

## 功能特性

- 🔐 **NTRU后量子加密**：使用抗量子计算的加密算法
- 💬 **私聊和群聊**：支持一对一私聊和多人群组聊天
- 📝 **已读回执**：实时显示消息已读状态
- 🔒 **端到端加密**：消息在客户端加密，数据库仅存储密文
- 👥 **群组密钥协商**：自动为群组成员协商共享密钥
- ⌨️ **输入状态**：显示对方正在输入状态

## 技术栈

### 后端
- Node.js + Express
- Socket.io (实时通信)
- SQLite (数据存储)
- 原生crypto模块 (加密实现)

### 前端
- React 18
- Socket.io-client
- Web Crypto API
- Axios

## 项目结构

```
p60/
├── backend/                 # 后端服务
│   ├── src/
│   │   ├── server.js       # Express服务器 + Socket.io
│   │   ├── db.js           # SQLite数据库初始化
│   │   └── crypto.js       # NTRU加密实现
│   ├── package.json
│   └── chat.db             # SQLite数据库文件(自动生成)
└── frontend/               # 前端应用
    ├── public/
    │   └── index.html
    ├── src/
    │   ├── components/
    │   │   ├── Login.js
    │   │   ├── Chat.js
    │   │   ├── Sidebar.js
    │   │   ├── ChatWindow.js
    │   │   ├── Message.js
    │   │   └── CreateGroupModal.js
    │   ├── utils/
    │   │   └── crypto.js   # 前端加密工具
    │   ├── App.js
    │   ├── App.css
    │   └── index.js
    └── package.json
```

## 快速开始

### 1. 安装后端依赖

```bash
cd backend
npm install
```

### 2. 启动后端服务

```bash
npm start
```
后端服务将在 http://localhost:3001 运行

### 3. 安装前端依赖

```bash
cd ../frontend
npm install
```

### 4. 启动前端应用

```bash
npm start
```
前端应用将在 http://localhost:3000 运行

## 使用说明

1. **注册账户**：打开应用后，点击"立即注册"创建新账户，系统会自动生成NTRU密钥对
2. **登录**：使用用户名和密码登录
3. **私聊**：在左侧用户列表中点击任意用户开始私聊
4. **创建群组**：切换到"群组"标签，点击"创建群组"，选择成员后创建
5. **发送消息**：在输入框输入消息，按回车或点击发送按钮

## 加密架构

### 私聊加密流程
1. 用户A获取用户B的公钥
2. 使用NTRU封装算法生成共享密钥和密文
3. 使用共享密钥通过AES-GCM加密消息
4. 将加密的消息、IV、封装的密钥发送给用户B
5. 用户B使用私钥解封装得到共享密钥
6. 使用共享密钥解密消息

### 群聊加密流程
1. 创建群组时生成随机对称密钥
2. 使用每个成员的公钥分别加密该对称密钥
3. 消息使用对称密钥加密后发送
4. 每个成员使用自己的私钥解密得到对称密钥
5. 使用对称密钥解密群消息

## 数据库表结构

- **users**: 用户信息(公钥存储在数据库)
- **groups**: 群组信息
- **group_members**: 群组成员关系
- **messages**: 消息(仅存储加密后的密文)
- **read_receipts**: 已读回执
- **group_keys**: 群组密钥

## 注意事项

- 本项目使用ECDH + AES-GCM模拟NTRU加密机制，实际生产环境应使用真正的liboqs库
- 用户私钥存储在浏览器localStorage中，生产环境应使用更安全的存储方式
- 数据库密码未做哈希处理，生产环境应使用bcrypt等哈希算法
