# IPMI 风扇监控与控制应用

一个基于 Electron 的桌面应用，通过 IPMI (ipmitool) 监控服务器风扇转速和温度，支持 PWM 占空比手动设置，并绘制转速-温度曲线。

## 功能特性

- 实时监控服务器风扇转速
- 实时监控服务器各温度传感器数据
- 自动/手动风扇控制模式切换
- PWM 占空比手动调节（0-100%）
- 多风扇区域选择
- 转速-温度实时曲线绘制
- 可配置的数据刷新间隔
- 深色主题界面

## 系统要求

- 操作系统：macOS / Linux / Windows
- 已安装 `ipmitool` 工具
- 服务器支持 IPMI 接口

### 安装 ipmitool

**macOS:**
```bash
brew install ipmitool
```

**Ubuntu/Debian:**
```bash
sudo apt-get install ipmitool
```

**CentOS/RHEL:**
```bash
sudo yum install ipmitool
```

## 安装与运行

### 1. 安装依赖

```bash
# 修复 npm 权限问题（如需要）
sudo chown -R $(whoami) ~/.npm

# 安装项目依赖
npm install
```

### 2. 运行应用

```bash
npm start
```

## 使用说明

### 风扇转速监控
- 左侧面板显示所有检测到的风扇实时转速
- 数据自动刷新，可配置刷新间隔（1-10秒）

### 温度监控
- 显示所有温度传感器数据（CPU、系统、外设等）
- 温度数值以橙色高亮显示

### 风扇控制模式

**自动模式：**
- 风扇转速由 BMC 自动控制
- PWM 控制功能禁用

**手动模式：**
- 切换到手动模式后可手动设置 PWM 占空比
- 支持滑块调节和预设按钮（20%、40%、60%、80%、100%）
- 可选择不同的风扇区域（Zone 0 / Zone 1）

### 曲线图表

**转速-温度曲线：**
- 显示所有风扇和温度传感器的历史数据
- 可通过复选框切换显示/隐藏风扇或温度数据
- 支持清除历史数据

**实时监控曲线：**
- 显示平均转速和平均温度的趋势
- 双 Y 轴分别显示转速和温度

## 项目结构

```
.
├── main.js          # Electron 主进程
├── index.html       # 应用界面
├── renderer.js      # 渲染进程逻辑
├── style.css        # 样式文件
├── package.json     # 项目配置
└── README.md        # 说明文档
```

## IPMI 命令说明

应用使用以下 ipmitool 命令：

**读取传感器数据：**
```bash
ipmitool sensor list | grep -i fan    # 风扇转速
ipmitool sensor list | grep -i temp   # 温度数据
```

**风扇控制：**
```bash
ipmitool raw 0x3a 0x00                # 设置手动模式
ipmitool raw 0x3a 0x02                # 设置自动模式
ipmitool raw 0x3a 0x01 <zone> <duty>  # 设置 PWM 占空比
```

## 注意事项

1. **权限要求：** 运行 ipmitool 可能需要 root 或管理员权限
2. **IPMI 配置：** 确保服务器 IPMI 接口已正确配置并启用
3. **模拟数据：** 如无真实 IPMI 设备，可在 `renderer.js` 中设置 `mockData = true` 查看演示效果
4. **风扇区域：** 不同服务器的风扇区域编号可能不同，请根据实际硬件调整

## 开发模式

如需使用模拟数据测试界面，修改 `renderer.js` 第 15 行：

```javascript
const mockData = true;  // 启用模拟数据
```

## 许可证

MIT License
