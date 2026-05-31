# 室内定位系统 (Indoor Positioning System)

基于Wi-Fi RTT（往返时间）的室内定位系统，包含Android App、Web管理端和Node.js后端。

## 系统架构

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│   Android App   │  WiFi   │   Node.js 后端   │ HTTP/WS │   Web 管理端    │
│                 │  RTT    │                 │         │                 │
│ - 采集RTT数据   ├────────►│ - AP坐标管理    │◄────────►│ - Three.js 3D   │
│ - 三边测量定位  │         │ - 定位算法      │         │   可视化        │
│ - 上传位置      │◄────────┤ - 指纹库        │         │ - 实时轨迹      │
└─────────────────┘ 位置   │ - 历史记录      │         │ - 楼层切换      │
                           └────────┬────────┘         └─────────────────┘
                                    │
                                    ▼
                           ┌─────────────────┐
                           │   SQLite 数据库 │
                           │ - AP表          │
                           │ - 指纹库        │
                           │ - 定位历史      │
                           └─────────────────┘
```

## 项目结构

```
p8/
├── backend/                    # Node.js 后端服务
│   ├── src/
│   │   ├── server.js          # 主服务器（HTTP + WebSocket）
│   │   ├── database.js        # 数据库操作
│   │   └── trilateration.js   # 三边测量算法
│   ├── database/              # SQLite 数据库文件
│   └── package.json
│
├── web/                        # Web 管理端
│   ├── index.html             # 主页面
│   └── app.js                 # Three.js 3D 可视化
│
└── android/                    # Android App
    ├── app/
    │   └── src/main/
    │       ├── java/com/indoorpositioning/
    │       │   ├── MainActivity.java    # 主界面
    │       │   └── RttService.java      # 后台服务
    │       ├── res/
    │       └── AndroidManifest.xml
    ├── build.gradle
    └── settings.gradle
```

## 快速开始

### 1. 启动后端服务

```bash
cd backend
npm install
npm start
```

服务将在 `http://localhost:3000` 启动。

### 2. 访问Web管理端

打开浏览器访问 `http://localhost:3000`

点击 "初始化演示数据" 按钮创建示例AP数据。

### 3. 构建Android App

```bash
cd android
./gradlew assembleDebug
```

在 Android 设备上安装生成的 APK 文件。

## API 接口文档

### 接入点 (AP) 管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/aps` | 获取所有AP |
| GET | `/api/aps?floor=N` | 获取指定楼层的AP |
| POST | `/api/aps` | 添加/更新AP |
| DELETE | `/api/aps/:id` | 删除AP |

**AP 数据格式：**
```json
{
  "id": "ap1",
  "bssid": "00:11:22:33:44:01",
  "name": "AP-NorthWest",
  "x": 5,
  "y": 5,
  "z": 0,
  "floor": 1
}
```

### 定位服务

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/locate` | 提交测量数据进行定位 |

**请求体：**
```json
{
  "device_id": "android-device-001",
  "measurements": [
    {
      "bssid": "00:11:22:33:44:01",
      "distance": 15.5,
      "rssi": -65
    }
  ],
  "floor": 1
}
```

**响应：**
```json
{
  "x": 25.3,
  "y": 14.8,
  "z": 0.5,
  "floor": 1,
  "accuracy": 0.8
}
```

### 历史记录

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/history/:deviceId` | 获取设备的定位历史 |
| GET | `/api/positions/recent` | 获取最近的位置 |

### 建筑信息

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/building` | 获取建筑配置 |

## WebSocket 实时通信

连接到 `ws://localhost:3000` 接收实时位置更新。

### 接收消息

**位置更新：**
```json
{
  "type": "position_update",
  "position": {
    "device_id": "device-001",
    "x": 25.3,
    "y": 14.8,
    "z": 0.5,
    "floor": 1,
    "accuracy": 0.8,
    "created_at": "2024-01-01T12:00:00Z"
  }
}
```

**AP 更新：**
```json
{
  "type": "ap_updated"
}
```

## 定位算法原理

### 三边测量 (Trilateration)

系统使用三维三边测量算法计算设备位置：

1. 收集至少3个AP的距离测量值
2. 建立球面方程方程组
3. 求解方程组得到设备的三维坐标
4. 计算定位精度（误差估计）

### 坐标转换

- 建筑坐标系：X-Y平面为楼层地面，Z轴为高度
- 每层高度默认为3米
- 坐标单位：米

## Android App 功能

1. **Wi-Fi RTT 测距**：使用 Android Wi-Fi RTT API 测量到周围AP的距离
2. **实时定位**：每2秒进行一次测距并计算位置
3. **数据上传**：将位置和测量数据上传到服务器
4. **状态显示**：显示检测到的AP、距离、当前位置等信息

### 权限要求

- ACCESS_FINE_LOCATION：位置权限
- ACCESS_WIFI_STATE：Wi-Fi状态访问
- CHANGE_WIFI_STATE：Wi-Fi扫描控制
- INTERNET：网络通信

### 设备要求

- Android 9.0 (API 28) 或更高
- 支持 Wi-Fi RTT (IEEE 802.11mc)
- 已开启 Wi-Fi 和 定位服务

## Web 管理端功能

1. **3D 建筑可视化**：使用 Three.js 渲染多层建筑
2. **实时位置追踪**：显示设备当前位置和移动轨迹
3. **楼层切换**：支持查看单楼层或所有楼层
4. **AP 管理**：显示所有接入点的位置和信息
5. **历史轨迹**：回放设备的移动历史

### 操作说明

- **鼠标左键拖动**：旋转视角
- **鼠标右键拖动**：平移视角
- **滚轮**：缩放视图

## 数据库结构

### access_points 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | AP ID |
| bssid | TEXT | MAC地址 |
| name | TEXT | 名称 |
| x | REAL | X坐标 |
| y | REAL | Y坐标 |
| z | REAL | Z坐标 |
| floor | INTEGER | 楼层 |
| created_at | DATETIME | 创建时间 |

### position_history 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| device_id | TEXT | 设备ID |
| x | REAL | X坐标 |
| y | REAL | Y坐标 |
| z | REAL | Z坐标 |
| floor | INTEGER | 楼层 |
| accuracy | REAL | 精度 |
| created_at | DATETIME | 时间戳 |

### fingerprints 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| bssid | TEXT | AP的MAC |
| distance | REAL | 测量距离 |
| rssi | INTEGER | 信号强度 |
| floor | INTEGER | 楼层 |
| created_at | DATETIME | 时间戳 |

## 部署说明

### 生产环境部署

1. **配置HTTPS**：使用Nginx反向代理
2. **数据库**：可替换为PostgreSQL/MySQL
3. **认证**：添加API密钥认证
4. **容器化**：使用Docker部署

### 配置文件

后端配置通过环境变量：

```bash
PORT=3000
NODE_ENV=production
```

## 常见问题

### 1. Android 设备不支持 Wi-Fi RTT

检查设备是否支持 IEEE 802.11mc。可在 App 中查看 "RTT支持" 状态。

### 2. 定位精度差

- 确保有至少3个支持RTT的AP在范围内
- 避免多路径干扰（远离墙壁、金属物体）
- 增加AP密度

### 3. WebSocket 连接失败

- 检查后端服务是否运行
- 确认网络连接正常
- 检查防火墙设置

## 技术栈

| 组件 | 技术 |
|------|------|
| 后端 | Node.js + Express |
| 数据库 | SQLite3 |
| WebSocket | ws |
| Web前端 | Three.js |
| Android | Java + Android SDK |
| 定位算法 | 三边测量 |

## 许可证

MIT License
