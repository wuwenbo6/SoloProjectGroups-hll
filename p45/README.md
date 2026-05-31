# AGV RFID 库存盘点模拟器

一个基于 Three.js 和 ROS 桥的 Web 模拟器，用于模拟 AGV 小车携带 RFID 读写器在书架间移动进行库存盘点。

## 功能特性

### 前端功能
- **3D 可视化场景**: 基于 Three.js 的交互式 3D 仓库场景
- **AGV 小车控制**: 
  - 键盘控制 (WASD / 方向键)
  - 屏幕按钮控制
  - 速度调节 (0.1 - 3 m/s)
- **航点导航系统**:
  - 添加/删除航点
  - 自动导航到航点序列
  - 可视化航点标记和路径
- **RFID 扫描模拟**:
  - 扫描范围可视化
  - 标签扫描动画效果
  - 已扫描标签高亮显示
- **书架布局管理**:
  - 导入 JSON 格式的书架布局
  - 导出现有布局
  - 默认布局快速加载
- **库存盘点**:
  - 开始/停止盘点
  - 实时统计扫描进度
  - 生成缺失标签报告

### 后端功能
- **Flask REST API**: 完整的 HTTP API 接口
- **WebSocket 实时通信**: 基于 Socket.IO 的实时数据推送
- **数据持久化**: JSON 文件存储报告和布局
- **报告生成**: 支持导出 Excel (.xlsx) 和 CSV 格式
- **ROS 桥接支持**: 兼容 rosbridge 协议

## 项目结构

```
p45/
├── backend/
│   ├── app.py              # Flask 后端主程序
│   └── data/               # 数据存储目录
│       ├── reports/        # 盘点报告
│       └── layouts/        # 书架布局
├── src/
│   ├── css/
│   │   └── style.css       # 前端样式
│   └── js/
│       ├── main.js         # 主程序入口
│       ├── agv.js          # AGV 小车模型
│       ├── shelves.js      # 书架管理
│       ├── waypoint.js     # 航点导航
│       ├── rfid.js         # RFID 扫描器
│       ├── rosbridge.js    # ROS 桥接
│       └── inventory.js    # 库存管理
├── index.html              # 前端入口页面
├── package.json            # npm 依赖配置
├── requirements.txt        # Python 依赖配置
├── vite.config.js          # Vite 配置
├── sample-layout.json      # 示例书架布局
├── start-backend.sh        # 后端启动脚本
├── start-frontend.sh       # 前端启动脚本
└── README.md               # 项目说明
```

## 快速开始

### 前置要求
- Node.js >= 16.0
- Python >= 3.8
- npm 或 yarn

### 安装依赖

**前端依赖:**
```bash
npm install
```

**后端依赖:**
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r ../requirements.txt
```

### 启动项目

**方法一：使用启动脚本**
```bash
# 启动后端 (终端1)
./start-backend.sh

# 启动前端 (终端2)
./start-frontend.sh
```

**方法二：手动启动**

```bash
# 启动后端
cd backend
source venv/bin/activate
python app.py

# 启动前端 (另一个终端)
npm run dev
```

### 访问应用
- 前端界面: http://localhost:5173
- 后端 API: http://localhost:5000

## 使用说明

### 1. 控制 AGV 小车

**键盘控制:**
- `W` / `↑`: 前进
- `S` / `↓`: 后退
- `A` / `←`: 左转
- `D` / `→`: 右转

**屏幕按钮:**
使用右侧控制面板中的方向按钮

### 2. 航点导航

1. 将 AGV 移动到目标位置
2. 点击 "添加航点" 记录当前位置
3. 重复添加多个航点
4. 点击 "开始导航" 启动自动导航
5. 点击 "停止导航" 随时暂停

### 3. 库存盘点

1. 点击 "开始盘点" 启动 RFID 扫描
2. 控制 AGV 在书架间移动
3. 观察扫描进度（绿色标签表示已扫描）
4. 点击 "停止盘点" 结束扫描
5. 点击 "生成报告" 查看扫描结果和缺失标签

### 4. 书架布局管理

**导入布局:**
1. 点击 "导入布局" 按钮
2. 选择 JSON 格式的布局文件
3. 场景将自动更新

**导出版局:**
1. 点击 "导出布局" 按钮
2. 下载当前场景的 JSON 文件

**示例布局:**
项目根目录下的 `sample-layout.json` 包含一个完整的示例布局。

## API 接口

### 盘点相关
- `POST /api/inventory/start` - 开始盘点
- `POST /api/inventory/stop` - 停止盘点并生成报告
- `GET /api/inventory/status` - 获取盘点状态

### 报告相关
- `GET /api/reports` - 获取所有报告列表
- `GET /api/reports/<id>` - 获取特定报告详情
- `GET /api/reports/<id>/export?format=xlsx` - 导出报告

### 布局相关
- `POST /api/layout` - 保存布局
- `GET /api/layouts` - 获取所有布局
- `GET /api/layouts/<id>` - 获取特定布局

### 扫描记录
- `POST /api/scan` - 记录标签扫描
- `GET /api/scans` - 获取所有扫描记录

## 书架布局文件格式

```json
{
  "version": "1.0",
  "name": "布局名称",
  "description": "布局描述",
  "shelves": [
    {
      "id": "shelf_001",
      "position": { "x": 0, "z": 0 },
      "rotation": 0,
      "width": 3,
      "depth": 0.6,
      "height": 2.5,
      "levels": 4
    }
  ]
}
```

## ROS 桥接

项目支持通过 rosbridge 与 ROS 系统通信：

**发布的话题:**
- `/odom` - AGV 里程计数据
- `/rfid_tag` - RFID 标签扫描数据

**订阅的话题:**
- `/cmd_vel` - 速度控制指令

**连接方式:**
默认连接到 `ws://localhost:9090`，可在 `rosbridge.js` 中修改。

## 技术栈

**前端:**
- Three.js - 3D 渲染引擎
- Vite - 构建工具
- WebSocket - 实时通信

**后端:**
- Flask - Web 框架
- Flask-SocketIO - WebSocket 支持
- Pandas - 数据处理和报告生成
- OpenPyXL - Excel 文件生成

## 许可证

MIT License
