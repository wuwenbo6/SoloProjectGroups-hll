# 🛰️ 卫星轨道跟踪系统

一个完整的全栈卫星跟踪应用，使用Python后端 + SGP4模型计算卫星轨道，Cesium进行3D可视化。

## ✨ 功能特性

- **SGP4轨道传播**: 使用专业的SGP4模型计算卫星位置
- **3D可视化**: 基于Cesium的3D地球可视化
- **地面轨迹**: 显示卫星地面轨迹
- **过境预报**: 预测卫星经过观测点的时间和仰角
- **TLE数据管理**: 支持添加、删除、搜索TLE数据
- **数据库存储**: SQLite数据库持久化存储TLE数据

## 🚀 快速开始

### 方式一：使用启动脚本 (推荐)

```bash
chmod +x start.sh
./start.sh
```

### 方式二：手动启动

1. 创建虚拟环境：
```bash
python3 -m venv venv
source venv/bin/activate
```

2. 安装依赖：
```bash
pip install -r requirements.txt
```

3. 启动服务：
```bash
python run.py
```

4. 访问应用：打开浏览器访问 `http://localhost:5000`

## 📖 使用指南

### 1. 加载示例数据

首次使用时，点击「加载示例卫星」按钮，系统会预加载几颗著名卫星：
- ISS (ZARYA) - 国际空间站
- HUBBLE - 哈勃太空望远镜
- TIANHE CORE MODULE - 中国空间站天和核心舱
- GPS BIIR-2 - GPS导航卫星
- METEOR M2 - 俄罗斯气象卫星

### 2. 选择卫星

点击卫星列表中的卫星，查看其详细信息：
- 轨道倾角
- 升交点赤经
- 偏心率
- 轨道周期
- 当前位置（经纬度、高度）

### 3. 查看轨道

选中卫星后，可执行以下操作：
- **显示轨道**: 在3D地球上显示卫星轨道线
- **显示地面轨迹**: 显示卫星地面轨迹投影
- **实时跟踪**: 实时更新卫星位置

### 4. 过境预报

设置观测点参数：
- **纬度**: 观测点纬度（默认北京39.9042）
- **经度**: 观测点经度（默认北京116.4074）
- **海拔**: 观测点海拔高度（米）
- **预报时长**: 预报多少小时内的过境
- **最小仰角**: 只预报仰角大于此值的过境

点击「预报过境」按钮，系统会计算并显示所有过境事件，点击每条记录可在地图上显示轨迹。

### 5. 添加自定义TLE数据

在「添加TLE数据」区域输入：
- NORAD ID: 卫星编号
- 卫星名称
- TLE Line 1
- TLE Line 2

点击「添加TLE」即可保存到数据库。

## 📡 API 接口

### TLE数据管理

- `GET /api/tles` - 获取所有TLE数据
- `GET /api/tles/<norad_id>` - 获取指定卫星TLE
- `POST /api/tles` - 添加/更新TLE数据
- `DELETE /api/tles/<norad_id>` - 删除TLE
- `GET /api/tles/search?q=<query>` - 搜索TLE

### 卫星位置计算

- `GET /api/satellite/<norad_id>/position` - 获取当前位置
- `GET /api/satellite/<norad_id>/groundtrack?duration=180&interval=30` - 获取地面轨迹
- `GET /api/satellite/<norad_id>/orbit?points=360` - 获取轨道路径
- `GET /api/satellite/<norad_id>/info` - 获取卫星信息

### 过境预报

- `GET /api/satellite/<norad_id>/passes?lat=<lat>&lon=<lon>&alt=<alt>&hours=24&min_elev=10` - 预报过境

### 初始化

- `POST /api/init/sample` - 加载示例数据

## 🏗️ 项目结构

```
p116/
├── backend/
│   ├── __init__.py
│   ├── app.py              # Flask API服务
│   ├── database.py         # 数据库模型
│   ├── tle_manager.py      # TLE数据管理
│   ├── sgp4_propagator.py  # SGP4轨道计算
│   └── predictor.py        # 过境预报算法
├── frontend/
│   ├── index.html          # 主页面
│   ├── style.css           # 样式文件
│   └── app.js              # 前端逻辑
├── requirements.txt        # Python依赖
├── run.py                  # 启动入口
├── start.sh                # 启动脚本
└── README.md               # 说明文档
```

## 🔧 技术栈

**后端**:
- Python 3.x
- Flask - Web框架
- SGP4 - 轨道传播模型
- SQLAlchemy - ORM
- SQLite - 数据库

**前端**:
- Cesium - 3D地球可视化
- HTML5 / CSS3 / JavaScript

## 📝 注意事项

1. **TLE数据更新**: TLE数据有有效期，建议定期更新最新的TLE数据以保证计算精度
2. **网络连接**: 首次加载需要网络连接以下载Cesium库和地图瓦片
3. **浏览器兼容**: 推荐使用Chrome或Firefox现代浏览器
4. **计算性能**: 长时段过境预报可能需要较长计算时间

## 🌐 获取TLE数据

可从以下网站获取最新的TLE数据：
- CelesTrak: https://www.celestrak.com/
- Space-Track: https://www.space-track.org/
- AMSAT: https://www.amsat.org/

## 📄 许可证

MIT License
