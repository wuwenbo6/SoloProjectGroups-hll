# BLE 室内定位系统

基于 BLE 信标 RSSI 值和贝叶斯估计的室内定位系统。

## 系统架构

```
├── backend/                 # 后端 Node.js 服务
│   ├── server.js            # 主服务器文件 (Express + WebSocket)
│   ├── database.js          # SQLite 数据库初始化
│   ├── bayesianPositioning.js  # 贝叶斯定位算法
│   └── package.json
└── frontend/
    └── index.html           # 前端地图页面
```

## 功能特性

### 核心功能
1. **BLE RSSI 数据接收** - 通过 REST API 或 WebSocket 接收信标 RSSI 数据
2. **贝叶斯估计算法** - 使用指纹库进行概率定位
3. **动态指纹更新** - 支持实时更新和添加指纹数据
4. **前端地图显示** - Canvas 绘制室内地图，实时显示标签位置
5. **WebSocket 实时通信** - 位置数据实时推送到前端
6. **数据库存储** - SQLite 存储指纹库、轨迹和原始 RSSI 数据

### 抗环境干扰增强
7. **RSSI 预处理** - 滑动平均、中值滤波、异常值检测，抵御人员走动等环境干扰
8. **卡尔曼滤波** - 多维卡尔曼滤波器进行位置平滑，减少定位漂移

### 降低采集强度
9. **指纹插值** - IDW反距离加权 + 克里金插值，自动生成中间点指纹
10. **众包自动更新** - 用户使用过程中自动更新指纹库，持续优化精度
11. **粒子滤波追踪** - 300粒子蒙特卡洛追踪，考虑运动模型，抗跳变
12. **仿真指纹生成** - 基于信号传播模型（对数距离/射线追踪）零成本生成指纹库
13. **热力图导出** - RSSI信号强度热力图、定位误差热力图，支持PPM格式导出

## 快速开始

### 1. 安装依赖

```bash
cd backend
npm install
```

### 2. 启动服务

```bash
npm start
# 或开发模式
npm run dev
```

服务将在 `http://localhost:3000` 启动

### 3. 访问前端

打开浏览器访问: `http://localhost:3000`

### 4. 初始化示例指纹数据

在前端页面点击「初始化示例指纹」按钮，系统将生成网格状的示例指纹数据。

## API 接口

### 接收 RSSI 数据

```
POST /api/rssi
Content-Type: application/json

{
  "tagId": "tag_001",
  "floor": 1,
  "rssiData": [
    { "beaconMac": "AA:BB:CC:DD:EE:01", "rssi": -55 },
    { "beaconMac": "AA:BB:CC:DD:EE:02", "rssi": -62 }
  ]
}
```

### 添加指纹

```
POST /api/fingerprint
Content-Type: application/json

{
  "locationX": 5,
  "locationY": 5,
  "floor": 1,
  "beaconMac": "AA:BB:CC:DD:EE:01",
  "rssi": -50
}
```

### 批量添加指纹

```
POST /api/fingerprint/batch
Content-Type: application/json

{
  "locationX": 5,
  "locationY": 5,
  "floor": 1,
  "rssiData": [
    { "beaconMac": "AA:BB:CC:DD:EE:01", "rssi": -55 },
    { "beaconMac": "AA:BB:CC:DD:EE:02", "rssi": -62 }
  ]
}
```

### 获取信标列表

```
GET /api/beacons
```

### 获取指纹列表

```
GET /api/fingerprints?floor=1
```

### 获取轨迹数据

```
GET /api/trajectories?tagId=tag_001&limit=100
```

## 数据库结构

### beacons (信标表)
- `id`: 信标唯一标识
- `mac_address`: MAC 地址
- `name`: 名称
- `x, y, floor`: 位置坐标

### fingerprints (指纹库)
- `location_x, location_y, floor`: 指纹位置
- `beacon_id`: 关联信标
- `rssi_mean`: RSSI 平均值
- `rssi_std`: RSSI 标准差
- `sample_count`: 采样次数

### trajectories (轨迹表)
- `tag_id`: 标签 ID
- `x, y, floor`: 定位位置
- `confidence`: 置信度
- `timestamp`: 时间戳

## 贝叶斯定位原理

1. **离线阶段**: 在每个网格点采集各信标的 RSSI 值，计算均值和标准差，建立高斯分布模型

2. **在线阶段**: 
   - 接收实时 RSSI 测量值
   - 对每个指纹点计算似然度 (高斯概率密度函数)
   - 选择似然度最高的位置作为定位结果
   - 使用加权平均获得更平滑的位置估计

## WebSocket 通信

### 客户端发送数据

```javascript
ws.send(JSON.stringify({
  type: 'rssi_data',
  tagId: 'tag_001',
  floor: 1,
  rssiData: [...]
}));
```

### 服务器推送位置

```javascript
{
  type: 'position_update',
  tagId: 'tag_001',
  position: {
    x: 5.2,
    y: 4.8,
    floor: 1,
    confidence: 0.85
  },
  timestamp: '2024-01-01T12:00:00.000Z'
}
```

## 默认信标配置

系统默认配置了 4 个信标：

| 信标ID | MAC 地址 | 位置 |
|--------|----------|------|
| beacon_1 | AA:BB:CC:DD:EE:01 | (0, 0) |
| beacon_2 | AA:BB:CC:DD:EE:02 | (10, 0) |
| beacon_3 | AA:BB:CC:DD:EE:03 | (0, 10) |
| beacon_4 | AA:BB:CC:DD:EE:04 | (10, 10) |

## 增强功能使用说明

### 抗环境干扰

1. **RSSI 预处理** (默认开启)
   - 异常值检测：基于标准差剔除突发干扰（如人员走动遮挡）
   - 滑动平均：平滑 RSSI 波动
   - 中值滤波：抵抗脉冲噪声

2. **卡尔曼滤波** (默认开启)
   - 对定位结果进行时间域平滑
   - 有效减少位置跳变和漂移

3. **环境干扰模拟**
   - 在前端可调节噪声强度（0-20 dB）
   - 可开启「突发干扰」模拟人员走动场景
   - 对比开启/关闭增强功能的定位效果

### 降低指纹采集强度

1. **指纹插值**
   - 方法：IDW 反距离加权 + 克里金插值
   - 使用：先采集稀疏网格点（如间距 2m），点击「应用插值生成指纹」
   - 效果：自动生成 1m 间距的密集指纹点，减少 75% 采集工作量

2. **众包自动更新** (默认开启)
   - 原理：高置信度定位结果自动反馈更新指纹库
   - 阈值：置信度 > 50% 的结果才会被使用
   - 学习率：采用 0.1 的增量学习，避免突变
   - 效果：系统越用越准，自动适应环境变化

## 新 API 接口

### 定位选项控制

```
GET /api/positioning/options
POST /api/positioning/options

{
  "useRSSIPreprocessing": true,
  "useKalman": true,
  "useInterpolation": true,
  "useCrowdsourcing": true
}
```

### 指纹插值

```
POST /api/fingerprint/interpolate

{
  "gridSize": 1,
  "maxX": 10,
  "maxY": 10,
  "floor": 1
}
```

## 使用说明

1. **初始化指纹**: 点击「初始化示例指纹」生成测试数据
2. **测试抗干扰能力**:
   - 调高「RSSI 噪声强度」或开启「突发干扰」
   - 对比开启/关闭卡尔曼滤波、RSSI 预处理的效果
3. **测试插值功能**:
   - 清空数据库，只采集少量稀疏点
   - 点击「应用插值生成指纹」观察指纹点密度变化
4. **模拟定位**: 
   - 手动: 输入模拟位置，点击「发送模拟数据」
   - 自动: 点击「自动模拟」，标签将沿圆形路径移动
5. **查看结果**: 地图上实时显示标签位置和运动轨迹