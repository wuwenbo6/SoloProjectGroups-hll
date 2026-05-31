# USB Monitor - Electron USB 监控应用

一个基于 Electron 的 USB 设备监控应用，支持捕获 USB 通信、解析设备描述符、显示事务日志(URB)。

## 功能特性

- ✅ USB 设备枚举和描述符解析
- ✅ 设备描述符、配置描述符、接口、端点详细信息显示
- ✅ URB (USB Request Block) 事务日志实时显示
- ✅ 按方向、类型、端点过滤
- ✅ 数据包内容搜索
- ✅ 十六进制数据查看器
- ✅ PCAP 文件保存和加载
- ✅ C++ Addon 高性能数据处理

## 项目结构

```
p13/
├── src/
│   ├── main.js              # Electron 主进程
│   ├── renderer/
│   │   ├── index.html       # 前端界面
│   │   └── renderer.js      # 渲染进程逻辑
│   └── addon/               # C++ Node.js Addon
│       ├── usb-monitor.h
│       ├── usb-monitor.cpp
│       └── usb-device.cpp
├── binding.gyp              # node-gyp 配置
├── package.json
└── README.md
```

## 安装依赖

```bash
npm install
```

## 编译 C++ Addon (可选)

### 前置要求

- macOS: `brew install libusb`
- Linux: `sudo apt-get install libusb-1.0-0-dev`
- Windows: 下载 libusb 二进制文件

### 编译

```bash
npm run rebuild
```

## 运行应用

```bash
npm start
```

## 使用说明

1. **刷新设备**: 点击"刷新设备"按钮扫描连接的 USB 设备
2. **查看设备详情**: 在左侧设备列表中点击设备查看描述符信息
3. **开始捕获**: 点击"开始捕获"按钮开始记录 USB 通信
4. **过滤**: 使用上方的过滤器按方向、类型、端点筛选数据包
5. **搜索**: 在搜索框输入十六进制或关键词搜索数据包
6. **查看数据**: 点击数据包在下方十六进制查看器中查看原始数据
7. **保存/加载**: 支持将捕获数据保存为 PCAP 格式，或加载已有 PCAP 文件

## 技术栈

- **Electron 30**: 跨平台桌面应用框架
- **node-usb**: USB 设备访问
- **libusb**: 底层 USB 库 (C++ Addon)
- **Node-API/NAN**: C++ Addon 接口
- **PCAP**: 网络数据包捕获格式

## 代码架构说明

### 主进程 (main.js)
- 管理 Electron 窗口生命周期
- 通过 IPC 与渲染进程通信
- 集成 node-usb 进行设备枚举
- 处理 C++ Addon 回调
- 实现 PCAP 文件读写

### 渲染进程 (renderer.js)
- React-style 纯 JS UI 框架
- 设备列表和详情面板
- 数据包表格和过滤器
- 十六进制查看器

### C++ Addon (usb-monitor.cpp)
- 使用 libusb 进行底层 USB 访问
- 多线程数据包捕获
- 高性能数据处理
- 异步回调到 JavaScript
