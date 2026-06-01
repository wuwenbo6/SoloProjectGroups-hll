# 固件管理系统 (Node.js + CoAP)

一个基于 CoAP 协议的物联网设备固件管理系统，支持分块传输、断点续传和分块校验。

## 功能特性

- ✅ **固件管理**: 支持上传 BIN/HEX 格式固件文件
- ✅ **设备管理**: 设备注册、状态监控
- ✅ **CoAP 分块传输**: 每个固件块独立传输，适合物联网设备
- ✅ **分块校验**: 每个数据块附带 MD5 校验，确保传输完整性
- ✅ **断点续传**: 支持从上次中断的块继续下载
- ✅ **升级记录**: 完整记录每次升级的进度和状态
- ✅ **Web 管理界面**: 友好的可视化管理界面

## 技术栈

- **后端**: Node.js + Express + CoAP
- **数据库**: SQLite (better-sqlite3)
- **前端**: 原生 HTML/JavaScript

## 项目结构

```
.
├── server/
│   ├── index.js          # 服务入口
│   ├── db.js             # 数据库层
│   ├── http-server.js    # HTTP API 服务
│   └── coap-server.js    # CoAP 服务
├── client/
│   └── device-simulator.js  # 设备模拟器
├── public/
│   ├── index.html        # Web 管理界面
│   └── app.js            # 前端逻辑
├── scripts/
│   └── generate-test-firmware.js  # 生成测试固件
├── firmware/             # 固件文件存储目录
├── config.js             # 配置文件
├── package.json
└── README.md
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动服务

```bash
npm start
```

服务启动后:
- HTTP 管理界面: http://localhost:3000
- CoAP 服务: coap://localhost:5683

### 3. 生成测试固件

```bash
node scripts/generate-test-firmware.js 10240
```

### 4. 启动设备模拟器（新终端）

```bash
node client/device-simulator.js my_device_001 "测试设备"
```

## 使用流程

### 1. 上传固件

1. 打开 http://localhost:3000
2. 在「固件管理」页面上传固件文件（.bin 或 .hex）
3. 填写版本号和名称

### 2. 注册设备

方式一: 通过 Web 界面手动注册
方式二: 设备通过 CoAP 自动注册

### 3. 发起升级

1. 进入「升级记录」页面
2. 选择设备和目标固件版本
3. 点击「开始升级」

### 4. 设备端升级流程

设备模拟器会自动执行以下流程:

```
设备注册 → 检查升级 → 分块下载 → 块校验 → 
进度上报 → 完成校验 → 版本更新
```

## CoAP API 说明

### 设备注册
```
POST coap://localhost:5683/register
Payload: { "deviceId": "dev001", "name": "Device 1", "version": "v1.0.0" }
```

### 检查升级
```
GET coap://localhost:5683/check/{deviceId}
```

响应:
```json
{
  "upgradeAvailable": true,
  "recordId": 1,
  "firmwareId": 1,
  "version": "v2.0.0",
  "totalBlocks": 10,
  "currentBlock": 0,
  "checksum": "md5_hash"
}
```

### 获取固件块
```
GET coap://localhost:5683/block/{recordId}/{blockNum}
```

响应:
```json
{
  "block": 0,
  "totalBlocks": 10,
  "data": "base64_encoded_data",
  "checksum": "md5_of_block",
  "size": 1024
}
```

### 上报进度
```
POST coap://localhost:5683/progress
Payload: { "recordId": 1, "blockNum": 5, "deviceId": "dev001" }
```

### 完成升级
```
POST coap://localhost:5683/complete
Payload: { 
  "recordId": 1, 
  "success": true, 
  "errorMessage": null,
  "deviceId": "dev001",
  "version": "v2.0.0"
}
```

## HTTP API 说明

### 固件管理
- `POST /api/firmware/upload` - 上传固件
- `GET /api/firmware` - 获取固件列表
- `GET /api/firmware/:id` - 获取单个固件信息
- `DELETE /api/firmware/:id` - 删除固件

### 设备管理
- `GET /api/devices` - 获取设备列表
- `GET /api/devices/:deviceId` - 获取单个设备信息
- `POST /api/devices/register` - 注册设备

### 升级管理
- `POST /api/upgrade/start` - 发起升级
- `GET /api/upgrade/history/:deviceId` - 获取设备升级历史
- `GET /api/upgrade/status/:recordId` - 获取升级状态

## 断点续传说明

系统支持断点续传功能：

1. 每次升级记录会保存 `current_block`（已完成的块号）
2. 设备重新连接时，通过 `/check/{deviceId}` 获取当前进度
3. 设备从 `current_block` 开始继续下载
4. 所有块下载完成后，重新校验完整固件 MD5

## 配置说明

编辑 [config.js](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p72/config.js) 可修改:

```javascript
{
  httpPort: 3000,           // HTTP 服务端口
  coapPort: 5683,           // CoAP 服务端口
  blockSize: 1024,          // 每个块大小 (字节)
  firmwareDir: './firmware',// 固件存储目录
  dbPath: './firmware.db',  // 数据库路径
  maxFirmwareSize: 10 * 1024 * 1024  // 最大固件大小 10MB
}
```
