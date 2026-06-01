# HLS资源估算Web应用 - 技术架构文档

## 1. 系统架构

### 1.1 整体架构图

```
┌─────────────────────────────────────────────────────────┐
│                        前端 (React)                      │
│  ┌────────────┐  ┌───────────┐  ┌──────────────────┐    │
│  │ 代码编辑器  │  │ 资源图表  │  │ 历史记录/优化建议 │    │
│  └──────┬─────┘  └─────┬─────┘  └────────┬─────────┘    │
└─────────┼───────────────┼─────────────────┼──────────────┘
          │               │                 │
          └───────────────┴─────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                       后端 (Express)                     │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────┐    │
│  │ API路由   │  │ HLS估算引擎   │  │  优化建议生成器   │    │
│  └─────┬────┘  └──────┬───────┘  └────────┬─────────┘    │
└────────┼───────────────┼───────────────────┼──────────────┘
         │               │                   │
         └───────────────┴───────────────────┘
                          │
                          ▼
              ┌─────────────────────┐
              │   SQLite 数据库      │
              │  - estimations表    │
              └─────────────────────┘
```

## 2. 目录结构

```
p112/
├── frontend/                 # React 前端
│   ├── src/
│   │   ├── components/       # 组件
│   │   │   ├── CodeEditor.jsx
│   │   │   ├── ResourceChart.jsx
│   │   │   ├── OptimizationTips.jsx
│   │   │   └── HistoryList.jsx
│   │   ├── services/         # API 服务
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js
├── backend/                  # Node.js 后端
│   ├── src/
│   │   ├── routes/           # API 路由
│   │   │   ├── estimate.js
│   │   │   └── history.js
│   │   ├── services/         # 业务逻辑
│   │   │   ├── hlsEstimator.js
│   │   │   └── optimizer.js
│   │   ├── db/               # 数据库
│   │   │   └── sqlite.js
│   │   └── server.js
│   └── package.json
└── .trae/documents/          # 文档
```

## 3. 数据库设计

### 3.1 estimations 表

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | INTEGER PRIMARY KEY | 主键 |
| code_name | VARCHAR(255) | 代码名称 |
| code_content | TEXT | C代码内容 |
| lut | INTEGER | LUT资源数量 |
| dsp | INTEGER | DSP资源数量 |
| bram | INTEGER | BRAM资源数量 |
| optimization_tips | TEXT | 优化建议（JSON） |
| created_at | DATETIME | 创建时间 |

## 4. API 设计

### 4.1 资源估算 API

**POST /api/estimate**

请求体：
```json
{
  "code": "C代码内容",
  "codeName": "示例代码"
}
```

响应：
```json
{
  "success": true,
  "data": {
    "id": 1,
    "lut": 1250,
    "dsp": 8,
    "bram": 4,
    "optimizationTips": [
      {
        "type": "loop",
        "severity": "high",
        "message": "检测到嵌套循环，建议使用流水线优化"
      }
    ]
  }
}
```

### 4.2 历史记录 API

**GET /api/history**
- 获取所有历史记录

**GET /api/history/:id**
- 获取单条历史记录详情

**DELETE /api/history/:id**
- 删除单条历史记录

## 5. HLS 估算引擎设计

### 5.1 估算算法（模拟）

基于代码特征的启发式估算：

1. **LUT 估算**：
   - 算术运算：每个运算约 5-20 LUT
   - 条件分支：每个分支约 10-30 LUT
   - 循环：循环次数 × 循环体复杂度

2. **DSP 估算**：
   - 乘法运算：每个乘法使用 1 个 DSP
   - 复杂算术（如除法）：2-4 个 DSP

3. **BRAM 估算**：
   - 大数组（> 1024 元素）：每个数组使用 1-2 个 BRAM
   - 基于数据类型计算存储需求

### 5.2 优化建议生成

1. **循环优化检测**：
   - 检测 `for` / `while` 循环
   - 建议添加 HLS PIPELINE 或 UNROLL 指令

2. **数组优化检测**：
   - 检测大数组访问
   - 建议 ARRAY_PARTITION 优化

3. **数据类型优化**：
   - 检测 `int` / `float` 使用
   - 建议使用更精确的类型（如 `ap_fixed`）

## 6. 前端组件设计

### 6.1 CodeEditor 组件
- 基于 Monaco Editor
- 支持 C 语言语法高亮
- 支持文件上传

### 6.2 ResourceChart 组件
- 基于 Chart.js
- 柱状图展示 LUT/DSP/BRAM
- 支持显示百分比

### 6.3 OptimizationTips 组件
- 分类显示优化建议
- 严重程度标识（高/中/低）
- 可点击查看详细说明

### 6.4 HistoryList 组件
- 时间轴展示历史记录
- 支持搜索和筛选
- 点击查看详情
