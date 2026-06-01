# 污染扩散模拟系统

一个基于高斯羽流模型的空气污染扩散模拟系统，包含后端API服务和前端可视化界面。

## 功能特性

- **高斯羽流扩散模型**：实现类似HYSPLIT的扩散模拟算法
- **时空模拟**：支持时间序列的污染扩散动画
- **浓度等值线**：可视化污染物浓度分布
- **参数配置**：灵活配置污染源、气象和模拟参数
- **数据持久化**：SQLite数据库存储模拟历史
- **交互式地图**：基于Leaflet的可视化界面

## 技术栈

### 后端
- Python 3.8+
- FastAPI - Web API框架
- SQLAlchemy - ORM框架
- SQLite - 数据库
- NumPy/SciPy - 科学计算

### 前端
- Leaflet - 地图可视化
- 原生JavaScript
- HTML5 + CSS3

## 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 启动服务

```bash
chmod +x start.sh
./start.sh
```

或手动启动：

```bash
PYTHONPATH=$(pwd) python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. 访问应用

- **前端页面**: http://localhost:8000/static/index.html
- **API文档**: http://localhost:8000/docs
- **健康检查**: http://localhost:8000/health

## API接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/simulations/run` | 运行模拟并保存结果 |
| GET | `/api/v1/simulations` | 获取所有模拟列表 |
| GET | `/api/v1/simulations/{id}` | 获取单个模拟详情 |
| GET | `/api/v1/simulations/{id}/result` | 获取模拟结果数据 |
| DELETE | `/api/v1/simulations/{id}` | 删除模拟记录 |

## 模拟参数说明

### 污染源参数
- **纬度/经度**：污染源位置坐标
- **排放速率**：污染物排放强度 (g/s)
- **污染物类型**：PM2.5、SO2、NOx、CO

### 气象参数
- **风速**：0-20 m/s
- **风向**：0-360度（0=北，90=东，180=南，270=西）
- **大气稳定度**：
  - A: 极不稳定
  - B: 不稳定
  - C: 弱不稳定
  - D: 中性（默认）
  - E: 弱稳定
  - F: 稳定

### 模拟参数
- **持续时间**：模拟时长（小时）
- **网格分辨率**：计算网格精度（度）

## 算法原理

系统采用**高斯羽流模型**（Gaussian Plume Model）模拟污染物扩散：

```
C(x,y,z) = (Q / (2πuσyσz)) * exp(-y²/(2σy²)) * exp(-(z-H)²/(2σz²))
```

其中：
- C: 浓度
- Q: 排放速率
- u: 风速
- σy, σz: 横向和垂直扩散参数
- H: 有效源高

## 项目结构

```
p99/
├── backend/
│   ├── main.py              # FastAPI主应用
│   ├── config.py            # 配置文件
│   └── app/
│       ├── models/          # 数据模型
│       │   ├── database.py  # 数据库连接
│       │   └── simulation.py # 模拟模型
│       ├── schemas/         # Pydantic模式
│       │   └── simulation.py
│       ├── services/        # 业务逻辑
│       │   ├── diffusion_model.py # 扩散算法
│       │   └── simulation_service.py
│       └── api/             # API路由
│           └── simulations.py
├── static/
│   └── index.html           # 前端页面
├── requirements.txt         # Python依赖
├── start.sh                 # 启动脚本
└── README.md                # 说明文档
```

## 使用说明

1. 在地图上点击或手动输入污染源位置
2. 配置排放速率和污染物类型
3. 设置气象参数（风速、风向、大气稳定度）
4. 点击"运行模拟"按钮
5. 查看污染扩散动画和浓度分布
6. 拖动时间滑块查看不同时间点的污染情况
7. 点击历史模拟记录可重新加载

## 注意事项

- 本系统使用高斯羽流模型进行简化模拟，实际HYSPLIT模型更为复杂
- 模拟结果仅供参考，不建议用于专业环境评估
- 建议使用Chrome或Firefox浏览器获得最佳体验
