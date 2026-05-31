# 电子负载控制器 (Electronic Load Controller)

一个基于Electron的可编程电子负载控制应用，支持通过WebUSB连接BK8540等设备。

## 功能特性

- 🔌 **WebUSB连接**: 直接通过WebUSB协议连接电子负载设备
- 🎛️ **多模式控制**: 支持恒流(CC)、恒压(CV)、恒阻(CR)、恒功率(CP)四种模式
- 📊 **实时数据采集**: 实时采集电压、电流、功率数据
- 📈 **伏安特性曲线**: 展示I-V特性曲线和实时趋势图
- 🔄 **序列测试**: 支持自动步进序列测试
- 📋 **CSV导出**: 测试数据可导出为CSV格式
- 📝 **日志记录**: 完整的操作日志记录系统

## 项目结构

```
p38/
├── package.json      # 项目配置
├── main.js           # Electron主进程
├── index.html        # 前端界面
├── styles.css        # 样式文件
├── renderer.js       # 前端逻辑
└── README.md         # 说明文档
```

## 安装运行

### 1. 安装依赖

```bash
npm install
```

### 2. 启动应用

```bash
npm start
```

### 3. 开发模式（带DevTools）

```bash
npm run dev
```

### 4. 打包应用

```bash
npm run build
```

## 使用说明

### 连接设备

1. 点击"连接设备"按钮
2. 在弹出的设备选择框中选择你的电子负载（如BK8540）
3. 连接成功后状态指示灯变绿

> **注意**: 如无实际设备，应用将以模拟模式运行，生成模拟数据供测试。

### 控制模式

1. **恒流模式(CC)**: 设置恒定电流值
2. **恒压模式(CV)**: 设置恒定电压值
3. **恒阻模式(CR)**: 设置恒定电阻值
4. **恒功率模式(CP)**: 设置恒定功率值

### 数据采集

1. 选择采样间隔（100ms/200ms/500ms/1000ms）
2. 点击"开始采集"开始记录数据
3. 点击"停止采集"暂停记录
4. 点击"清空数据"清除所有历史数据

### 序列测试

1. 设置起始值、终止值、步进值
2. 设置每步停留时间（秒）
3. 选择测试模式（恒流步进/恒压步进）
4. 点击"开始序列"启动自动测试
5. 可保存/加载序列配置

### 数据导出

1. 采集数据后，点击"导出CSV"
2. 选择保存位置
3. 数据将包含时间戳、电压、电流、功率和模式信息

## 支持的设备

- BK Precision 8540 系列电子负载
- 其他支持USBTMC/SCPI协议的电子负载（需适配VID/PID）

## SCPI命令参考

应用使用标准SCPI协议与设备通信：

| 命令 | 说明 |
|------|------|
| `*IDN?` | 查询设备ID |
| `MEAS:VOLT?` | 测量电压 |
| `MEAS:CURR?` | 测量电流 |
| `FUNC <mode>` | 设置工作模式 |
| `CURR <value>` | 设置电流值 |
| `VOLT <value>` | 设置电压值 |
| `RES <value>` | 设置电阻值 |
| `POW <value>` | 设置功率值 |
| `INP ON/OFF` | 开启/关闭输入 |

## 技术栈

- **Electron 28**: 跨平台桌面应用框架
- **Chart.js 4**: 数据可视化图表库
- **Winston**: 日志记录库
- **WebUSB API**: USB设备通信

## 日志位置

应用日志存储在：
- macOS: `~/Library/Application Support/electronic-load-controller/logs/`
- Windows: `%APPDATA%\electronic-load-controller\logs\`
- Linux: `~/.config/electronic-load-controller/logs/`

## 注意事项

1. **USB权限**: 在Linux系统下可能需要配置udev规则
2. **设备驱动**: Windows系统可能需要安装WinUSB驱动
3. **模拟模式**: 无设备时自动进入模拟模式，数据为模拟生成

## 许可证

MIT License
