# HKP Keyserver

一个基于 Node.js 和 PostgreSQL 实现的 HTTP Keyserver Protocol (HKP) 服务器。

## 功能特性

- 支持 HKP 协议标准端点：
  - `POST /pks/add - 上传公钥
  - `GET /pks/lookup - 查询公钥（支持 op=get, op=index, op=vindex)
- Web 界面支持搜索和展示密钥指纹
- PostgreSQL 数据持久化存储
- OpenPGP 公钥解析和验证

## 技术栈

- **后端**: Node.js + Express
- **数据库**: PostgreSQL
- **OpenPGP 处理**: openpgp.js
- **前端**: 原生 HTML/CSS/JavaScript

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env` 并修改配置：

```bash
cp .env.example .env
```

配置：

```
PORT=11371
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=hkp_server
```

### 3. 初始化数据库

确保 PostgreSQL 服务已启动，然后运行：

```bash
npm run init-db
```

### 4. 启动服务器

```bash
npm start
```

开发模式（自动重启）：

```bash
npm run dev
```

## 使用方法

### Web 界面

访问 `http://localhost:11371

### HKP 协议使用

#### 上传公钥：

```bash
# 使用 gpg 命令行
gpg --keyserver http://localhost:11371 --send-keys <key-id>
```

或使用 HTTP 请求：

```bash
curl -X POST http://localhost:11371/pks/add \
  --data-urlencode "keytext=$(cat public-key.asc"
```

#### 查询公钥：

```bash
# 使用 gpg 命令行
gpg --keyserver http://localhost:11371 --search-keys "search-term"
```

或使用 HTTP 请求：

```bash
# 按 Key ID 获取
curl "http://localhost:11371/pks/lookup?op=get&search=0xKEYID

# 搜索
curl "http://localhost:11371/pks/lookup?op=index&search=email@example.com"

# 获取机器可读格式
curl "http://localhost:11371/pks/lookup?op=get&options=mr&search=0xKEYID"
```

### API 端点

- `GET /api/v1/keys` - 获取所有密钥列表
- `GET /api/v1/keys/search?q=<query>` - 搜索密钥
- `GET /api/v1/keys/:fingerprint` - 获取单个密钥详情
- `POST /api/v1/keys` - 上传新密钥
- `GET /api/v1/stats` - 获取统计信息

## 项目结构

```
.
├── src/
│   ├── db/              # 数据库连接
│   ├── models/          # 数据模型
│   ├── routes/          # 路由处理器
│   │   ├── hkp.js     # HKP 协议路由
│   │   ├── api.js     # API 路由
│   │   └── web.js     # Web 页面路由
│   ├── scripts/       # 脚本
│   ├── utils/         # 工具函数
│   ├── public/        # 前端静态文件
│   └── server.js     # 服务器入口
├── .env                # 环境变量
├── .env.example        # 环境变量示例
├── package.json
└── README.md
```

## License

MIT
