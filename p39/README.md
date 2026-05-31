# 候车室客流热力图监控系统

基于WiFi探针数据的候车室人数实时监控系统，采用贝叶斯估计进行人数估算，支持实时热力图展示和趋势预测。

## 系统架构

```
AP探针 → Kafka消息队列 → Python后端(贝叶斯估算) → PostgreSQL → Vue3前端
                                                         ↓
                                                     显示屏API
```

## 核心功能

### 后端功能
- **Kafka数据接收**: 实时接收AP上报的探针数据（MAC地址、RSSI、时间戳）
- **MAC去重**: 识别并处理随机MAC地址，避免重复计数
- **贝叶斯估计算法**: 基于Gamma分布的贝叶斯推理，提供置信区间
- **趋势预测**: 基于时间序列的客流趋势预测
- **REST API**: 提供完整的数据接口和显示屏专用接口

### 前端功能
- **实时监控面板**: 展示各区域客流统计数据
- **热力图展示**: Canvas绘制的实时客流热力图
- **趋势预测图**: ECharts展示历史数据和预测曲线
- **历史回放**: 支持按日期回放历史客流数据
- **区域配置**: 可视化配置监控区域

## 技术栈

### 后端
- Python 3.11
- FastAPI - Web框架
- Kafka - 消息队列
- PostgreSQL - 数据存储
- NumPy/SciPy - 科学计算（贝叶斯估计）

### 前端
- Vue 3 + Vite
- Element Plus - UI组件库
- ECharts - 图表库
- Pinia - 状态管理

## 快速启动

### Docker部署（推荐）

```bash
# 启动所有服务
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f backend
```

启动后访问：
- 前端界面: http://localhost:3000
- 后端API文档: http://localhost:8000/docs
- Kafka UI: http://localhost:8080

### 本地开发

#### 后端启动

```bash
cd backend

# 创建虚拟环境
python -m venv venv
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 复制环境配置
cp .env.example .env

# 启动服务
python -m uvicorn app.main:app --reload
```

#### 前端启动

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

## API接口

### 探针数据上报
```http
POST /api/probe
Content-Type: application/json

{
  "mac_address": "00:1A:2B:3C:4D:5E",
  "rssi": -65,
  "ap_id": "AP-001",
  "timestamp": "2024-01-01T12:00:00Z",
  "zone": "waiting_area_1"
}
```

### 批量上报
```http
POST /api/probe/batch
Content-Type: application/json

[
  {
    "mac_address": "00:1A:2B:3C:4D:5E",
    "rssi": -65,
    "ap_id": "AP-001",
    "zone": "waiting_area_1"
  }
]
```

### 获取当前人数
```http
GET /api/count/current?zone=waiting_area_1
```

响应示例:
```json
[
  {
    "zone": "waiting_area_1",
    "timestamp": "2024-01-01T12:00:00Z",
    "raw_count": 45,
    "estimated_count": 52.3,
    "lower_bound": 48.2,
    "upper_bound": 56.5,
    "confidence": 0.92
  }
]
```

### 获取热力图数据
```http
GET /api/heatmap
```

### 获取趋势预测
```http
GET /api/trend?zone=waiting_area_1&prediction_steps=12
```

### 显示屏接口
```http
GET /api/display/{display_id}?zone=waiting_area_1
```

响应示例:
```json
{
  "display_id": "DISP-001",
  "zone": "waiting_area_1",
  "current_count": 52,
  "max_capacity": 150,
  "occupancy_rate": 34.7,
  "confidence": 0.92,
  "timestamp": "2024-01-01T12:00:00Z",
  "status": "normal"
}
```

## 算法说明

### 高级MAC去重算法 (解决蓝牙MAC随机化问题)

**问题**: 现代手机采用MAC随机化技术，导致同一设备会被识别为多个不同设备，造成计数虚高。

**解决方案**:

1. **DBSCAN聚类去重** ([estimator.py](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p39/backend/app/estimator.py#L11-L87)):
   - 特征向量: [时间(小时), RSSI, 是否随机MAC, OUI哈希]
   - 基于密度的DBSCAN聚类识别同一设备的多个随机MAC
   - 同一聚类簇内只保留一个代表性设备ID

2. **随机MAC识别与处理**:
   - 根据MAC地址第二位字符识别 (2, 6, A, E)
   - 时间片分组: 10分钟窗口 + RSSI分桶 (10dBm步长)
   - 随机MAC比例调整因子: 默认0.75

3. **多级去重策略**:
   - 少量数据: 基础去重 (MAC地址直接去重)
   - 中等数据: 时间片分组去重
   - 大量数据: DBSCAN聚类精化

4. **新增输出字段**:
   - `adjusted_count`: 去重调整后的设备数量
   - `random_mac_ratio`: 随机MAC占比
   - `total_probes`: 探针总数

### 贝叶斯估计算法

采用Gamma-Gamma模型进行人数估计:

```
先验: λ ~ Gamma(α=2, β=5)
观测: 观察到N个设备
后验: λ|N ~ Gamma(α+N, β+k)

估计值: E[λ] = (α+N)/(β+k) * 1/P(检测到)
置信区间: 采用95%后验置信区间
```

检测概率基于平均探针数量动态调整:
- ≥8个探针/设备: 98%检测概率
- ≥5个探针/设备: 95%检测概率
- ≥3个探针/设备: 88%检测概率
- ≥2个探针/设备: 78%检测概率
- <2个探针/设备: 65%检测概率

### 节假日客流预测增强 (解决节假日预测偏差问题)

**问题**: 节假日/周末客流模式与工作日差异显著，未考虑会导致预测偏差。

**解决方案** ([holidays_cn.py](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p39/backend/app/holidays_cn.py)):

1. **中国节假日数据库**:
   - 2024-2026年法定节假日数据
   - 包含调休工作日处理
   - 支持春节、国庆、五一等主要节假日

2. **多维度特征融合**:
   - 日期类型特征: 是否节假日、节假日类型、是否周末
   - 日因子: 不同节假日类型的客流放大系数
     - 春节: 1.8x, 国庆: 1.6x, 五一: 1.5x
     - 普通周末: 1.3x
   - 季节因子: 月度季节性调整

3. **历史剖面学习** ([predictor.py](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p39/backend/app/predictor.py#L10-L19)):
   - 工作日剖面: 按周几+小时学习历史模式
   - 节假日剖面: 按节假日类型+小时学习历史模式
   - 预测时加权融合: 节假日剖面权重60%，实时数据权重40%

4. **API新增元数据**:
   ```json
   {
     "forecast_metadata": {
       "is_holiday": true,
       "holiday_type": "spring_festival",
       "day_factor": 1.8,
       "season_factor": 1.1,
       "is_weekend": true,
       "weekday": 5
     }
   }
   ```

## 模拟数据生成

```bash
# 生成持续模拟数据（每秒5条）
python backend/scripts/generate_mock_data.py

# 生成批量数据（100条）
python backend/scripts/generate_mock_data.py burst 100

# 指定速率
python backend/scripts/generate_mock_data.py 10  # 每秒10条
```

## 目录结构

```
.
├── backend/                    # 后端代码
│   ├── app/
│   │   ├── __init__.py
│   │   ├── config.py          # 配置管理
│   │   ├── database.py        # 数据库模型
│   │   ├── models.py          # Pydantic模型
│   │   ├── estimator.py       # 人数估算算法
│   │   ├── predictor.py       # 趋势预测
│   │   ├── kafka_consumer.py  # Kafka消费者
│   │   └── main.py            # API主入口
│   ├── scripts/
│   │   ├── init.sql           # 数据库初始化
│   │   └── generate_mock_data.py
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── frontend/                   # 前端代码
│   ├── src/
│   │   ├── views/             # 页面组件
│   │   ├── api/               # API封装
│   │   ├── stores/            # Pinia状态
│   │   ├── router/            # 路由配置
│   │   └── styles/            # 样式文件
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
├── docker-compose.yml
└── README.md
```

## 监控区域配置

在数据库中配置区域信息:

| 字段 | 说明 |
|------|------|
| zone_id | 区域唯一标识 |
| name | 区域显示名称 |
| x, y | 区域左上角坐标（0-1） |
| width, height | 区域宽高（0-1） |
| max_capacity | 最大容量 |
| ap_ids | 关联AP设备列表 |

也可通过前端"区域配置"页面进行可视化配置。

## 注意事项

1. **RSSI阈值**: 默认-70dBm，可在配置中调整
2. **去重窗口**: 默认300秒（5分钟）
3. **贝叶斯先验参数**: 可根据实际场景调优α和β
4. **数据隐私**: MAC地址在存储前可进行哈希匿名化处理

## 许可证

MIT License
