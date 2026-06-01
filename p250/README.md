# SIP REGISTER Flood 攻击检测系统

一个基于 Go + pcap 的实时 SIP 注册洪水攻击检测系统，包含后端数据包捕获分析和前端可视化展示。

## 功能特性

- **实时数据包捕获**: 使用 libpcap 捕获 SIP 端口 (5060) 的 UDP/TCP 数据包
- **SIP REGISTER 解析**: 提取 SIP 注册请求的关键信息 (Call-ID, From, To, User-Agent)
- **频率统计检测**: 滑动窗口算法按 IP 统计注册频率，超过阈值 (>10次/秒) 触发告警
- **IP 地理位置查询**: 支持离线 MaxMind 数据库和在线 API 查询攻击源地理位置
- **实时告警推送**: SSE 实时推送告警事件到前端
- **可视化展示**: 现代化前端界面，展示攻击源分布、频率统计、告警详情

## 项目结构

```
p250/
├── backend/                    # 后端 Go 代码
│   ├── main.go                 # 主入口
│   ├── types/                  # 数据类型定义
│   │   └── types.go
│   ├── capture/                # SIP 包捕获模块
│   │   └── sip.go
│   ├── detector/               # 频率统计和告警检测
│   │   └── detector.go
│   ├── geo/                    # IP 地理位置查询
│   │   └── geoip.go
│   ├── api/                    # HTTP API 服务
│   │   └── server.go
│   ├── go.mod
│   └── go.sum
├── frontend/                   # 前端代码
│   ├── index.html              # 主页面
│   ├── styles.css              # 样式文件
│   └── app.js                  # 交互逻辑
└── README.md
```

## 系统要求

### 操作系统
- Linux (推荐)
- macOS
- Windows (需安装 Npcap)

### 依赖库
- **libpcap**: 数据包捕获库
  - macOS: `brew install libpcap`
  - Debian/Ubuntu: `sudo apt-get install libpcap-dev`
  - CentOS/RHEL: `sudo yum install libpcap-devel`

### Go 环境
- Go 1.18+

## 快速开始

### 1. 编译后端

```bash
cd backend
go build -o sip-detector .
```

### 2. 查看可用网络接口

```bash
cd backend
./sip-detector -list-devices
```

### 3. 启动检测系统

**基本启动** (使用在线 IP 地理位置查询):
```bash
cd backend
sudo ./sip-detector -device en0
```

**使用 MaxMind 离线数据库** (推荐):
```bash
cd backend
sudo ./sip-detector -device en0 \
  -city-db /path/to/GeoLite2-City.mmdb \
  -asn-db /path/to/GeoLite2-ASN.mmdb
```

**自定义告警阈值**:
```bash
cd backend
sudo ./sip-detector -device en0 -threshold 10 -window 1
```

### 4. 访问前端

启动服务后，在浏览器中访问:
```
http://localhost:8080/frontend/index.html
```

## 命令行参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `-device` | string | `en0` | 网络接口名称 |
| `-threshold` | float | `10.0` | 告警阈值 (次/秒) |
| `-window` | int | `1` | 统计时间窗口 (秒) |
| `-api` | string | `:8080` | API 服务监听地址 |
| `-city-db` | string | `` | MaxMind City 数据库路径 |
| `-asn-db` | string | `` | MaxMind ASN 数据库路径 |
| `-list-devices` | bool | `false` | 列出可用网络接口 |
| `-frontend` | string | `../frontend` | 前端静态文件目录 |

## API 接口

### `GET /api/stats`
获取所有 IP 的频率统计数据

**响应示例**:
```json
{
  "success": true,
  "total": 5,
  "data": [
    {
      "ip": "192.168.1.100",
      "count": 25,
      "rate": 25.0,
      "first_seen": "2024-01-01T12:00:00Z",
      "last_seen": "2024-01-01T12:00:01Z",
      "is_alerting": true,
      "alert_level": "critical"
    }
  ]
}
```

### `GET /api/alerts?limit=100`
获取告警历史记录

### `GET /api/alerts/stream`
SSE 实时告警流

**事件格式**:
```
event: alert
data: {
  "id": "abc123",
  "ip": "192.168.1.100",
  "count": 25,
  "rate": 25.0,
  "threshold": 10.0,
  "timestamp": "2024-01-01T12:00:00Z",
  "geo_info": {
    "country": "中国",
    "country_code": "CN",
    "city": "北京",
    "latitude": 39.9042,
    "longitude": 116.4074,
    "timezone": "Asia/Shanghai",
    "isp": "China Telecom",
    "asn": 4134
  },
  "user_agents": ["friendly-scanner"],
  "destinations": {"10.0.0.1:5060": 25}
}
```

### `GET /api/config`
获取系统配置

### `GET /api/health`
健康检查

## 检测算法

系统使用滑动窗口算法统计每个 IP 的 REGISTER 请求频率：

1. 为每个 IP 维护一个固定大小的时间窗口数组
2. 每秒钟滑动窗口，丢弃过期数据
3. 计算窗口内的总请求数，得到平均频率
4. 如果频率超过阈值（默认 >10 次/秒），触发告警
5. 告警有 5 秒冷却时间，避免重复告警

## 地理信息查询

系统支持两种地理信息查询方式：

### 1. MaxMind 离线数据库 (推荐)
- 下载地址: https://dev.maxmind.com/geoip/geolite2-free-geolocation-data
- 优点: 查询速度快，无请求限制，隐私性好
- 需要 `GeoLite2-City.mmdb` 和 `GeoLite2-ASN.mmdb` 文件

### 2. 在线 API 查询
- 使用 ip-api.com 免费接口
- 优点: 无需额外配置
- 缺点: 查询速度较慢，有请求频率限制 (45次/分钟)

## SIP REGISTER 包格式

系统识别的 SIP REGISTER 请求格式:
```
REGISTER sip:example.com SIP/2.0
Via: SIP/2.0/UDP 192.168.1.100:5060
From: <sip:1000@example.com>
To: <sip:1000@example.com>
Call-ID: abc123@192.168.1.100
CSeq: 1 REGISTER
User-Agent: friendly-scanner
Contact: <sip:1000@192.168.1.100:5060>
Expires: 3600
Content-Length: 0
```

提取的关键字段:
- `Source IP`: 数据包源 IP
- `Call-ID`: 呼叫标识
- `From`: 主叫方
- `To`: 被叫方
- `User-Agent`: 用户代理
- `Destination`: 目标地址

## 常见攻击场景

1. **注册洪水攻击 (Registration Flood)**:
   - 攻击者发送大量 REGISTER 请求
   - 目标: 耗尽 SIP 服务器资源
   - 特征: 单 IP 每秒 >10 次 REGISTER 请求

2. **枚举攻击 (Enumeration)**:
   - 攻击者尝试不同的用户名/密码组合
   - 目标: 获取有效账号
   - 特征: 多个 REGISTER 请求，不同的 To 字段

## 注意事项

1. **权限要求**: 数据包捕获需要 root/管理员权限
2. **网络接口**: 确保选择正确的网络接口进行监听
3. **性能考虑**: 在高流量环境下，建议使用专用网卡
4. **防火墙规则**: 确保系统允许捕获 5060 端口的数据包
5. **存储限制**: 系统仅保留最近 1000 条告警记录

## 故障排查

### 1. 无法捕获数据包
```bash
# 检查网络接口是否存在
ip link show

# 检查是否有权限
sudo tcpdump -i en0 port 5060
```

### 2. 编译错误
```bash
# 检查 libpcap 是否安装
ldconfig -p | grep pcap

# 安装 libpcap 开发包
sudo apt-get install libpcap-dev  # Debian/Ubuntu
sudo yum install libpcap-devel    # CentOS/RHEL
```

### 3. 前端无法连接
```bash
# 检查端口是否被占用
netstat -tlnp | grep 8080

# 检查防火墙规则
sudo iptables -L -n | grep 8080
```

## 许可证

MIT License
