# AVR Flasher Web

基于 WebSocket 的 avrdude 图形界面前端，用于 AVR 单片机固件烧录工具。

## 功能特性

- 📤 HEX 文件上传（支持拖拽上传）
- 🔧 支持多种芯片型号（ATmega328P, ATmega2560, ATtiny85 等）
- 💻 支持多种烧录器（USBasp, AVRISP, USBtinyISP 等）
- 🌐 WebSocket 实时通信
- 📊 实时烧录进度显示
- 📝 彩色日志实时日志输出
- ⏹️ 支持烧录过程中可随时停止
- ⚡ **ISP 时钟调节**：支持 -B 参数降低时钟（默认 10µs），提高烧录稳定性
- 🔍 **芯片签名验证**：烧录前自动读取芯片签名并与预期对比，不匹配则告警并终止
- 💓 **WebSocket 心跳保活**：Ping/Pong 机制保持连接，自动检测断线
- 🔐 **熔丝位编辑器**：可视化位掩码编辑，直观配置熔丝位，读取/写入熔丝位
- 💾 **EEPROM 独立操作**：支持单独读取和写入 EEPROM，Hex 数据预览

## 项目结构

```
p219/
├── frontend/          # 前端 React 应用
│   ├── src/
│   │   ├── components/   # React 组件
│   │   ├── hooks/       # 自定义 Hooks
│   │   └── types.ts    # TypeScript 类型定义
│   └── ...
├── backend/           # 后端 WebSocket 服务
│   ├── src/
│   │   ├── index.ts    # 服务入口
│   │   ├── avrdude.ts # avrdude 命令封装
│   │   └── types.ts    # 类型定义
│   └── uploads/       # 上传文件目录
│   └── ...
└── .trae/documents/  # 项目文档
    ├── PRD.md          # 产品需求文档
    └── 技术架构.md     # 技术架构文档
```

## 前置要求

- Node.js >= 16
- avrdude 命令行工具（必须安装并在 PATH 中可用）

### 安装 avrdude:

**macOS:**
```bash
brew install avrdude
```

**Ubuntu/Debian:**
```bash
sudo apt-get install avrdude
```

**Windows:**
从 http://savannah.nongnu.org/projects/avrdude/ 下载并添加到 PATH

## 快速开始

### 1. 安装依赖

**后端:**
```bash
cd backend
npm install
```

**前端:**
```bash
cd frontend
npm install
```

### 2. 启动服务

**方式一：分别启动

启动后端服务 (端口 3001):
```bash
cd backend
npm run dev
```

启动前端开发服务器 (端口 3000):
```bash
cd frontend
npm run dev
```

**方式二：使用 concurrently 同时启动

在项目根目录:
```bash
npm install
npm run dev
```

### 3. 访问应用

打开浏览器访问 http://localhost:3000

## 使用说明

1. **上传固件文件**
   - 点击或拖拽 .hex 文件到上传区域
   - 支持的文件格式：Intel HEX (.hex)

2. **选择配置**
   - 目标芯片：选择要烧录的单片机型号
   - 烧录器：选择使用的烧录器类型
   - 端口（可选）：指定串口设备路径
   - 波特率（可选）：设置通信波特率

3. **执行操作

   - **开始烧录**：将固件烧录到芯片
   - **擦除芯片**：清除芯片内容
   - **停止**：中断当前操作

4. **查看日志**
   - 右侧实时显示烧录过程中的日志
   - 支持自动滚动和手动清空

## 支持的芯片

### 芯片列表

- ATmega328P (Arduino Uno)
- ATmega2560 (Arduino Mega)
- ATmega32U4 (Arduino Leonardo)
- ATtiny85
- ATmega168
- ATmega8

### 烧录器列表

- USBasp
- AVR ISP
- AVRISP mkII
- STK500 v1/v2
- USBtinyISP
- Arduino as ISP
- Pololu USB AVR Programmer

## API 接口

### REST API

- `GET /api/config` - 获取支持的芯片和烧录器配置
- `POST /api/upload` - 上传 HEX 文件

### WebSocket 消息

**客户端发送:**

```json
{
  "type": "flash",
  "payload": {
    "hexFile": "filename.hex",
    "mcu": "m328p",
    "programmer": "usbasp",
    "port": "/dev/ttyUSB0",
    "baudRate": 115200,
    "bitClock": 10,
    "verifySignature": true
  }
}
```

**客户端消息类型:**
- `flash` - 执行烧录操作
- `erase` - 执行擦除操作
- `stop` - 停止当前操作
- `pong` - 心跳响应

**服务端推送:**

```json
{
  "type": "log",
  "payload": {
    "message": "日志内容",
    "level": "info",
    "timestamp": 1234567890
  }
}
```

**服务端消息类型:**
- `log` - 日志输出
- `progress` - 进度更新 (0-100)
- `status` - 状态变更
- `error` - 错误信息
- `complete` - 操作完成
- `signature_warning` - 签名不匹配警告
- `ping` - 心跳请求
- `fuses_data` - 熔丝位数据
- `eeprom_data` - EEPROM 数据

## 技术栈

**前端:**
- React 18
- TypeScript
- Tailwind CSS
- Vite
- WebSocket

**后端:**
- Node.js
- Express
- ws (WebSocket)
- TypeScript
- multer (文件上传)

## 许可证

MIT
