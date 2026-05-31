# 力反馈方向盘控制器 (FFB Steering Wheel Controller)

一个基于Electron和WebHID的力反馈方向盘控制器应用，支持Logitech G29等力反馈方向盘设备。

## 功能特性

### 📡 **设备连接**
- 通过WebHID API连接力反馈方向盘
- 支持Logitech G29/G920等设备
- 实时显示方向盘角度和状态

⚙️ **力反馈效果**
- **摩擦力 (Friction)** - 模拟路面摩擦
- **阻尼力 (Damper)** - 模拟转向阻尼
- **弹簧力 (Spring)** - 自动回中效果
- 可独立开关和强度调节
- 总增益控制

📈 **响应曲线配置**
- 线性曲线
- 指数曲线
- 对数曲线
- S型曲线
- 可视化曲线预览

🧪 **测试面板**
- 左/右转向力测试
- 居中测试
- 震动测试
- 手动力控制
- 自动回中切换
- 一键停止所有效果

📋 **操作日志**
- 实时操作记录
- 日志级别显示
- 日志导出保存

## 安装运行

```bash
# 安装依赖
npm install

# 启动应用
npm start
```

## 使用说明

1. 连接方向盘设备到电脑
2. 启动应用后点击"连接设备"
3. 在设备选择对话框中选择你的方向盘
4. 调整力反馈参数或使用测试面板进行测试

## 支持的设备

- Logitech G29 Driving Force Racing Wheel
- Logitech G920 Driving Force
- Logitech G27 (需驱动支持)
- 其他兼容HID的力反馈方向盘

## 技术栈

- Electron 28+
- WebHID API
- 原生JavaScript
- Canvas 2D

## 项目结构

```
.
├── main.js      # Electron主进程
├── index.html   # 应用界面
├── app.js       # 核心逻辑
├── package.json # 项目配置
└── README.md    # 说明文档
```

## 注意事项

1. 确保方向盘已正确连接并安装驱动
2. macOS需要给予应用HID权限
3. 不同设备的HID协议可能有所差异，可能需要针对性调整
4. WebHID在某些操作系统上可能需要特殊权限配置
