# CEC Monitor - HDMI CEC消息监控工具

一个基于Electron的HDMI-CEC消息监控与分析工具，支持通过USB转CEC适配器（如Pulse-Eight）捕获和解析CEC消息。

## 功能特性

- ✅ **CEC消息捕获** - 通过USB-CEC适配器实时捕获HDMI-CEC消息
- ✅ **消息解析** - 自动解析操作码，包括电源待机(0x36)、一键播放(0x6B)等
- ✅ **时序图展示** - 以SVG时序图直观展示设备间的消息交互
- ✅ **设备识别** - 自动识别16种CEC逻辑地址设备类型
- ✅ **分类过滤** - 按消息类别（电源、播放、遥控器、音频等）过滤显示
- ✅ **自定义命令** - 支持发送原始十六进制消息和自定义命令
- ✅ **快速命令** - 预设常用命令按钮（电源开/关、播放、音量控制等）
- ✅ **模拟模式** - 无硬件时自动进入模拟模式，便于开发测试

## 支持的操作码

| 操作码 | 名称 | 说明 |
|--------|------|------|
| 0x04 | Image View On | 设备从待机唤醒 |
| 0x36 | Standby | 设备进入待机模式 |
| 0x6B | Play | 一键播放 |
| 0x41 | User Control Pressed | 遥控器按键按下 |
| 0x42 | User Control Released | 遥控器按键释放 |
| 0x82 | Active Source | 激活信号源 |
| ... | ... | 支持超过50种CEC操作码 |

## 项目结构

```
p138/
├── main.js              # Electron主进程，处理CEC通信
├── index.html           # 前端HTML页面
├── renderer.js          # 前端渲染逻辑
├── styles.css           # 样式文件
├── src/
│   └── cecParser.js     # CEC消息解析模块
├── package.json         # 项目配置
└── README.md            # 说明文档
```

## 安装与运行

### 前置要求

1. **Node.js** (v16+)
2. **USB-CEC适配器** (如Pulse-Eight HDMI-CEC Adapter) - 可选
3. **libcec** - 如需真实硬件支持，需安装libcec和cec-client

### 安装依赖

```bash
npm install
```

### 运行应用

```bash
npm start
```

开发模式（带DevTools）：
```bash
npm run dev
```

## 使用说明

### 1. 连接适配器

点击"连接适配器"按钮：
- 如果检测到`cec-client`，将使用真实硬件
- 如未检测到硬件，自动进入**模拟模式**，会定期发送模拟消息

### 2. 查看时序图

- 左侧显示参与通信的CEC设备
- 每条消息用带箭头的线表示消息流向
- 鼠标悬停可查看详细信息
- 不同颜色代表不同类别的消息

### 3. 发送命令

**快速命令**：点击预设按钮快速发送常用命令

**自定义命令**：
- 选择发送设备和目标设备
- 选择操作码（Opcode）
- 可选：输入参数（十六进制，空格分隔）
- 点击"发送自定义命令"

**原始消息**：
- 直接输入十六进制消息（如：`4F82`）
- 点击"发送原始消息"

### 4. 消息过滤

在左侧边栏勾选/取消勾选消息类别，可实时过滤时序图显示。

## 技术实现

### CEC消息格式

```
+-----------------+-----------------+-------------------+
|   Header (1B)   |  Opcode (1B)    |  Parameters (0-NB)|
+--------+--------+-----------------+-------------------+
|Initiator|Dest.  |   Operation     |   Parameter Data  |
| (4bits) |(4bits)|      Code       |                   |
+--------+--------+-----------------+-------------------+
```

### 示例消息解析

**原始消息**: `4036`
- **Header**: `0x40` → Initiator: Playback 1 (0x4), Destination: TV (0x0)
- **Opcode**: `0x36` → Standby（电源待机）
- **Parameters**: 无

**原始消息**: `044130`
- **Header**: `0x04` → Initiator: TV (0x0), Destination: Playback 1 (0x4)
- **Opcode**: `0x41` → User Control Pressed
- **Parameters**: `0x30` → Power按键

## 硬件要求（真实模式）

### 支持的适配器

- Pulse-Eight USB-CEC Adapter
- Raspberry Pi（内置CEC功能）
- 其他兼容libcec的USB-CEC适配器

### 安装libcec（macOS）

```bash
brew install libcec
```

### 安装libcec（Ubuntu/Debian）

```bash
sudo apt-get install cec-utils libcec-dev
```

## 开发说明

### 主进程 (main.js)

- 管理CEC适配器连接
- 处理cec-client子进程
- 通过IPC与渲染进程通信
- 模拟模式下生成测试数据

### 解析模块 (src/cecParser.js)

- `parseCECMessage()` - 解析原始CEC消息
- `buildCECMessage()` - 构建CEC消息
- `getOpcodeList()` / `getDeviceList()` - 获取操作码和设备列表

### 渲染进程 (renderer.js)

- SVG时序图渲染
- 消息分类过滤
- 命令发送表单
- 实时消息日志

## 常见问题

**Q: 为什么显示"模拟模式"？**
A: 未检测到cec-client或CEC适配器，应用自动进入模拟模式，定期发送模拟消息便于演示。

**Q: 如何连接真实的CEC适配器？**
A: 确保已安装libcec，插入USB-CEC适配器后重启应用。

**Q: 支持哪些CEC设备类型？**
A: 支持全部16种CEC逻辑地址，包括TV、Recording、Playback、Tuner、Audio System等。

## License

MIT
