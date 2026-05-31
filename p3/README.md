# 测向定位系统 (Direction Finding System)

一个完整的全栈应用，实现了基于方位角的三角测量定位系统。

## 功能特性

### 前端功能
- **Leaflet地图界面**: 交互式地图展示测向站和发射源位置
- **三个默认测向站**: 预设在北京、上海、广州三个位置
- **可编辑测向站**: 支持添加、删除、编辑测向站参数
- **方位角可视化**: 虚线显示每个测向站的方位角方向
- **发射源标记**: 红色标记显示计算出的发射源位置
- **概率椭圆**: 半透明椭圆显示定位不确定区域

### 后端功能
- **三角测量算法**: 基于方位角交汇计算发射源位置
- **概率椭圆计算**: 根据测量误差计算定位概率区域
- **发射功率衰减**: 计算自由空间路径损耗和地形遮挡衰减
- **SQLite数据库**: 保存历史定位记录
- **KML导出**: 支持导出定位结果为KML文件

### 参数设置
- **发射功率 (dBm)**: 设置发射源的发射功率
- **地形遮挡因子 (0-3)**: 
  - 0: 无遮挡（自由空间）
  - 1: 轻度遮挡（郊区）
  - 2: 中度遮挡（城市）
  - 3: 重度遮挡（山区/密集建筑）

## 项目结构

```
.
├── package.json          # 项目配置和依赖
├── server.js             # Express服务器主文件
├── triangulation.js      # 三角测量和数学计算模块
├── database.js           # SQLite数据库模块
├── kmlExport.js          # KML导出模块
├── test.js               # 算法测试脚本
└── public/
    └── index.html        # 前端Leaflet地图界面
```

## API接口

### POST /api/triangulate
计算发射源位置

**请求体:**
```json
{
  "stations": [
    {"id": "A", "lat": 39.9042, "lng": 116.4074, "azimuth": 45, "error": 2},
    {"id": "B", "lat": 31.2304, "lng": 121.4737, "azimuth": 315, "error": 2}
  ],
  "power": 50,
  "terrainFactor": 1
}
```

**响应:**
```json
{
  "emitterLat": 35.0,
  "emitterLng": 118.0,
  "probability": 85.5,
  "ellipseMajor": 5000,
  "ellipseMinor": 3000,
  "ellipseOrientation": 45,
  "ellipsePoints": [[lat, lng], ...],
  "power": 50,
  "terrainFactor": 1,
  "stations": [...],
  "timestamp": "2024-01-01T00:00:00.000Z",
  "id": 1
}
```

### GET /api/history
获取历史定位记录

### GET /api/history/:id
获取单条历史记录

### GET /api/kml/:id
导出KML文件

## 算法说明

### 三角测量原理
系统使用方位角交汇法（Angle of Arrival, AOA）：
1. 每个测向站测量到发射源的方位角
2. 计算两条方位线的交点
3. 多个交点的平均值作为最终位置

### 概率椭圆计算
基于以下因素计算不确定区域：
- 各测向站的测量误差
- 测向站与发射源的距离
- 测向站的几何分布

### 功率衰减模型
```
接收功率 = 发射功率 - 自由空间损耗 - 地形损耗
自由空间损耗 = 20log10(distance) + 20log10(frequency) - 27.55
地形损耗 = terrainFactor * 5 * log10(distance)
```

## 修复npm权限问题（如遇安装错误）

```bash
sudo chown -R 501:20 ~/.npm
npm install
```

## 运行项目

```bash
# 安装依赖
npm install

# 启动服务器
npm start

# 开发模式（自动重启）
npm run dev
```

然后在浏览器中访问: http://localhost:3000

## 使用说明

1. **查看默认测向站**: 地图上显示北京(A)、上海(B)、广州(C)三个测向站
2. **调整参数**: 在左侧面板修改测向站的方位角和误差
3. **计算定位**: 点击"计算发射源位置"按钮
4. **查看结果**: 地图上显示发射源位置和概率椭圆
5. **导出KML**: 点击"导出KML"按钮下载文件
6. **查看历史**: 点击历史记录查看之前的定位结果

## 技术栈

- **后端**: Node.js + Express
- **数据库**: SQLite (better-sqlite3)
- **前端**: Leaflet.js + 原生JavaScript
- **KML生成**: xmlbuilder2

## 注意事项

- 系统预设了3个测向站的位置和方位角
- 实际应用中需要真实的测向设备提供方位角数据
- 地形遮挡因子需要根据实际环境调整
- 定位精度取决于测向站的数量、分布和测量精度
