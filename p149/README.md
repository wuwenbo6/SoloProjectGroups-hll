# 卫星轨道计算与可视化系统

基于 Python + poliastro + Cesium 的卫星轨道计算与3D可视化Web应用。

## 功能特性

### 1. 轨道计算
- **轨道根数输入**: 支持通过半长轴、偏心率、倾角、升交点赤经、近地点幅角计算轨道
- **TLE输入**: 支持两行轨道要素（Two-Line Elements）输入
- **预设轨道**: LEO、MEO、GEO、SSO 快速预设
- **3D可视化**: Cesium 地球仪上实时显示轨道

### 2. 霍曼转移轨道模拟
- 初始轨道到目标轨道的霍曼转移计算
- 显示转移轨道半长轴
- 两次速度增量（Δv）计算
- 转移时间计算
- 可视化显示初始轨道、转移轨道、目标轨道

### 3. 燃料消耗计算
- 基于齐奥尔科夫斯基火箭方程
- 支持自定义比冲（Isp）
- 支持自定义初始质量
- 计算所需燃料质量、最终质量、质量比

### 4. 发射窗口计算
- 基于发射场位置和目标轨道参数
- 计算发射窗口时间
- 显示多次发射机会

## 项目结构

```
p149/
├── app.py                 # Flask 后端应用
├── requirements.txt       # Python 依赖
├── templates/
│   └── index.html        # 前端页面
└── static/               # 静态资源目录
```

## API 接口

### 轨道计算（从轨道根数）
```
POST /api/orbit/from-elements
Content-Type: application/json

{
    "a": 7000,        // 半长轴 (km)
    "ecc": 0.001,     // 偏心率
    "inc": 28.5,      // 倾角 (°)
    "raan": 0.0,      // 升交点赤经 (°)
    "argp": 0.0       // 近地点幅角 (°)
}
```

### 轨道计算（从TLE）
```
POST /api/orbit/from-tle
Content-Type: application/json

{
    "tle_line1": "1 25544U 98067A   ...",
    "tle_line2": "2 25544  51.6400 ..."
}
```

### 霍曼转移计算
```
POST /api/maneuver/hohmann
Content-Type: application/json

{
    "initial_radius": 7000,    // 初始轨道半径 (km)
    "target_radius": 36000,    // 目标轨道半径 (km)
    "Isp": 300,                // 比冲 (s)
    "initial_mass": 5000       // 初始质量 (kg)
}
```

### 发射窗口计算
```
POST /api/launch-window
Content-Type: application/json

{
    "raan": 90.0,         // 目标RAAN (°)
    "inc": 28.5,          // 目标倾角 (°)
    "lon_launch": 100.0,  // 发射场经度 (°)
    "lat_launch": 28.0    // 发射场纬度 (°)
}
```

### 燃料计算
```
POST /api/fuel-calculation
Content-Type: application/json

{
    "delta_v": 1000,     // 速度增量 (m/s)
    "Isp": 300,          // 比冲 (s)
    "initial_mass": 5000 // 初始质量 (kg)
}
```

## 技术栈

### 后端
- **Flask**: Web框架
- **poliastro**: 天体动力学库
- **NumPy/SciPy**: 科学计算
- **Astropy**: 天文数据处理

### 前端
- **CesiumJS**: 3D地球可视化
- **原生JavaScript**: 交互逻辑
- **CSS3**: 样式设计

## 使用说明

### 1. 安装依赖
```bash
pip install -r requirements.txt
```

### 2. 启动应用
```bash
python app.py
```

### 3. 访问应用
打开浏览器访问: `http://localhost:8080`

## 操作指南

### 轨道计算
1. 选择"轨道计算"标签页
2. 选择输入模式（轨道根数或TLE）
3. 输入轨道参数或选择预设轨道
4. 点击"计算并显示轨道"
5. 在Cesium地球仪上查看轨道

### 霍曼转移
1. 选择"轨道机动"标签页
2. 输入初始轨道半径和目标轨道半径
3. 设置推进剂参数（比冲、初始质量）
4. 点击"计算霍曼转移"
5. 查看Δv、转移时间、燃料消耗等结果

### 燃料计算
1. 选择"燃料计算"标签页
2. 输入所需的Δv
3. 设置比冲和初始质量
4. 点击"计算燃料"查看结果

## 注意事项

1. 所有距离单位为公里（km）
2. 所有角度单位为度（°）
3. 质量单位为千克（kg）
4. 速度单位为米/秒（m/s）
5. 时间单位为分钟（min）

## 参考资料

- [poliastro 文档](https://docs.poliastro.space/)
- [CesiumJS 文档](https://cesium.com/docs/)
- [霍曼转移轨道](https://en.wikipedia.org/wiki/Hohmann_transfer_orbit)
- [齐奥尔科夫斯基火箭方程](https://en.wikipedia.org/wiki/Tsiolkovsky_rocket_equation)
