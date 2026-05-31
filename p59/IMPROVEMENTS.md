# 智能药盒系统改进说明

## 问题分析与解决方案

### 问题 1: 红外检测误报（手过快划过）

**原因分析：**
- 红外传感器对快速移动的物体也会触发
- 单次检测就标记取药过于敏感
- 没有结合开盖状态进行验证

**解决方案：**

1. **设备端防抖 (双重保障)**
   - 新增 `IRDetector` 类，要求在时间窗口内检测到多次才生效
   - 默认配置：2秒内检测到2次才确认取药
   - 可配置参数：`IR_DEBOUNCE_COUNT`、`IR_DEBOUNCE_WINDOW`

2. **后端状态机验证**
   - 新增 `PillboxStateMachine` 状态管理
   - 只有开盖状态下的红外检测才有效
   - 红外检测也需要防抖确认
   - 完整的开盖-取药-关盖流程追踪

3. **状态流程：**
   ```
   关盖 → 开盖(hall=1) → 红外检测多次 → 确认取药 → 关盖(hall=0)
   ```

### 问题 2: 离线取药记录丢失

**原因分析：**
- 网络断开时 MQTT 消息发送失败即丢弃
- 设备端没有本地缓存机制
- 没有数据补发通道

**解决方案：**

1. **设备端本地缓存**
   - 环形缓冲区实现，最多缓存 200 条记录
   - MQTT 发送失败时自动缓存
   - 网络恢复后自动尝试同步

2. **后端批量数据接口**
   - `POST /sensor-data/batch` - 批量上传传感器数据
   - 支持离线数据标记（`is_offline_data`）
   - 按时间戳排序重放，确保状态机正确处理
   - 返回处理结果和是否检测到服药

3. **双协议支持**
   - 实时数据：MQTT 协议（低延迟）
   - 离线补发：HTTP 批量接口（可靠性高）

## 新增文件

### 后端

| 文件 | 说明 |
|------|------|
| [app/pillbox_state.py](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p59/backend/app/pillbox_state.py) | 药盒状态机，红外防抖逻辑 |
| [test_mqtt_improved.py](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p59/backend/test_mqtt_improved.py) | 改进版 MQTT 测试脚本 |
| [test_batch_upload.py](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p59/backend/test_batch_upload.py) | 批量上传接口测试 |

### 设备端固件

| 文件 | 说明 |
|------|------|
| [device/pillbox_firmware.py](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p59/backend/device/pillbox_firmware.py) | MicroPython 固件参考 |
| [device/pillbox_arduino.ino](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p59/backend/device/pillbox_arduino.ino) | Arduino/ESP32 固件参考 |

## 核心改进点详解

### 1. PillboxStateMachine 状态机

```python
# 关键参数
ir_debounce_window = timedelta(seconds=2)  # 防抖时间窗口
min_ir_detections = 2                       # 最小检测次数
session_timeout = timedelta(minutes=5)      # 会话超时清理
```

**状态流转：**
- `lid_opened` - 盖子打开，重置红外检测缓存
- `ir_detected_pending` - 检测到红外，但次数不足
- `medication_confirmed` - 确认取药（达到检测次数阈值）
- `lid_closed_medication_taken` - 关盖，本次取药完成
- `ignored_lid_closed` - 关盖状态下的红外被忽略

### 2. 批量数据上传 API

**请求示例：**
```json
POST /sensor-data/batch
{
  "device_id": "pillbox_001",
  "is_offline_data": true,
  "data": [
    {"sensor_type": "hall", "value": 1, "timestamp": "2024-01-01T08:00:00"},
    {"sensor_type": "ir", "value": 0, "timestamp": "2024-01-01T08:00:02"},
    {"sensor_type": "ir", "value": 0, "timestamp": "2024-01-01T08:00:02.5"},
    {"sensor_type": "hall", "value": 0, "timestamp": "2024-01-01T08:00:10"}
  ]
}
```

**响应示例：**
```json
{
  "success": true,
  "processed_count": 4,
  "medication_taken": true,
  "message": "Successfully processed 4 records (offline data)"
}
```

### 3. 设备端缓存策略

**MicroPython 实现：**
```python
cache = SensorDataCache(max_size=200)

# 发送失败时缓存
if not send_mqtt_message(sensor_type, value, timestamp):
    cache.add(sensor_type, value)

# 网络恢复时同步
if is_network_available() and len(cache) > 0:
    sync_cached_data()
```

**缓存满时策略：**
- 使用环形缓冲区（FIFO）
- 新数据覆盖最旧数据
- 保证至少保留最近 200 条记录（约可存储 1-2 小时数据）

## 测试方法

### 测试红外防抖
```bash
cd backend
python test_mqtt_improved.py
```

观察后端日志，验证：
- 单次红外检测不触发取药标记
- 多次红外检测（2秒内2次以上）才标记取药
- 未开盖时红外检测被忽略

### 测试离线数据补发
```bash
cd backend
python test_batch_upload.py
```

验证：
- 批量数据正确处理
- 状态机正确重放历史状态
- 服药记录正确标记

## 配置调优

根据实际场景调整参数：

**设备端（firmware）：**
```python
IR_DEBOUNCE_COUNT = 2       # 增加更严格，减少更敏感
IR_DEBOUNCE_WINDOW = 500    # 毫秒，时间窗口
MAX_CACHE_SIZE = 200        # 缓存记录数
```

**后端（pillbox_state.py）：**
```python
self.ir_debounce_window = timedelta(seconds=2)
self.min_ir_detections = 2
self.session_timeout = timedelta(minutes=5)
```

## 注意事项

1. **时间同步**：设备端与服务器时间应尽量同步，误差建议控制在 1 分钟内
2. **Zigbee 网关**：Zigbee 设备通过网关转发时，网关也可增加缓存层
3. **电源管理**：设备端缓存使用内存存储，掉电会丢失。如需持久化可使用 Flash 存储
4. **MQTT QoS**：建议使用 QoS=1 确保消息至少送达一次
