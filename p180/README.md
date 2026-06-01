# OpenFlow 组表吞吐量测试系统

本项目实现了一个基于 OpenFlow 组表的吞吐量测试系统，支持 ALL、INDIRECT、加权轮询和 FAST-FAILOVER 四种组表类型，支持测试前预热、P4 报告导出，并通过前端实时展示每秒包数 (PPS)。

## 系统架构

```
┌─────────────────┐      WebSocket       ┌─────────────────┐
│   前端界面      │ ◄──────────────────► │  后端服务       │
│  (实时图表)     │                      │                 │
└─────────────────┘                      └────────┬────────┘
                                                   │
                        ┌──────────────────────────┼──────────────────────────┐
                        │                          │                          │
                ┌───────▼───────┐          ┌──────▼──────┐           ┌──────▼───────┐
                │  OpenFlow     │          │  Simulator   │           │   Mininet     │
                │  Controller   │          │  (模拟模式)  │           │  (真实网络)   │
                │   (Ryu)       │          └─────────────┘           └──────────────┘
                └───────────────┘
```

## 功能特性

- 支持四种 OpenFlow 组表类型：
  - **ALL**: 将数据包复制到所有 bucket 端口
  - **INDIRECT**: 随机选择单个 bucket 端口转发
  - **加权轮询 (WEIGHTED_ROUND_ROBIN)**: 根据配置的权重分发数据包
  - **FAST-FAILOVER**: 端口故障自动转移，支持主备切换

- 测试预热机制：
  - 支持自定义预热时间（默认10秒）
  - 预热阶段不统计数据，确保测试结果准确
  - 实时显示预热进度

- 报告导出功能：
  - **P4 格式报告**: 包含测试配置、性能结果、对比分析的 P4 风格报告
  - **CSV 格式报告**: 便于数据分析和图表生成的 CSV 表格

- 测试记录对比：
  - 自动保存所有测试记录
  - 实时显示测试记录对比表格
  - 支持多轮测试结果对比

- 实时统计指标：
  - 每秒包数 (PPS)
  - 总数据包数
  - 当前带宽 (bps)
  - 总字节数
  - 各端口独立统计
  - 测试已运行时间

- 可视化界面：
  - PPS 实时趋势图
  - 总数据包累计图
  - 端口统计面板
  - 支持配置流数量和每流 PPS
  - 加权轮询模式下可配置各端口权重
  - FAST-FAILOVER 模式下可模拟端口故障

## 快速开始

### 方式一：模拟器模式（推荐，无需特殊环境）

适用于 macOS / Windows / Linux 等所有环境，使用内置模拟器。

```bash
chmod +x start_simulator.sh
./start_simulator.sh
```

或手动运行：

```bash
pip3 install -r requirements.txt
python3 backend/http_server.py &
python3 backend/simulator.py
```

然后在浏览器中打开: http://localhost:8080

### 方式二：真实 Ryu + Mininet 模式（Linux）

需要 Linux 环境支持 Mininet。

1. 安装 Mininet:
```bash
sudo apt-get install mininet openvswitch-switch iperf
```

2. 启动服务：
```bash
chmod +x start_ryu.sh
sudo ./start_ryu.sh
```

3. 在另一个终端启动 Mininet 网络：
```bash
sudo python3 backend/network_topology.py
```

4. 在 Mininet CLI 中启动流量生成：
```mininet
mininet> traffic_gen.start_all_traffic()
```

## 文件结构

```
p180/
├── backend/
│   ├── group_controller.py   # Ryu OpenFlow 控制器
│   ├── network_topology.py   # Mininet 网络拓扑
│   ├── simulator.py          # OpenFlow 模拟器
│   └── http_server.py        # HTTP 静态文件服务器
├── static/
│   └── index.html            # 前端界面
├── requirements.txt          # Python 依赖
├── start_simulator.sh        # 模拟器启动脚本
├── start_ryu.sh              # Ryu+Mininet 启动脚本
└── README.md                 # 本文档
```

## OpenFlow 组表说明

### ALL 类型组表

数据包会被复制到所有 bucket 的输出端口，适用于：
- 组播/广播
- 流量镜像
- 多路径冗余

吞吐量特点：总 PPS = 单流 PPS × 端口数量

### INDIRECT 类型组表

数据包随机选择一个 bucket 端口转发，适用于：
- 负载均衡
- 故障转移

吞吐量特点：总 PPS = 单流 PPS

### 加权轮询 (WEIGHTED_ROUND_ROBIN)

数据包根据配置的权重比例分发到各个端口，适用于：
- 异构服务器负载均衡
- 差异化服务质量保证
- 按能力分配流量

吞吐量特点：各端口 PPS 比例 ≈ 权重比例

例如：权重 [50, 30, 20]，单流 1000 PPS，则各端口分别约为 500, 300, 200 PPS

### FAST-FAILOVER 类型组表

数据包优先转发到第一个可用端口，当端口故障时自动切换到下一个端口，适用于：
- 高可用性场景
- 链路冗余备份
- 故障自动恢复

特点：
- 支持 watch_port 监控端口状态
- 故障时毫秒级切换
- 端口恢复后自动回切（可选）

## 测试预热说明

测试前预热机制可以确保：
- 流表完全下发到交换机
- 系统进入稳定运行状态
- 避免初始阶段的性能波动影响测试结果

预热阶段：
- 流量正常转发
- 统计数据不记录
- 实时显示预热进度
- 默认预热时间：10秒（可配置 0-60 秒）

## 报告导出说明

### P4 格式报告

导出的 P4 报告包含：
- 测试配置常量定义
- 各轮测试结果结构体
- 组表类型枚举定义
- 性能对比分析表

文件命名：`group_table_test_report.p4`

### CSV 格式报告

导出的 CSV 报告包含：
- 测试编号
- 组表类型
- 流数量
- 每流 PPS
- 预热时间
- 测试时长
- 总包数
- 总字节数
- 平均 PPS
- 平均带宽

文件命名：`group_table_test_report.csv`

## 使用说明

1. 打开前端界面 http://localhost:8080，确认 WebSocket 已连接（状态显示"已连接"）
2. 选择组表类型：
   - ALL：复制到所有端口
   - INDIRECT：随机选择单个端口
   - 加权轮询：按配置权重分配
   - FAST-FAILOVER：故障自动转移
3. 设置流数量、每流 PPS 和预热时间
4. 如选择加权轮询，可配置各端口权重（端口2/3/4）
5. 如选择 FAST-FAILOVER，可使用"触发故障"/"恢复端口"测试
6. 点击"开始测试"
7. 等待预热完成（显示进度条）
8. 观察实时 PPS 图表和统计数据
9. 完成多次测试后，可在"测试记录对比"表格中查看结果
10. 点击"导出 P4 报告"或"导出 CSV 报告"保存测试结果
11. 点击"停止测试"结束测试

## 性能对比

理论性能对比（3个输出端口）：

| 组表类型 | 单流 PPS | 权重 | 各端口 PPS | 总 PPS | 适用场景 |
|---------|----------|------|------------|--------|---------|
| ALL     | 1000     | -    | 1000/1000/1000 | 3000 | 组播/镜像 |
| INDIRECT | 1000     | -    | ~333/~333/~333 | 1000 | 简单负载均衡 |
| 加权轮询 | 1000     | 50:30:20 | 500/300/200 | 1000 | 按能力分配 |
| FAST-FAILOVER | 1000 | - | 1000/0/0 | 1000 | 高可用/冗余 |

## API 说明

### WebSocket 消息格式

**发送命令：**
```json
{
  "command": "start_test",
  "group_type": "ALL",
  "num_flows": 5,
  "pps_per_flow": 2000,
  "warmup_seconds": 10,
  "weights": [50, 30, 20]
}
```

支持的命令：
- `start_test` - 开始测试
- `stop_test` - 停止测试
- `get_stats` - 获取统计数据
- `export_p4_report` - 导出 P4 格式报告
- `export_csv_report` - 导出 CSV 格式报告
- `get_test_records` - 获取所有测试记录
- `simulate_port_failure` - 模拟端口故障
- `simulate_port_recovery` - 模拟端口恢复

**接收统计数据：**
```json
{
  "group_stats": {
    "1_1": {
      "packet_count": 10000,
      "byte_count": 640000,
      "pps": 1000,
      "bps": 512000
    }
  },
  "port_stats": {
    "1_2": {
      "rx_packets": 5000,
      "tx_packets": 5000,
      "rx_pps": 500,
      "tx_pps": 500
    }
  },
  "group_type": "ALL",
  "test_running": true,
  "warmup_running": false,
  "warmup_progress": 100,
  "warmup_seconds": 10,
  "elapsed_time": 15.5,
  "weights": [50, 30, 20],
  "ff_port_status": {"2": true, "3": true, "4": true},
  "test_records_count": 3,
  "timestamp": 1234567890.123
}
```

## 技术栈

- **后端**: Python 3, Ryu SDN Controller
- **网络仿真**: Mininet (可选)
- **实时通信**: WebSocket
- **前端**: HTML5, Chart.js
