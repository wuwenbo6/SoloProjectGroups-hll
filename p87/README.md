# 期权定价系统 - Option Pricing System

基于 **C++ + OpenMP + FastAPI** 的蒙特卡洛期权定价系统，支持欧式和亚式期权定价。

## 功能特性

- ✅ **欧式期权定价** - 蒙特卡洛模拟
- ✅ **美式期权定价** - LSM (Longstaff-Schwartz) 算法
- ✅ **亚式期权定价** - 算术平均价格
- ✅ **多标的并行计算** - 支持同时定价多个期权
- ✅ **95%置信区间** - 统计置信度分析
- ✅ **OpenMP并行加速** - C++层多线程计算
- ✅ **内存优化** - 分块计算，支持千万级路径
- ✅ **历史记录存储** - SQLite数据库保存定价历史
- ✅ **定价报告导出** - CSV格式报告导出
- ✅ **Web界面** - 直观的参数输入和结果展示

## 项目结构

```
p87/
├── cpp/                      # C++计算核心
│   ├── option_pricing.h      # 头文件
│   ├── option_pricing.cpp    # 蒙特卡洛实现
│   ├── main.cpp              # 命令行入口
│   └── CMakeLists.txt        # CMake配置
├── backend/                  # Python后端
│   ├── main.py               # FastAPI主程序
│   ├── pricing_engine.py     # C++调用封装
│   └── database.py           # 数据库模型
├── frontend/                 # 前端页面
│   └── index.html            # Web界面
├── build/                    # 编译输出
│   └── option_pricing        # C++可执行文件
├── build.sh                  # 编译脚本
├── requirements.txt          # Python依赖
└── README.md                 # 本文件
```

## 快速开始

### 1. 编译C++代码

```bash
# 使用g++直接编译
mkdir -p build
g++ -std=c++17 -fopenmp -O2 cpp/main.cpp cpp/option_pricing.cpp -o build/option_pricing

# 或使用CMake
chmod +x build.sh
./build.sh
```

### 2. 安装Python依赖

```bash
pip install -r requirements.txt
```

### 3. 启动服务

```bash
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 4. 访问界面

打开浏览器访问: http://localhost:8000

API文档: http://localhost:8000/docs

## API接口

### 单标的定价

```bash
POST /api/price/single
Content-Type: application/json

{
    "underlying_name": "AAPL",
    "option_style": "european",
    "option_type": "call",
    "S0": 100,
    "K": 105,
    "T": 1,
    "r": 0.05,
    "sigma": 0.2,
    "num_paths": 100000,
    "num_steps": 252
}
```

### 多标的定价

```bash
POST /api/price/multi
Content-Type: application/json

{
    "options": [
        {
            "underlying_name": "AAPL",
            "option_style": "european",
            "option_type": "call",
            "S0": 100,
            "K": 105,
            "T": 1,
            "r": 0.05,
            "sigma": 0.2,
            "num_paths": 100000
        }
    ]
}
```

### 查询历史

```bash
GET /api/history?limit=100&underlying_name=AAPL
```

## 参数说明

| 参数 | 说明 | 示例 |
|------|------|------|
| underlying_name | 标的名称 | AAPL, GOOG |
| option_style | 期权风格 | european / asian |
| option_type | 期权类型 | call / put |
| S0 | 当前价格 | 100.0 |
| K | 行权价格 | 105.0 |
| T | 到期时间(年) | 1.0 |
| r | 无风险利率 | 0.05 |
| sigma | 波动率 | 0.2 |
| num_paths | 模拟路径数 | 100000 |
| num_steps | 时间步数(亚式) | 252 |

## 命令行使用

```bash
# 欧式期权
./build/option_pricing european call 100 105 1 0.05 0.2 100000

# 亚式期权
./build/option_pricing asian call 100 105 1 0.05 0.2 100000 252
```

输出格式: `价格 置信下限 置信上限 标准误差 耗时`

## 技术细节

### 蒙特卡洛方法

- 使用几何布朗运动模拟标的价格路径
- 风险中性定价: `价格 = e^(-rT) * E[payoff]`
- 95%置信区间: `价格 ± 1.96 * 标准误差`

### 性能优化

- **分块计算**: 避免大数组内存溢出
- **线程局部累加**: 减少锁竞争
- **OpenMP并行**: 多线程加速模拟
- **编译优化**: -O2 优化级别

### 美式期权 (LSM算法)

- Longstaff-Schwartz 最小二乘蒙特卡洛方法
- 使用Laguerre多项式基函数进行回归
- 倒向递推估计提前行权边界
- 支持看涨/看跌期权

### 亚式期权

算术平均价格期权，平均周期内所有观察点价格。

### 报告导出

支持三种报告导出（CSV格式）：
1. **单标的报告** - 导出当前单个期权定价结果
2. **多标的报告** - 批量导出多个期权结果
3. **历史记录报告** - 导出全部定价历史数据

## 数据库

定价历史自动保存到 SQLite 数据库 `option_pricing.db`，包含所有输入参数和计算结果。

## 注意事项

1. **路径数越多精度越高，但计算时间越长**
2. **建议路径数**: 10,000 - 1,000,000
3. **亚式期权步数**: 通常设为 252 (一年交易日)
4. **内存使用**: 分块计算支持千万级路径不会OOM
