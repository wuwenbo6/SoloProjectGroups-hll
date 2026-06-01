## 1. 产品概述

LwIP TCP 状态机可视化仿真平台，基于 Canvas 绘制完整的 TCP 状态转移图，用户通过点击事件按钮（connect/send/close 等）驱动状态转移，直观理解 TCP 连接生命周期。面向网络工程师、嵌入式开发者及计算机网络学习者。

## 2. 核心功能

### 2.1 功能模块

1. **状态机可视化页面**：Canvas 绘制 11 个 TCP 状态节点及所有合法转移路径，当前状态高亮，转移路径动画
2. **事件控制面板**：提供 connect（主动/被动）、send、close、recv 等事件按钮，仅当前合法事件可点击
3. **转移日志面板**：实时记录每次状态转移的详细信息（时间戳、事件、源状态→目标状态）

### 2.2 页面详情

| 页面名称 | 模块名称 | 功能描述 |
|----------|----------|----------|
| 状态机可视化页 | Canvas 状态图 | 绘制 11 个状态节点（CLOSED/LISTEN/SYN_SENT/SYN_RCVD/ESTABLISHED/FIN_WAIT_1/FIN_WAIT_2/CLOSING/TIME_WAIT/CLOSE_WAIT/LAST_ACK）及转移边，当前状态发光高亮，转移时边流动动画 |
| 状态机可视化页 | 事件控制面板 | 左侧面板，显示当前状态及可用事件按钮，不可用事件置灰，支持主动 OPEN / 被动 OPEN / SEND / CLOSE / RCV 等操作 |
| 状态机可视化页 | 转移日志 | 右下角面板，滚动列表显示历史转移记录，含时间戳、事件名、状态变化 |
| 状态机可视化页 | 状态信息卡 | 悬停状态节点时显示该状态的详细描述及 LwIP 对应函数调用 |

## 3. 核心流程

用户打开页面 → 看到 CLOSED 状态高亮 → 点击"被动OPEN" → 状态转移到 LISTEN → 点击"主动OPEN"（模拟远端 SYN）→ 转移到 SYN_RCVD → 点击"ACK" → 转移到 ESTABLISHED → 点击"SEND" → 数据发送动画 → 点击"CLOSE" → 进入 FIN_WAIT_1 → … → 最终回到 CLOSED。

```mermaid
flowchart TD
    "CLOSED" -->|"被动OPEN"| "LISTEN"
    "CLOSED" -->|"主动OPEN"| "SYN_SENT"
    "LISTEN" -->|"SYN(rcvd)"| "SYN_RCVD"
    "LISTEN" -->|"CLOSE"| "CLOSED"
    "SYN_SENT" -->|"SYN+ACK(rcvd)"| "ESTABLISHED"
    "SYN_SENT" -->|"CLOSE"| "CLOSED"
    "SYN_RCVD" -->|"ACK(rcvd)"| "ESTABLISHED"
    "SYN_RCVD" -->|"CLOSE"| "FIN_WAIT_1"
    "ESTABLISHED" -->|"CLOSE"| "FIN_WAIT_1"
    "ESTABLISHED" -->|"FIN(rcvd)"| "CLOSE_WAIT"
    "FIN_WAIT_1" -->|"ACK(rcvd)"| "FIN_WAIT_2"
    "FIN_WAIT_1" -->|"FIN(rcvd)"| "CLOSING"
    "FIN_WAIT_1" -->|"FIN+ACK(rcvd)"| "TIME_WAIT"
    "FIN_WAIT_2" -->|"FIN(rcvd)"| "TIME_WAIT"
    "CLOSING" -->|"ACK(rcvd)"| "TIME_WAIT"
    "CLOSE_WAIT" -->|"CLOSE"| "LAST_ACK"
    "LAST_ACK" -->|"ACK(rcvd)"| "CLOSED"
    "TIME_WAIT" -->|"超时(2MSL)"| "CLOSED"
```

## 4. 用户界面设计

### 4.1 设计风格

- **主色调**：深色科技风（#0a0e17 深空蓝底色），节点用青色（#00e5ff）和琥珀色（#ffab00）区分客户端/服务端状态
- **按钮风格**：圆角胶囊按钮，可用时发光边框，不可用时半透明灰色
- **字体**：显示字体 JetBrains Mono（代码/技术感），正文 Noto Sans SC
- **布局**：全屏 Canvas 为主体，左侧浮动事件面板，右下角浮动日志面板
- **图标**：lucide-react 线性图标
- **动画**：状态转移时边线流动粒子效果，节点脉冲发光

### 4.2 页面设计概览

| 页面名称 | 模块名称 | UI 元素 |
|----------|----------|---------|
| 状态机可视化页 | Canvas 状态图 | 深色背景，圆形节点带发光光晕，贝塞尔曲线连线带箭头，转移时粒子沿路径流动 |
| 状态机可视化页 | 事件控制面板 | 半透明毛玻璃面板，胶囊按钮组，当前状态名称大字显示 |
| 状态机可视化页 | 转移日志 | 半透明毛玻璃面板，等宽字体日志行，最新条目高亮 |

### 4.3 响应式

桌面优先设计，Canvas 自适应全屏，面板在窄屏时折叠为底部抽屉。
