# 🐛 Bug 修复说明

## 问题 1: DDS发现延迟导致新车加入时旧车数据丢失

### 问题分析
- 新节点加入DDS网络时，发现过程有延迟
- 新节点无法立即获取已有车辆的历史状态
- 导致前端显示不完整，数据不同步

### 解决方案

#### 1. 心跳机制 (Heartbeat)
- **文件**: [vehicle_node.py](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p56/src/dds_nodes/vehicle_node.py#L220-L236)
- 每辆车每秒发送心跳包
- 心跳包含 `request_snapshot` 标志（启动前5秒为true）
- 收到新节点的心跳请求后，所有节点发送完整状态

#### 2. 数据缓存与重传
- **文件**: [fusion_node.py](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p56/src/dds_nodes/fusion_node.py#L23-L24)
- 中央节点维护500条状态缓存和100条路径缓存
- 新节点加入时，自动广播最近的所有车辆状态
- 支持状态快照请求功能

#### 3. 超时检测与清理
- **文件**: [fusion_node.py](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p56/src/dds_nodes/fusion_node.py#L55-L67)
- 5秒未收到数据的车辆标记为离线
- 自动清理超时车辆的状态数据
- 防止幽灵车辆残留

#### 4. 对等节点发现
- 每辆车维护 `peer_states` 和 `peer_last_seen` 字典
- 记录所有已知节点的最后通信时间
- 支持主动查询活跃节点列表

---

## 问题 2: 路径冲突消解导致死锁

### 问题分析
- 原策略：两辆车都减速，都变道
- 两辆车同时执行相同动作，导致反复冲突
- 冲突检测和消解形成循环

### 解决方案

#### 1. 优先级机制
- **文件**: [fusion_node.py](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p56/src/dds_nodes/fusion_node.py#L142-L143)
- 每辆车有唯一优先级（基于ID或显式设置）
- 优先级高的车辆优先通行
- 优先级低的车辆必须避让

#### 2. 冷却时间 (Cooldown)
- **文件**: [fusion_node.py](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p56/src/dds_nodes/fusion_node.py#L145-L154)
- 每对车辆消解冲突后有3秒冷却期
- 冷却期内不再处理相同车辆的冲突
- 防止短时间内反复触发

#### 3. 待处理动作检测
- **文件**: [fusion_node.py](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p56/src/dds_nodes/fusion_node.py#L156-L158)
- 记录每辆车当前的待执行消解动作
- 如果车辆已有待执行动作，不再叠加新动作
- 避免动作冲突和死锁

#### 4. 智能消解策略
```
冲突消解决策流程:
├─ 检查是否在冷却期 → 是: 跳过
├─ 比较车辆优先级
│   ├─ 优先级低的车辆 → 强制减速
│   └─ 优先级高的车辆 → 条件变道
└─ 同向行驶时 → 高优先级车辆变道避让
```

#### 5. 动作自动恢复
- **文件**: [vehicle_node.py](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p56/src/dds_nodes/vehicle_node.py#L159-L180)
- 减速动作3秒后自动恢复原速度
- 渐变式速度恢复，避免急加速
- 变道动作一次性完成

#### 6. 角度差检测
- 计算两辆车的航向角差异
- 同向行驶（< 45°）: 高优先级车变道
- 交叉或对向行驶: 仅低优先级车减速

---

## 修改的文件清单

| 文件 | 修改内容 |
|------|---------|
| [vehicle_node.py](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p56/src/dds_nodes/vehicle_node.py) | 心跳、优先级、动作应用、状态历史 |
| [fusion_node.py](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p56/src/dds_nodes/fusion_node.py) | 优先级消解、冷却时间、数据缓存 |
| [main.py](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p56/src/server/main.py) | 集成心跳、动作分发、对等通信 |
| [main.js](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p56/frontend/main.js) | 显示优先级、改进日志输出 |

---

## 验证方法

### 验证DDS发现延迟修复
1. 启动系统，观察所有车辆是否正常显示
2. 动态添加新车辆，检查是否自动获取已有车辆状态
3. 检查前端事件日志是否有"车辆已连接"记录

### 验证死锁修复
1. 观察冲突警报和消解动作
2. 确认同一对车辆不会在3秒内重复冲突
3. 确认消解动作不会让两辆车同时减速（除非优先级相同）
4. 观察速度是否在3秒后自动恢复

---

## 配置参数

可在代码中调整以下参数:

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `heartbeat_interval` | 1.0s | 心跳发送间隔 |
| `data_timeout` | 3.0s | 节点超时判定 |
| `vehicle_timeout` | 5.0s | 融合节点超时清理 |
| `conflict_cooldown` | 3.0s | 冲突冷却时间 |
