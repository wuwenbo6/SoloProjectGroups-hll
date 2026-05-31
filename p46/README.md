# SWAT水文模拟系统

基于Python + PySWAT的分布式水文模型模拟系统，支持参数调整、SUFI-2自动校准和可视化展示。

## 功能特性

### 后端功能
- **SWAT模型运行**: 通过PySWAT接口运行SWAT水文模型
- **多输出支持**: 径流、泥沙产量、氮磷负荷等输出变量
- **数据库存储**: SQLite存储流域数据、模拟配置和结果
- **RESTful API**: 完整的Flask API接口
- **SUFI-2自动校准**: 支持参数不确定性分析
  - 参数采样（拉丁超立方）
  - 协方差矩阵自适应更新
  - P-factor/R-factor不确定性分析
  - 支持NSE、KGE、RMSE等目标函数

### 前端功能
- **Leaflet地图展示**: 子流域空间可视化
- **参数调整控件**: 支持CN2、SOL_AWC等关键参数调整
- **时间序列图表**: ECharts展示径流、泥沙、氮磷等变量
- **结果汇总展示**: 统计信息、水量平衡分析
- **校准界面**: SUFI-2校准进度实时展示

## 项目结构

```
p46/
├── backend/
│   ├── __init__.py           # Flask应用工厂
│   ├── config.py             # 配置文件
│   ├── models/               # 数据库模型
│   │   ├── watershed.py      # 流域/子流域模型
│   │   ├── simulation.py     # 模拟模型
│   │   └── calibration.py    # 校准模型
│   ├── api/                  # API接口
│   │   ├── watershed.py      # 流域管理API
│   │   ├── simulation.py     # 模拟运行API
│   │   ├── calibration.py    # 校准API
│   │   └── results.py        # 结果查询API
│   ├── utils/                # 工具模块
│   │   ├── swat_runner.py    # SWAT模型运行器
│   │   ├── data_processor.py # 数据处理工具
│   │   └── objective_functions.py # 目标函数
│   └── calibration/          # 校准算法
│       └── sufi2.py          # SUFI-2算法实现
├── frontend/
│   ├── index.html            # 主页面
│   ├── css/
│   │   └── style.css         # 样式文件
│   └── js/
│       ├── api.js            # API封装
│       ├── map.js            # 地图组件
│       └── app.js            # 应用逻辑
├── data/
│   ├── uploads/              # 上传文件
│   └── swat_projects/        # SWAT项目目录
├── database/                 # 数据库文件
├── logs/                     # 日志文件
├── requirements.txt          # Python依赖
├── app.py                    # 应用入口
├── .env                      # 环境变量
└── README.md                 # 项目文档
```

## 快速开始

### 1. 环境要求
- Python 3.8+
- SWAT模型（可选，用于真实运行）

### 2. 安装依赖

```bash
pip install -r requirements.txt
```

### 3. 运行应用

```bash
python app.py
```

应用将在 `http://localhost:5000` 启动。

### 4. 使用流程

1. **创建流域**: 点击"新建流域"按钮，输入流域信息
2. **创建模拟**: 选择流域后点击"新建模拟"，配置模拟参数
3. **调整参数**: 在参数面板调整CN2、SOL_AWC等参数
4. **运行模拟**: 点击"运行模拟"按钮
5. **查看结果**:
   - 子流域地图: 查看子流域空间分布
   - 时间序列: 查看径流、泥沙等输出
   - 结果汇总: 查看统计信息和水量平衡
6. **参数校准**: 点击"参数校准"，启动SUFI-2自动校准

## API接口文档

### 流域管理
- `GET /api/watershed/` - 获取所有流域
- `POST /api/watershed/` - 创建新流域
- `GET /api/watershed/{id}` - 获取流域详情
- `GET /api/watershed/{id}/subbasins` - 获取子流域列表

### 模拟运行
- `GET /api/simulation/` - 获取模拟列表
- `POST /api/simulation/` - 创建新模拟
- `POST /api/simulation/{id}/run` - 运行模拟
- `GET /api/simulation/{id}/status` - 获取模拟状态

### 结果查询
- `GET /api/results/simulation/{id}/timeseries` - 获取时间序列
- `GET /api/results/simulation/{id}/summary` - 获取结果汇总
- `GET /api/results/simulation/{id}/statistics` - 获取统计信息

### SUFI-2校准
- `POST /api/calibration/` - 创建校准任务
- `POST /api/calibration/{id}/run` - 运行校准
- `GET /api/calibration/{id}/status` - 获取校准状态
- `GET /api/calibration/{id}/best` - 获取最佳参数

## 可调整参数

### 关键水文参数

| 参数名 | 描述 | 范围 | 默认值 |
|--------|------|------|--------|
| CN2 | SCS曲线数 | 35-95 | 75 |
| SOL_AWC | 土壤可利用水量 | 0.05-0.5 | 0.2 |
| ESCO | 土壤蒸发补偿系数 | 0.5-1.0 | 0.95 |
| GWQMN | 地下水回流阈值 | 0-5000 | 1000 |
| ALPHA_BF | 基流退水常数 | 0.001-1.0 | 0.048 |
| CH_N2 | 主河道曼宁n值 | 0.01-0.3 | 0.014 |

## SUFI-2算法说明

SUFI-2（Sequential Uncertainty Fitting - Version 2）是一种广泛使用的水文模型参数自动校准方法：

1. **参数采样**: 基于多元正态分布进行采样
2. **模拟运行**: 对每组参数运行SWAT模型
3. **目标函数计算**: 计算NSE/KGE等评价指标
4. **参数更新**: 基于最优10%样本更新协方差矩阵
5. **不确定性分析**:
   - P-factor: 观测值落在95%置信区间的比例（目标>0.7）
   - R-factor: 平均95%置信区间宽度与观测值标准差之比（目标<1）

## 输出变量

系统支持以下输出变量的可视化：

- **径流** (m³/s) - 河道流量
- **泥沙产量** (t) - 土壤侵蚀量
- **硝氮负荷** (kg) - 硝酸盐氮输出
- **磷负荷** (kg) - 总磷输出
- **总氮** (kg) - 总氮输出
- **总磷** (kg) - 总磷输出

## 注意事项

1. **PySWAT集成**: 系统包含mock模式，未安装PySWAT时也可运行演示
2. **SWAT项目**: 真实运行需要提供有效的SWAT项目路径
3. **观测数据**: 校准需要实测水文数据支持
4. **计算资源**: SUFI-2校准计算量大，建议根据需要调整采样数和迭代次数

## 技术栈

- **后端**: Flask + SQLAlchemy + PySWAT
- **前端**: Leaflet + ECharts + Bootstrap
- **数据库**: SQLite（可扩展至PostgreSQL）
- **校准算法**: SUFI-2

## License

MIT
