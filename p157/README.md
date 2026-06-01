# OpenLDAP Web Admin Console

基于 Node.js + ldapjs 的 OpenLDAP Web 管理工具，提供直观的界面来管理 LDAP 目录服务。

## ✨ 功能特性

- 🔐 **LDAP 连接管理**：支持配置服务器地址、端口、Base DN、管理员认证
- 🌳 **目录树展示**：以树形结构可视化展示组织单元（OU）和目录结构
- 👥 **用户管理**：完整的用户增删改查（CRUD）操作
- 🔑 **密码重置**：安全的用户密码重置功能，支持强度校验
- 🛡️ **密码强度校验**：密码至少8位，必须包含字母和数字
- 📄 **分页搜索**：支持 LDAP 分页查询（Paged Search Control）
- ⚡ **虚拟滚动**：用户列表采用虚拟滚动渲染，支持万级数据量
- 🎨 **现代化界面**：深色主题、响应式设计、流畅动画
- 📱 **响应式布局**：支持桌面、平板、移动设备

## 🛠️ 技术栈

- **后端**：Node.js + Express.js
- **LDAP 客户端**：ldapjs
- **前端**：原生 HTML + CSS + JavaScript（无构建工具）
- **会话管理**：express-session
- **样式**：CSS 变量、CSS Grid、Flexbox

## 📦 安装

```bash
npm install
```

## 🚀 快速开始

### 方式一：使用默认配置启动

```bash
npm start
```

### 方式二：使用环境变量配置

复制 `.env.example` 为 `.env` 并修改配置：

```bash
cp .env.example .env
# 编辑 .env 文件
npm start
```

服务启动后访问：http://localhost:3000

## 🔧 配置说明

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `PORT` | 服务端口 | 3000 |
| `SESSION_SECRET` | 会话加密密钥 | ldap-admin-secret-key |
| `LDAP_HOST` | LDAP 服务器地址 | - |
| `LDAP_PORT` | LDAP 端口 | 389 |
| `LDAP_BASE_DN` | 基础 DN | - |
| `LDAP_ADMIN_DN` | 管理员 DN | - |
| `LDAP_ADMIN_PASSWORD` | 管理员密码 | - |

> **注意**：环境变量中的 LDAP 配置为可选，用户也可以在登录页面动态输入连接信息。

## 📁 项目结构

```
p157/
├── server.js                 # Express 服务器入口
├── package.json              # 项目依赖配置
├── .env.example              # 环境变量示例
├── README.md                 # 项目说明文档
├── config/
│   └── ldap.js               # LDAP 配置（可选）
├── routes/
│   ├── auth.js               # 认证路由
│   ├── directory.js          # 目录树路由
│   └── users.js              # 用户 CRUD 路由
├── services/
│   └── ldapService.js        # LDAP 操作核心服务
├── middleware/
│   └── auth.js               # 认证中间件
└── public/
    ├── index.html            # 管理界面
    ├── css/
    │   └── style.css         # 样式文件
    └── js/
        └── app.js            # 前端应用逻辑
```

## 🌐 API 接口

### 认证接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | LDAP 认证登录 |
| POST | `/api/auth/logout` | 登出 |
| GET | `/api/auth/status` | 获取连接状态 |

### 目录接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/directory/tree` | 获取目录树结构 |

### 用户接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/users?ou=xxx` | 获取指定 OU 下的用户列表 |
| GET | `/api/users/:dn` | 获取用户详情 |
| POST | `/api/users` | 创建新用户 |
| PUT | `/api/users/:dn` | 更新用户信息 |
| DELETE | `/api/users/:dn` | 删除用户 |
| PUT | `/api/users/:dn/password` | 重置用户密码 |

## 🎯 使用指南

### 1. 登录连接

1. 启动应用后访问登录页面
2. 输入 LDAP 服务器信息：
   - **LDAP 服务器地址**：如 `localhost` 或 `ldap.example.com`
   - **端口**：默认 `389`（SSL 通常为 636）
   - **Base DN**：如 `dc=example,dc=com`
   - **管理员 DN**：如 `cn=admin,dc=example,dc=com`
   - **管理员密码**：LDAP 管理员密码
3. 点击「连接并登录」

### 2. 浏览目录树

- 左侧边栏展示 LDAP 目录树结构
- 点击文件夹图标展开/折叠子节点
- 点击节点名称选中该组织单元
- 右侧会显示该 OU 下的所有用户

### 3. 用户管理

**新增用户**：
1. 选中要添加用户的组织单元
2. 点击「新增用户」按钮
3. 填写用户信息（UID、CN、SN 为必填）
4. 设置初始密码
5. 点击「保存」

**编辑用户**：
1. 在用户列表中点击编辑图标
2. 修改用户属性
3. 点击「保存」

**重置密码**：
1. 点击用户行的钥匙图标
2. 输入新密码并确认
3. 点击「重置密码」

**删除用户**：
1. 点击用户行的删除图标
2. 确认删除操作

## 🔒 安全说明

- 所有 LDAP 管理员凭证存储在服务端 session 中，不会暴露给前端
- 建议在生产环境中使用 HTTPS
- Session 默认 24 小时后过期
- 生产环境请修改 `SESSION_SECRET` 为强随机密钥

## 📋 LDAP  Schema 要求

本工具默认使用标准的 `inetOrgPerson` 对象类，用户条目需包含以下属性：

- **必填**：`uid`、`cn`（Common Name）、`sn`（Surname）
- **可选**：`givenName`、`mail`、`telephoneNumber`、`userPassword`

## 🐛 故障排查

**连接失败**：
- 检查 LDAP 服务器地址和端口是否正确
- 确认防火墙允许访问 LDAP 端口
- 验证管理员 DN 和密码是否正确
- 检查 Base DN 是否正确

**用户列表为空**：
- 确认选中的 OU 下确实存在用户
- 检查 LDAP 服务器的访问权限
- 查看服务器控制台输出的错误信息

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！
