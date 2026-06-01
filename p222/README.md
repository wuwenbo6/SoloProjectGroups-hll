# OpenFlow 组表性能测试平台

基于 Ryu 控制器的 OpenFlow 组表（ALL / INDIRECT / FAST_FAILOVER）性能测试系统，支持实时吞吐量测试和前端可视化展示。

## 项目结构

```
.
├── controller/
│   ├── group_controller.py    # Ryu 控制器核心逻辑
│   └── rest_api.py            # REST API 接口
├── mininet/
│   ├── topology.py            # Mininet 网络拓扑
│   └── auto_test.py           # 自动化测试脚本
├── frontend/
│   └── index.html             # 前端展示页面
└── scripts/
    ├── start_controller.sh    # 启动控制器脚本
    ├── start_mininet.sh       # 启动 Mininet 脚本
    └── start_frontend.sh      # 启动前端服务脚本
```

## 核心功能

### 1. 组表类型支持

#### ALL 组 (Group ID: 1)
- **功能**: 将数据包复制到所有桶（bucket）
- **适用场景**: 组播、广播、多路径冗余
- **特点**: 每个输出端口都会收到数据包副本

#### INDIRECT 组 (Group ID: 2)
- **功能**: 只包含单个桶，用于间接转发
- **适用场景**: 动作重用、流表优化
- **特点**: 可被其他组引用，提高流表效率

#### FAST_FAILOVER 组 (Group ID: 3)
- **功能**: 使用第一个活动桶，支持快速故障转移
- **适用场景**: 高可用性网络、链路冗余
- **特点**: 监控端口状态，自动切换到备用路径

### 2. 端口状态监控与故障转移
- **实时监控**: 监听 OpenFlow `OFPT_PORT_STATUS` 消息
- **状态检测**: 自动检测端口 UP/DOWN 状态变化
- **故障转移**: 当 `watch_port` 状态变为 DOWN 时，触发事件记录
- **事件日志**: 记录所有端口状态变化和故障转移事件
- **自动切换**: OpenFlow 交换机自动选择第一个存活的 bucket

### 3. BARRIER 请求确认
- **流表同步**: 下发流表后发送 BarrierRequest
- **确认机制**: 等待 BarrierReply 确保流表安装完成
- **超时处理**: 5秒超时保护，避免无限等待
- **状态反馈**: 记录流表安装是否成功确认

## 环境要求

- **操作系统**: Ubuntu 18.04+ / Debian 10+
- **Python**: 3.6+
- **依赖**:
  - ryu
  - mininet
  - openvswitch-switch
  - iperf

## 安装依赖

```bash
# 安装系统依赖
sudo apt-get update
sudo apt-get install -y mininet openvswitch-switch iperf python3-pip

# 安装 Python 依赖
pip3 install ryu requests
```

## 使用方法

### 方式一：快速启动（推荐）

1. **启动 Ryu 控制器**
```bash
cd scripts
./start_controller.sh
```

2. **启动 Mininet 网络**（新终端）
```bash
cd scripts
sudo ./start_mininet.sh
```

3. **启动前端服务**（新终端）
```bash
cd scripts
./start_frontend.sh
```

4. **访问前端页面**
   打开浏览器访问: `http://localhost:8000`

### 方式二：手动启动

1. **启动 Ryu 控制器**
```bash
cd controller
PYTHONPATH=. ryu-manager --observe-links rest_api.py
```

控制器将监听:
- OpenFlow: 6653 端口
- REST API: 8080 端口

2. **启动 Mininet**
```bash
cd mininet
sudo python3 topology.py cli
```

3. **运行自动测试**
```bash
cd mininet
sudo python3 auto_test.py
```

4. **启动前端**
```bash
cd frontend
python3 -m http.server 8000
```

## REST API 接口

### 1. 启动测试
```
POST /api/test/{group_type}
```
- `group_type`: `all`, `indirect`, `fast_failover`

**示例**:
```bash
curl -X POST http://localhost:8080/api/test/all
```

### 2. 获取测试结果
```
GET /api/results
```

**示例**:
```bash
curl http://localhost:8080/api/results
```

### 3. 重置流表
```
POST /api/reset
```

**示例**:
```bash
curl -X POST http://localhost:8080/api/reset
```

### 4. 获取组表信息
```
GET /api/groups
```

## 测试流程

### 标准测试流程
1. 控制器连接交换机后自动创建三种组表
2. 通过 API 启动特定类型组表的测试
3. **发送 FlowMod 安装流规则**
4. **发送 BarrierRequest 等待确认**（确保流表已生效）
5. 收到 BarrierReply 后开始计时测试
6. 使用 iperf 生成测试流量
7. 控制器收集组表统计数据
8. 前端展示吞吐量对比图表

### 故障转移测试
1. 启动 FAST_FAILOVER 组表测试
2. 通过 `ovs-ofctl mod-port` 命令关闭端口
3. 控制器检测到 PORT_STATUS 变化事件
4. 记录 FAILOVER_TRIGGERED 事件
5. 交换机自动切换到下一个存活 bucket
6. 前端实时更新端口状态和事件日志

## 性能指标

- **吞吐量 (Mbps)**: 每秒传输的兆比特数
- **包速率 (PPS)**: 每秒处理的数据包数
- **测试时长**: 流量持续时间
- **总字节数**: 测试期间传输的总字节数

## 注意事项

1. **需要 root 权限运行 Mininet**
2. 确保 Open vSwitch 服务已启动: `sudo service openvswitch-switch start`
3. 测试前请确认没有其他进程占用 6653 和 8080 端口
4. 首次运行时可能需要等待交换机与控制器建立连接

## 故障排除

### 控制器无法连接
```bash
# 检查端口占用
sudo netstat -tlnp | grep -E '(6653|8080)'

# 检查 Ryu 进程
ps aux | grep ryu
```

### Mininet 无法启动
```bash
# 清理 Mininet
sudo mn -c

# 重启 Open vSwitch
sudo service openvswitch-switch restart
```

### 前端无法获取数据
- 确认控制器已启动
- 检查浏览器控制台是否有 CORS 错误
- 使用 "使用模拟数据" 功能预览效果

## 开发说明

### 控制器扩展
在 `group_controller.py` 中添加新的组表类型:
```python
def _create_custom_group(self, datapath, group_id, ports):
    # 实现自定义组表逻辑
    pass
```

### 前端定制
在 `frontend/index.html` 中修改图表样式或添加新的可视化组件。

## 许可证

MIT License
