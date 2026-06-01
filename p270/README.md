# iSCSI 目标器 (Python 实现)

一个纯 Python 实现的 iSCSI 目标器，支持多 LUN，处理标准 SCSI 命令，并提供 Web 管理面板实时显示连接会话。

## 功能特性

- ✅ 纯 Python 实现，无需额外系统依赖
- ✅ 支持多 LUN 配置
- ✅ 处理核心 SCSI 命令：
  - INQUIRY - 设备查询
  - READ(10) - 读取数据
  - WRITE(10) - 写入数据
  - READ CAPACITY(10) - 读取容量
  - TEST UNIT READY - 设备就绪测试
  - REPORT LUNS - 报告 LUN 列表
  - MODE SENSE - 模式感知
- ✅ 实时会话管理
- ✅ Web 管理面板（WebSocket 实时更新）
- ✅ 数据读写统计

## 项目结构

```
p270/
├── iscsi_target/          # iSCSI 核心模块
│   ├── __init__.py
│   ├── iscsi_pdu.py       # iSCSI PDU 协议定义
│   ├── scsi_handler.py    # SCSI 命令处理器
│   ├── lun.py             # LUN 管理
│   ├── session.py         # 会话管理
│   └── target.py          # iSCSI 目标器主类
├── web/                   # Web 管理面板
│   ├── __init__.py
│   ├── app.py             # Flask 应用
│   ├── templates/
│   │   └── index.html     # 管理面板前端
│   └── static/
├── storage/               # LUN 存储目录
├── config.py              # 配置文件
├── main.py                # 主入口
├── requirements.txt       # Python 依赖
└── README.md
```

## 安装

1. 克隆或下载项目

2. 安装 Python 依赖：

```bash
pip install -r requirements.txt
```

## 配置

编辑 `config.py` 文件：

```python
# iSCSI 目标配置
ISCSI_TARGET_NAME = 'iqn.2024-01.example:storage:target1'
ISCSI_HOST = '0.0.0.0'
ISCSI_PORT = 3260

# Web 面板配置
WEB_HOST = '0.0.0.0'
WEB_PORT = 5000

# LUN 配置
LUNS = [
    {
        'id': 0,
        'filename': 'lun0.img',
        'size_mb': 100
    },
    {
        'id': 1,
        'filename': 'lun1.img',
        'size_mb': 50
    }
]
```

## 运行

```bash
sudo python3 main.py
```

注意：iSCSI 默认使用 3260 端口，需要 root 权限运行。

运行后会显示：
- iSCSI 服务启动信息
- LUN 加载情况
- Web 管理面板地址

## 访问 Web 管理面板

打开浏览器访问：`http://localhost:5000`

管理面板显示：
- 服务状态
- 活动会话列表（实时更新）
  - 发起器名称和地址
  - 连接时长
  - 命令计数
  - 数据读写统计
- 可用 LUN 列表
  - LUN ID
  - 容量信息
  - 存储位置
- 目标器信息

## 客户端连接

### Linux (open-iscsi)

1. 安装 open-iscsi：

```bash
sudo apt-get install open-iscsi  # Debian/Ubuntu
# 或
sudo yum install iscsi-initiator-utils  # CentOS/RHEL
```

2. 发现目标：

```bash
sudo iscsiadm -m discovery -t sendtargets -p <服务器IP>:3260
```

3. 登录目标：

```bash
sudo iscsiadm -m node -T iqn.2024-01.example:storage:target1 -p <服务器IP>:3260 --login
```

4. 查看新磁盘：

```bash
sudo fdisk -l
```

5. 登出目标：

```bash
sudo iscsiadm -m node -T iqn.2024-01.example:storage:target1 --logout
```

### Windows

1. 打开 "iSCSI 发起程序"
2. 在 "发现" 选项卡中点击 "发现门户"
3. 输入服务器 IP 地址（端口默认 3260）
4. 在 "目标" 选项卡中选择目标并点击 "连接"

### macOS

使用命令行工具或第三方客户端如 `globalSAN`。

## 代码参考

### iSCSI 目标器核心

- [target.py](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p270/iscsi_target/target.py) - iSCSI 目标器主类
- [iscsi_pdu.py](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p270/iscsi_target/iscsi_pdu.py) - iSCSI PDU 协议处理
- [scsi_handler.py](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p270/iscsi_target/scsi_handler.py) - SCSI 命令处理器

### 存储和会话

- [lun.py](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p270/iscsi_target/lun.py) - LUN 管理
- [session.py](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p270/iscsi_target/session.py) - 会话管理

### Web 界面

- [app.py](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p270/web/app.py) - Flask Web 应用
- [index.html](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p270/web/templates/index.html) - 前端模板

## 注意事项

1. **权限**：iSCSI 服务需要绑定 3260 端口，需要以 root 权限运行
2. **防火墙**：确保防火墙开放 3260（iSCSI）和 5000（Web）端口
3. **生产环境**：这是一个学习/演示项目，生产环境建议使用成熟的 iSCSI 目标器方案如 `tgt` 或 `LIO`
4. **数据安全**：请定期备份重要数据

## 支持的 SCSI 命令

| 命令 | Opcode | 说明 |
|------|--------|------|
| TEST UNIT READY | 0x00 | 测试设备是否就绪 |
| INQUIRY | 0x12 | 查询设备信息 |
| MODE SENSE(6) | 0x1a | 读取模式参数 |
| READ CAPACITY(10) | 0x25 | 读取磁盘容量 |
| READ(10) | 0x28 | 读取数据 |
| WRITE(10) | 0x2a | 写入数据 |
| MODE SENSE(10) | 0x5a | 读取模式参数（扩展） |
| REPORT LUNS | 0xa0 | 报告可用 LUN 列表 |

## License

MIT License
