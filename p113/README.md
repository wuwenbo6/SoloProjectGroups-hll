# 🛰️ GNSS数据质量分析系统

一个完整的GNSS数据质量分析系统，支持RINEX文件解析、多路径误差计算、信噪比分析、周跳检测，以及卫星星空图和可见性时间图可视化。

## ✨ 功能特性

### 后端 (Python/FastAPI)
- **RINEX文件解析**: 支持观测文件(.o/.obs)和导航文件(.n/.nav)
- **多路径误差计算**: 基于码伪距和载波相位的组合计算
- **信噪比(SNR)分析**: L1/L2频段信噪比统计
- **周跳检测**: 基于几何无关组合的周跳检测算法
- **数据库存储**: SQLite存储质量报告
- **RESTful API**: 完整的FastAPI接口

### 前端 (HTML/JavaScript)
- **卫星星空图**: 极坐标显示卫星位置，支持时间动画
- **可见性时间图**: 卫星可见时段可视化
- **SNR-仰角散点图**: 信噪比与仰角关系分析
- **质量指标表格**: 各卫星详细质量指标
- **历史报告管理**: 查看和管理历史质量报告

## 📁 项目结构

```
p113/
├── backend/                 # 后端代码
│   ├── __init__.py
│   ├── main.py             # FastAPI主应用
│   ├── database.py         # 数据库配置
│   ├── models.py           # 数据模型
│   ├── rinex_parser.py     # RINEX文件解析
│   ├── quality_calculator.py  # 质量计算模块
│   └── satellite_position.py  # 卫星位置计算
├── frontend/               # 前端代码
│   ├── index.html          # 主页面
│   └── app.js              # 前端逻辑
├── sample_data/            # 示例数据
├── requirements.txt        # Python依赖
├── start.sh               # 启动脚本
├── generate_sample_data.py # 生成示例数据
└── README.md              # 说明文档
```

## 🚀 快速开始

### 1. 生成示例数据
```bash
python generate_sample_data.py
```

### 2. 启动后端服务
```bash
chmod +x start.sh
./start.sh
```

或者手动安装和启动：
```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cd backend
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. 打开前端页面
在浏览器中打开 `frontend/index.html`

### 4. 访问API文档
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## 📊 质量指标说明

### 多路径误差 (Multipath)
- 利用码伪距和载波相位的组合计算
- 反映信号反射造成的测距误差
- 单位: 米 (m)

### 信噪比 (SNR)
- 信号强度与噪声的比值
- 反映接收信号的质量
- 单位: dBHz

### 周跳检测 (Cycle Slips)
- 基于几何无关组合(Geometry-Free)检测
- 识别载波相位的整周跳变
- 阈值: 0.1米

### 数据可用性
- 有效观测历元占总历元的比例
- 反映数据完整性

### 质量评分
- 综合多路径(30%)、SNR(30%)、周跳(20%)、可用性(20%)
- 评分范围: 0-100分
  - 优秀: 80-100
  - 良好: 60-79
  - 一般: 40-59
  - 较差: 0-39

## 🔌 API接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/upload` | 上传RINEX文件 |
| GET | `/api/quality-metrics` | 获取质量指标 |
| GET | `/api/skyplot` | 获取星空图数据 |
| GET | `/api/visibility` | 获取可见性数据 |
| GET | `/api/snr-elevation` | 获取SNR-仰角数据 |
| POST | `/api/save-report` | 保存质量报告 |
| GET | `/api/reports` | 获取报告列表 |
| GET | `/api/reports/{id}` | 获取报告详情 |
| DELETE | `/api/reports/{id}` | 删除报告 |
| GET | `/api/health` | 健康检查 |

## 🛠️ 技术栈

- **后端**: FastAPI, SQLAlchemy, georinex, numpy, pandas, pymap3d
- **前端**: HTML5, JavaScript, Chart.js
- **数据库**: SQLite

## 📝 使用说明

1. 上传观测文件(.o)和导航文件(.n)
2. 系统自动解析并计算质量指标
3. 在各标签页查看分析结果
4. 可保存质量报告到数据库
5. 在历史报告中查看和管理已保存的报告

## ⚠️ 注意事项

- 示例数据仅用于测试，实际使用请上传真实RINEX文件
- 导航文件用于计算卫星位置，上传可获得更准确的星空图
- 大型RINEX文件处理可能需要较长时间

## 📄 License

MIT License
