# SPICE USB 重定向器

一个基于 Electron 的桌面应用，通过 SPICE 协议将本地 USB 设备重定向到远程虚拟机。

## 功能特性

- ✅ 自动检测本地 USB 设备
- ✅ 实时热插拔监听
- ✅ SPICE 服务器连接管理
- ✅ USB 设备重定向/释放控制
- ✅ 设备详细信息展示
- ✅ 操作日志记录
- ✅ 现代化用户界面

## 系统要求

- Node.js 16.x 或更高版本
- npm 或 yarn
- 支持的操作系统: Windows, macOS, Linux

## 安装依赖

```bash
npm install
```

如果安装过程中遇到原生模块编译问题，请运行:

```bash
npm run rebuild
```

## 运行应用

```bash
npm start
```

开发模式（带开发者工具）:

```bash
npm run dev
```

## 构建应用

```bash
npm run build
```

## 使用说明

### 1. 连接到 SPICE 服务器

1. 在 "SPICE 服务器连接" 面板中输入服务器地址和端口
2. （可选）输入密码
3. 点击 "连接" 按钮

### 2. 管理 USB 设备

- **刷新设备列表**: 点击刷新按钮重新扫描 USB 设备
- **重定向设备**: 点击 "重定向到虚拟机" 按钮将设备转发到远程
- **释放设备**: 点击 "释放设备" 按钮将设备归还本地

### 3. 热插拔

应用会自动检测 USB 设备的插拔，并实时更新设备列表。

## 项目结构

```
.
├── main.js          # Electron 主进程
├── preload.js       # 预加载脚本（IPC 通信）
├── renderer.js      # 前端渲染逻辑
├── index.html       # 应用界面
├── styles.css       # 样式文件
└── package.json     # 项目配置
```

## 技术栈

- **Electron** - 跨平台桌面应用框架
- **usb** - Node.js USB 库
- **usb-detection** - USB 热插拔检测
- **SPICE 协议** - 远程桌面协议

## 关于 SPICE USB 重定向

当前实现包含完整的 UI 和设备检测功能。实际的 SPICE USB 重定向需要:

1. 安装 `spice-client` 或 `remote-viewer`
2. 配置 `usb-redirection` 通道
3. 实现与 `spice-gtk` 或 `libspice` 的集成

如需启用真实的 USB 重定向功能，请在 `main.js` 中的 `startUsbRedirect` 和 `stopUsbRedirect` 函数中集成真实的 SPICE 客户端库。

## 注意事项

- 某些 USB 设备可能需要特殊权限才能访问
- 重定向 USB 设备前请确保没有其他程序在使用该设备
- 建议使用 USB 3.0 或更高版本以获得最佳性能

## 许可证

MIT License
