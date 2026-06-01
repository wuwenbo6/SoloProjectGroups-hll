# HART FSK Modem

基于Electron的HART协议音频调制解调器应用，通过声卡实现FSK调制（1200Hz/2200Hz），将HART命令编码为音频信号并解码响应，实时显示现场设备参数。

## 功能特性

- **FSK调制解调**：Bell 202标准，1200Hz代表Mark(1)，2200Hz代表Space(0)，1200波特率
- **HART协议支持**：命令帧封装、校验计算、响应解析
- **实时参数监控**：PV（过程变量）、SV（设定值）、TV、FV实时显示
- **趋势图表**：参数变化趋势可视化
- **波形显示**：实时音频波形监控
- **命令终端**：预定义命令快速发送，自定义命令支持
- **音频设备管理**：输入/输出设备选择，增益调节

## 技术栈

- **桌面框架**：Electron 28
- **前端框架**：React 18 + TypeScript
- **构建工具**：Vite + electron-vite
- **状态管理**：Zustand
- **样式方案**：TailwindCSS 3
- **图表库**：Recharts
- **图标库**：Lucide React

## 核心模块

### FSK Modem ([fsk-modem.ts](src/renderer/utils/fsk-modem.ts))
- 调制：数字字节 → FSK音频信号
- 解调：FSK音频信号 → 数字字节
- 使用Goertzel算法进行频率检测
- 采样率：48000Hz，波特率：1200

### HART Protocol ([hart-protocol.ts](src/renderer/utils/hart-protocol.ts))
- HART帧结构构建和解析
- 纵向奇偶校验（LRC）
- 设备变量解析（PV, SV, TV, FV）
- 单位代码映射

### 音频管理 ([audio.ts](src/renderer/utils/audio.ts))
- Web Audio API集成
- 实时音频捕获和播放
- 带通滤波（800Hz-3000Hz）
- 波形数据采集

## 项目结构

```
src/
├── main/                # Electron 主进程
│   └── index.ts
├── preload/             # Preload 脚本
│   └── index.ts
├── renderer/            # 渲染进程 (React)
│   ├── main.tsx         # 入口
│   ├── App.tsx          # 主应用
│   ├── components/      # UI组件
│   │   ├── StatusPanel.tsx
│   │   ├── ParameterDisplay.tsx
│   │   ├── CommandTerminal.tsx
│   │   ├── WaveformDisplay.tsx
│   │   └── ControlPanel.tsx
│   ├── hooks/           # 自定义Hooks
│   │   └── useHART.ts
│   ├── store/           # 状态管理
│   │   └── deviceStore.ts
│   ├── utils/           # 工具函数
│   │   ├── fsk-modem.ts
│   │   ├── hart-protocol.ts
│   │   └── audio.ts
│   └── styles/          # 样式
│       └── index.css
└── shared/              # 共享类型
    └── types.ts
```

## 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 构建应用

```bash
npm run build
```

### 测试核心模块

```bash
node test-modem.mjs
```

## 使用说明

1. **初始化音频**：点击"Initialize Audio"按钮初始化音频系统
2. **连接设备**：点击"Connect Device"开始音频捕获
3. **发送命令**：
   - 点击快速命令按钮发送常用命令
   - 或从下拉列表选择命令后点击"Send"
   - 使用"Simulate"按钮生成模拟数据
4. **启动轮询**：点击"Start Polling"自动定期读取设备参数

## HART命令

| 命令号 | 名称 | 描述 |
|--------|------|------|
| 0 | Read Unique Identifier | 读取设备唯一标识符 |
| 1 | Read Primary Variable | 读取过程变量(PV) |
| 2 | Read Loop Current | 读取回路电流 |
| 3 | Read Dynamic Variables | 读取PV, SV, TV, FV |
| 15 | Read Device Information | 读取设备信息 |
| 16 | Read Device Variables | 读取所有设备变量 |

## FSK参数

- **Mark频率**：1200Hz（逻辑1）
- **Space频率**：2200Hz（逻辑0）
- **波特率**：1200 bps
- **采样率**：48000 Hz
- **采样/比特**：40 samples

## 设计风格

- **深色主题**：工业控制台风格
- **主色调**：蓝色 (#165DFF)
- **状态色**：绿色（正常）、红色（告警）、橙色（警告）
- **字体**：Inter（界面）+ JetBrains Mono（数据）

## 许可证

MIT License
