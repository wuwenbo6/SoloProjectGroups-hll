# CYGNSS 土壤湿度反演系统

基于CYGNSS卫星DDM数据的土壤湿度反演系统，使用小波变换进行去噪处理。

## 功能特性

- 🌍 **全球湿度地图**: 等经纬度投影展示全球土壤湿度分布
- 📈 **时间序列分析**: 查看任意地点的湿度变化趋势
- 🌊 **小波变换去噪**: 使用Daubechies小波对DDM数据进行2D去噪
- 💾 **数据库存储**: SQLite存储反演结果，支持快速查询

## 技术栈

### 后端
- **FastAPI**: 高性能Python Web框架
- **SQLAlchemy**: ORM数据库操作
- **PyWavelets**: 小波变换库
- **NumPy/SciPy**: 科学计算

### 前端
- **Vue 3**: 响应式前端框架
- **ECharts**: 数据可视化
- **Vite**: 构建工具

## 快速开始

### 方式一：一键启动
```bash
chmod +x start.sh
./start.sh
```

### 方式二：分步启动

#### 后端
```bash
pip install -r requirements.txt
cd backend
uvicorn main:app --reload
```

#### 前端
```bash
npm install
npm run dev
```

## API 接口

| 接口 | 方法 | 描述 |
|------|------|------|
| `/api/invert` | POST | 提交DDM数据进行湿度反演 |
| `/api/moisture` | GET | 查询湿度数据 |
| `/api/timeseries` | GET | 获取时间序列数据 |
| `/api/statistics` | GET | 获取统计信息 |

## 项目结构

```
.
├── backend/
│   ├── main.py                  # FastAPI主应用
│   ├── database.py              # 数据库模型
│   ├── wavelet_denoise.py       # 小波变换去噪
│   └── soil_moisture_inversion.py # 反演算法
├── src/
│   ├── App.vue
│   ├── main.js
│   └── components/
│       ├── GlobalMap.vue        # 全球地图
│       └── TimeSeriesPanel.vue  # 时间序列
├── requirements.txt
├── package.json
└── start.sh
```

## 算法说明

### 小波变换去噪
- 使用db4小波基函数
- 2级分解
- 软阈值去噪
- 阈值基于MAD估计

### 土壤湿度反演
1. 从DDM提取峰值功率
2. 计算地表反射率
3. 基于介电常数模型反演土壤湿度

## 访问地址

- 前端界面: http://localhost:3000
- API文档: http://localhost:8000/docs
