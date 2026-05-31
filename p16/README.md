# 农产品溯源区块链系统

基于 Hyperledger Fabric 的农产品溯源系统，实现从农场到餐桌的全流程追溯。

## 项目结构

```
p16/
├── chaincode/           # Go 链码
│   ├── main.go
│   ├── smartcontract.go
│   └── go.mod
├── backend/             # Node.js 后端
│   ├── src/
│   │   ├── server.js
│   │   ├── routes/
│   │   ├── middleware/
│   │   ├── services/
│   │   └── database/
│   ├── package.json
│   └── .env
└── frontend/            # Vue3 前端
    ├── src/
    │   ├── views/
    │   ├── layouts/
    │   ├── router/
    │   ├── stores/
    │   └── api/
    └── package.json
```

## 功能特性

### 链码功能 (Go)
- 农产品资产创建与管理
- 流转记录追踪（农场 → 加工厂 → 物流 → 消费者）
- 检测报告记录
- 完整溯源历史查询

### 后端功能 (Node.js)
- Fabric SDK 集成
- RESTful API 接口
- JWT 身份认证
- 多角色权限控制
- SQLite 数据库存储链外数据（图片、报告）
- 二维码生成
- 文件上传

### 前端功能 (Vue3)
- 多角色登录系统
- 农产品管理（新增、列表、详情）
- 产品流转管理
- 质检报告管理
- 摄像头扫码溯源
- 手动输入ID查询
- 二维码生成与下载
- 响应式界面

## 快速开始

### 1. 启动后端服务

```bash
cd backend
npm install
npm start
```

后端服务运行在 http://localhost:3000

### 2. 启动前端服务

```bash
cd frontend
npm install
npm run dev
```

前端服务运行在 http://localhost:5173

## 演示账号

| 角色 | 用户名 | 密码 |
|------|--------|------|
| 农场 | farm_admin | farm123 |
| 加工厂 | factory_admin | factory123 |
| 物流 | logistics_admin | logistics123 |
| 质检员 | inspector | inspector123 |

## API 接口

### 认证
- `POST /api/auth/login` - 用户登录
- `GET /api/auth/me` - 获取当前用户信息

### 农产品
- `GET /api/produce` - 获取农产品列表
- `POST /api/produce` - 创建农产品
- `GET /api/produce/:id` - 获取农产品详情
- `GET /api/produce/:id/history` - 获取溯源历史
- `POST /api/produce/:id/transfer` - 产品流转
- `POST /api/produce/:id/report` - 添加检测报告

### 文件上传
- `POST /api/upload/image/:produceId` - 上传产品图片
- `POST /api/upload/report/:reportId/:produceId` - 上传报告文件
- `GET /api/upload/images/:produceId` - 获取产品图片列表
- `GET /api/upload/reports/:produceId` - 获取报告文件列表

### 二维码
- `GET /api/qr/generate/:produceId` - 生成溯源二维码
- `GET /api/qr/download/:produceId` - 下载二维码图片

## 角色权限

| 功能 | 农场 | 加工厂 | 物流 | 质检员 |
|------|------|--------|------|--------|
| 创建农产品 | ✅ | ✅ | ❌ | ❌ |
| 产品流转 | ✅ | ✅ | ✅ | ❌ |
| 添加质检报告 | ❌ | ✅ | ❌ | ✅ |
| 查看数据 | ✅ | ✅ | ✅ | ✅ |

## 溯源流程

1. **农场** 创建农产品记录，上传图片
2. **农场** 将产品流转给**加工厂**
3. **加工厂/质检员** 添加质检报告
4. **加工厂** 将产品流转给**物流**
5. **物流** 将产品配送到终端
6. **消费者** 扫码查看完整溯源信息

## Fabric 链码部署

链码使用 Go 语言编写，需要部署到 Hyperledger Fabric 网络：

1. 打包链码
```bash
cd chaincode
go mod tidy
peer lifecycle chaincode package produce.tar.gz --path . --lang golang --label produce_1
```

2. 安装并批准链码
3. 提交链码定义

## 技术栈

- **区块链**: Hyperledger Fabric 2.x
- **链码**: Go 1.21
- **后端**: Node.js + Express + Fabric SDK
- **前端**: Vue 3 + Element Plus + Pinia + Vue Router
- **数据库**: SQLite (链外数据存储)
- **二维码**: QRCode + html5-qrcode

## 注意事项

1. 当前版本使用模拟数据替代真实 Fabric 网络连接，便于快速演示
2. 生产环境需要配置真实的 Fabric 网络连接信息
3. 请妥善保管私钥和证书文件
4. 建议使用 HTTPS 确保数据传输安全
