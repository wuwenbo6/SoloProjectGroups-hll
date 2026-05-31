# 🚀 功能更新说明

## 新增功能一览

### ✅ 1. 实时重规划 (Real-time Replanning)
### ✅ 2. 通信中断本地决策 (Local Decision on Communication Failure)
### ✅ 3. 排故日志导出 (Diagnostic Log Export)

---

## 1. 实时重规划

### 功能说明
当车辆检测到潜在冲突时，立即触发路径重新计算，生成避障路径。

### 核心实现
- **文件**: [vehicle_node.py](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p56/src/dds_nodes/vehicle_node.py#L194-L251)

#### 触发条件
```python
# 8米内检测到其他车辆 → 触发重规划
dist < 8.0 → 触发重规划
dist < 6.0 → 结合转向规避
dist < 4.0 → 紧急减速
```

#### 避障算法
```
冲突检测 → 计算规避角度 → 生成新路径
     ↓
1. 定位最近冲突车辆
2. 计算相对角度
3. 向垂直方向偏转60度
4. 渐减式回归原航向
```

#### 重规划冷却
- 最小间隔: 1秒
- 防止频繁重规划导致震荡

### API 接口
```bash
# 手动触发单辆车重规划
POST /api/vehicle/{vehicle_id}/replan?reason=manual

# WebSocket 触发
{ "action": "trigger_replan", "vehicle_id": "vehicle_000", "reason": "manual" }
```

### 前端控制
- **全部重规划**按钮: 一键触发所有车辆重规划
- 事件日志显示重规划原因

---

## 2. 通信中断本地决策

### 功能说明
当车辆与中央节点通信中断超过5秒时，自动切换到本地决策模式，实现自主避障。

### 核心实现
- **文件**: [vehicle_node.py](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p56/src/dds_nodes/vehicle_node.py#L253-L283)

#### 状态机
```
正常模式 ←(通信恢复)
    |
    | 5秒无心跳
    ↓
本地模式 → 自主冲突检测
         → 本地重规划
         → 自适应速度
```

#### 本地决策能力
1. **自主冲突检测** - 基于Peer-to-Peer数据
2. **紧急减速** - 距离<4m时减速
3. **本地重规划** - 距离<6m时避障
4. **速度恢复** - 无冲突时逐步加速

#### 中央心跳机制
```python
# 中央节点每2秒发送心跳
central_heartbeat_interval = 2.0s

# 超过5秒未收到 → 切换本地模式
local_mode_threshold = 5.0s
```

### 故障模拟
- **前端按钮**: 模拟断网开关
- **API**: `POST /api/simulate/failure?enable=true`
- **视觉反馈**: 车辆卡片显示橙色"本地"标签

### 恢复机制
- 通信恢复后自动切回中央模式
- 记录模式切换事件到诊断日志

---

## 3. 排故日志导出

### 功能说明
收集系统和所有车辆的诊断日志，支持CSV和JSON格式导出。

### 日志类型
| 来源 | 事件类型 | 级别 |
|------|---------|------|
| 系统 | system, simulation | info/warning/error |
| 车辆 | replan, avoidance, mode_change | debug/info/warning |

### 核心实现
- **文件**: [main.py](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p56/src/server/main.py#L152-L178)

#### 诊断日志结构
```python
DiagnosticLog:
- timestamp: float
- vehicle_id: str
- event_type: str
- level: str (debug/info/warning/error)
- message: str
- data: dict (附加数据)
```

### 导出格式

#### CSV 导出
```bash
GET /api/export/csv
```

**字段**:
- Timestamp (Unix时间戳)
- Time (可读时间)
- Source (system/vehicle)
- Vehicle ID
- Event Type
- Level
- Message
- Data (JSON)

#### JSON 导出
```bash
GET /api/export/json
```

**结构**:
```json
{
  "export_time": "2024-01-01T12:00:00",
  "total_logs": 1234,
  "logs": [...]
}
```

### 前端控制
- **导出CSV**按钮: 下载表格格式日志
- **导出JSON**按钮: 下载结构化数据
- 文件名自动带时间戳

---

## 前端UI更新

### 新增控制面板
```
🔧 控制
├─ ROS2桥接: 关/开
├─ 模拟断网: 关/开  ← 新增
├─ 全部重规划       ← 新增
└─ 导出CSV / 导出JSON ← 新增

🤖 本地决策模式     ← 新增
└─ 状态显示卡片
```

### 车辆卡片增强
```
vehicle_000 [P0] [本地]  ← 本地模式标签
位置: (12.3, 45.6)
速度: 5.23 m/s
```

### 事件日志新增类型
- `[重规划] vehicle_000: local_avoidance`
- `[模拟] 通信故障模式已启动`
- `[导出] 正在导出CSV诊断日志...`

---

## API 接口汇总

### 新增接口
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/diagnostics` | 获取诊断日志 |
| GET | `/api/export/csv` | 导出CSV日志 |
| GET | `/api/export/json` | 导出JSON日志 |
| GET | `/api/vehicle/status` | 获取所有车辆状态 |
| POST | `/api/vehicle/{id}/replan` | 触发重规划 |
| POST | `/api/simulate/failure` | 模拟通信故障 |

### WebSocket 新增命令
```javascript
// 模拟故障
{ action: 'simulate_failure', enable: true }

// 触发重规划
{ action: 'trigger_replan', vehicle_id: 'vehicle_000' }

// 获取诊断日志
{ action: 'get_diagnostics', min_level: 'warning' }
```

---

## 使用示例

### 测试本地决策模式
1. 打开前端页面
2. 点击 **模拟断网: 关** 按钮
3. 观察车辆卡片出现橙色"本地"标签
4. 查看事件日志中的模式切换记录
5. 再次点击按钮恢复正常

### 导出诊断日志
1. 运行系统一段时间
2. 点击 **导出CSV** 或 **导出JSON**
3. 浏览器自动下载日志文件
4. 用Excel/文本编辑器打开分析

### 手动测试重规划
1. 点击 **全部重规划** 按钮
2. 观察3D视图中所有车辆路径更新
3. 查看事件日志中的重规划记录

---

## 关键参数配置

可在代码中调整以下参数:

| 参数 | 默认值 | 位置 | 说明 |
|------|--------|------|------|
| 重规划冷却 | 1.0s | vehicle_node.py | 最小重规划间隔 |
| 通信超时 | 5.0s | vehicle_node.py | 切换本地模式阈值 |
| 冲突检测距离 | 8.0m | vehicle_node.py | 触发重规划距离 |
| 紧急减速距离 | 4.0m | vehicle_node.py | 本地模式减速阈值 |
| 中央心跳间隔 | 2.0s | main.py | 中央节点心跳频率 |
