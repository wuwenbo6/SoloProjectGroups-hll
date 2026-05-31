# 🖨️ 票据打印机模板设计器

一个基于 Electron 的票据打印应用，支持通过 WebHID 连接票据打印机，使用 ESC/POS 指令进行打印，并提供可视化的模板设计器。

## ✨ 功能特性

- **WebHID 打印机连接** - 直接通过浏览器 HID API 连接票据打印机
- **ESC/POS 指令支持** - 支持文本、标题、条码、二维码、分割线等打印元素
- **可视化模板设计** - 拖拽式字段设计，所见即所得
- **实时预览** - 右侧实时模拟打印效果
- **模板存储** - 本地保存和管理多个打印模板
- **属性编辑** - 支持对齐方式、字体大小、粗体等属性设置

## 📦 安装

```bash
# 安装依赖
npm install

# 启动应用
npm start

# 开发模式（带开发者工具）
npm run dev
```

## 🚀 使用说明

### 1. 连接打印机

1. 点击顶部「连接打印机」按钮
2. 在弹出的设备选择框中选择你的票据打印机
3. 连接成功后左侧会显示「已连接」状态

### 2. 设计模板

从左侧字段库拖拽字段到中间设计区：

| 字段类型 | 说明 |
|---------|------|
| 📝 文本 | 普通文本内容，支持对齐和粗体 |
| 🏷️ 标题 | 大号加粗标题，支持字号调整 |
| 📊 条码 | CODE128/CODE39/UPC-A/EAN13 格式 |
| 📱 二维码 | 生成 QR 码，支持大小调整 |
| ➖ 分割线 | 虚线分割线 |
| ⬜ 空白行 | 空白间距，支持行数设置 |

### 3. 编辑字段属性

点击设计区的字段，在右侧属性面板可编辑：

- **内容** - 字段显示的文本
- **对齐方式** - 左对齐/居中/右对齐
- **粗体** - 文本加粗
- **字号倍数** - 标题的宽度和高度倍数
- **条码格式** - 选择条码编码格式
- **二维码大小** - 调整二维码尺寸

### 4. 保存和加载模板

- 点击「保存模板」按钮输入名称保存
- 在下拉框中选择已保存的模板加载
- 点击「删除」按钮删除当前模板

### 5. 打印测试

设计完成后点击「打印测试」按钮发送到打印机。

## 📁 项目结构

```
p55/
├── main.js              # Electron 主进程
├── package.json         # 项目配置
├── index.html           # 应用入口
├── css/
│   └── style.css        # 样式文件
├── js/
│   ├── app.js           # 主应用逻辑
│   ├── escpos.js        # ESC/POS 指令生成
│   └── printer.js       # WebHID 打印机管理
└── public/lib/
    ├── jsbarcode.js     # 条码生成库
    └── qrcode.js        # 二维码生成库
```

## ⚙️ 技术栈

- **Electron** - 跨平台桌面应用框架
- **WebHID API** - 人机接口设备通信
- **ESC/POS** - 票据打印机标准指令集
- **JsBarcode** - 条码生成
- **QRCode.js** - 二维码生成
- **HTML5 拖拽 API** - 模板设计器

## 🖨️ 支持的打印机

理论上支持所有兼容 ESC/POS 指令的票据打印机，包括但不限于：
- 佳博 (Gprinter) 系列
- 芯烨 (Xprinter) 系列
- 爱普生 (Epson) TM 系列
- 北洋 (BTP) 系列

## 📝 注意事项

1. **权限问题** - macOS 和 Windows 可能需要管理员权限访问 HID 设备
2. **驱动** - 部分打印机需要安装官方驱动
3. **编码** - 中文打印需要打印机支持 GB18030 编码
4. **USB 连接** - 确保打印机通过 USB 连接并被系统识别

## 🔧 开发说明

### ESC/POS 指令示例

```javascript
const escpos = new ESCPOS();
escpos.reset();
escpos.setAlign('center');
escpos.setFontSize(2, 2);
escpos.addText('标题');
escpos.newline();
escpos.printQRCode('https://example.com');
escpos.cut();

const data = escpos.toUint8Array();
```

### WebHID 发送数据

```javascript
const printer = new WebHIDPrinter();
await printer.connect();
await printer.send(data);
```

## 📄 License

MIT
