# WEP 密钥破解 Web 应用

基于 Python + Scapy + Flask 的 Web 应用，实现 WEP 加密数据包捕获、弱 IV 收集和 FMS 攻击密钥破解。

## 功能特性

- 📡 **数据包捕获**: 使用 Scapy 捕获 802.11 WEP 加密数据包
- 🔍 **弱 IV 识别**: 自动识别并收集 Fluhrer-Mantin-Shamir (FMS) 攻击所需的弱初始化向量
- 🔓 **FMS 攻击**: 实现 RC4 密钥恢复算法，支持 64-bit 和 128-bit WEP 密钥
- 📊 **实时监控**: WebSocket 实时更新捕获统计和破解进度
- 🎨 **现代界面**: 美观的响应式 Web 界面

## 项目结构

```
p246/
├── backend/
│   ├── __init__.py
│   ├── app.py              # Flask 应用主入口
│   ├── packet_capture.py   # 数据包捕获模块
│   ├── simulator.py        # 演示用模拟器
│   └── wep_cracker.py      # FMS 攻击实现
├── templates/
│   └── index.html          # 前端页面
├── static/
│   ├── css/
│   │   └── style.css       # 样式文件
│   └── js/
│       └── app.js          # 前端逻辑
├── requirements.txt        # Python 依赖
├── run.py                  # 启动脚本
└── README.md               # 说明文档
```

## 安装依赖

```bash
pip install -r requirements.txt
```

## 快速启动

```bash
python run.py
```

然后在浏览器中访问: http://localhost:5000

## 使用说明

### 1. 演示模式（默认）

默认启用模拟器模式，可以在没有真实 WEP 网络的情况下测试界面功能。

在 `backend/app.py` 中切换模式:
```python
USE_SIMULATOR = True  # 模拟器模式
# 或
USE_SIMULATOR = False  # 真实捕获模式
```

### 2. 真实捕获模式

**前置要求:**
- 支持监控模式的无线网卡
- root 权限
- 网卡已设置为监控模式

**设置网卡为监控模式:**
```bash
# Linux
sudo airmon-ng start wlan0
```

**运行:**
```bash
sudo python run.py
```

### 3. 操作步骤

1. 选择网络接口（如 mon0）
2. 可选：输入目标 BSSID 过滤特定网络
3. 点击「开始捕获」开始收集 IV
4. 收集足够弱 IV 后（建议 > 100）点击「开始破解」
5. 等待破解完成，密钥将显示在结果区域

## 技术原理

### FMS 攻击

Fluhrer-Mantin-Shamir 攻击利用 RC4 密钥调度算法 (KSA) 的弱点：

1. **弱 IV 识别**: IV 满足特定模式 `(A, 3+A, 255)` 时，密钥流第一个字节与密钥第一个字节存在相关性
2. **统计分析**: 收集大量弱 IV，通过投票机制推导出每个密钥字节
3. **密钥验证**: 使用 SNAP 头校验验证推导的密钥

### 弱 IV 条件

```
IV[2] == 255
IV[1] >= 3
(IV[0] & 0x1F) == IV[1] - 3
```

## 安全声明

⚠️ **重要提示**:
- 本工具仅用于教育目的和授权的安全测试
- 破解他人网络属于违法行为
- 使用前请确保遵守当地法律法规
- 仅在您拥有或获得书面授权的网络上使用

## 依赖说明

- **Flask**: Web 框架
- **Flask-SocketIO**: WebSocket 实时通信
- **Scapy**: 数据包捕获和解析
- **Eventlet**: 异步服务器

## 故障排除

**问题: 看不到网络接口**
- 确保以 root 权限运行
- 检查网卡是否支持监控模式

**问题: 捕获不到数据包**
- 确认网卡已设置为监控模式
- 检查信道设置（需与目标 AP 同信道）
- 调整天线位置靠近目标

**问题: 破解不成功**
- 收集更多 IV（建议 > 50,000 总 IV）
- 确保弱 IV 数量 > 100
- 尝试使用 KoreK 攻击或 PTW 攻击（需扩展）

## 许可证

MIT License - 仅供教育使用
