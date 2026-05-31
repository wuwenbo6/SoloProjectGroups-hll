# 步态分析系统

一个完整的步态分析解决方案，包含Android移动端、Python云端服务和Web医生平台。

## 系统架构

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│  Android    │  BLE    │   MPU6050   │         │  Web Doctor │
│    App      │◄───────►│  IMU 传感器 │         │   Platform  │
└──────┬──────┘         └─────────────┘         └──────┬──────┘
       │                                                │
       │ HTTP/HTTPS                                     │
       ▼                                                │
┌───────────────────────────────────────────┐          │
│              Python 云端服务               │          │
│  ┌──────────┐   ┌──────────┐   ┌──────┐  │          │
│  │ 数据存储  │──►│ LSTM训练 │──►│ 模型 │◄─┼──────────┘
│  └──────────┘   └──────────┘   └──────┘  │
│  ┌──────────┐   ┌──────────┐             │
│  │ 报告生成 │   │  用户管理│             │
│  └──────────┘   └──────────┘             │
└───────────────────────────────────────────┘
```

## 项目结构

```
p18/
├── android/                    # Android移动端
│   ├── app/
│   │   └── src/main/
│   │       ├── java/com/gait/analysis/
│   │       │   ├── bluetooth/      # 蓝牙连接管理
│   │       │   ├── lstm/           # LSTM步态识别
│   │       │   ├── vibration/      # 振动反馈
│   │       │   ├── network/        # 网络上传
│   │       │   └── ui/             # 界面
│   │       └── res/
│   └── build.gradle
│
├── server/                     # Python云端服务
│   ├── api/
│   │   ├── main.py             # FastAPI主服务
│   │   └── database.py         # 数据库模型
│   ├── training/
│   │   └── gait_trainer.py     # LSTM模型训练
│   ├── models/                 # 模型存储
│   ├── data/                   # 数据存储
│   └── requirements.txt
│
└── web/                        # Web医生平台
    ├── src/
    │   ├── pages/              # 页面组件
    │   ├── router/             # 路由
    │   └── App.vue
    ├── package.json
    └── vite.config.js
```

## 功能模块

### 1. Android App

**蓝牙连接**
- BLE扫描和连接MPU6050传感器
- 实时接收加速度和陀螺仪数据
- 支持设备配对和自动重连

**LSTM步态识别**
- TensorFlow Lite模型推理
- 滑动窗口处理时序数据
- 支撑相/摆动相二分类
- 相位持续时间验证

**振动反馈**
- 相位异常时实时提醒
- 多种振动模式区分
- 可配置反馈灵敏度

**数据上传**
- 本地缓存批量上传
- 断点续传机制
- 模型自动更新

### 2. Python云端服务

**数据存储**
- SQLite/PostgreSQL数据库
- 用户会话管理
- JSON原始数据归档

**LSTM模型训练**
- 个性化模型训练
- 自动超参数调优
- 模型版本管理
- TFLite模型导出

**报告生成**
- 步态参数计算
- 异常检测分析
- 自动康复建议

### 3. Web医生平台

**患者管理**
- 患者信息维护
- 检测历史记录
- 步态趋势分析

**报告查看**
- 详细步态参数
- 加速度波形图
- 相位时间分布
- 多维度雷达图

**数据分析**
- 群体统计分析
- 年龄分布对比
- 改善率追踪

## 技术栈

| 模块 | 技术 |
|------|------|
| Android | Kotlin, TensorFlow Lite, Retrofit |
| 后端 | Python, FastAPI, SQLAlchemy, TensorFlow |
| Web | Vue 3, Element Plus, ECharts |
| 通信 | BLE (MPU6050), HTTP/HTTPS |

## 部署说明

### Android端
```bash
cd android
./gradlew assembleDebug
```

### 云端服务
```bash
cd server
pip install -r requirements.txt
python -m api.main
```

### Web端
```bash
cd web
npm install
npm run dev
```

## 步态参数说明

- **支撑相(Stance)**: 脚与地面接触的时期，约占步态周期的60-65%
- **摆动相(Swing)**: 脚离开地面的时期，约占步态周期的35-40%
- **不对称指数**: 左右侧步态差异的量化指标，正常值<5
- **步频一致性**: 连续步间时间差异的标准差

## 注意事项

1. MPU6050需穿戴在脚踝或小腿部位
2. 传感器需牢固固定，避免运动时移位
3. 首次使用需进行个性化校准
4. 建议每次检测步行100步以上以获得稳定数据
