# HLS 资源估算工具

一个基于Web的高层次综合（HLS）资源估算工具，用于快速预估C代码在FPGA上实现后的资源占用情况。

## 功能特性

- 📝 **C代码编辑器**：内置Monaco编辑器，支持语法高亮和文件上传
- 📊 **资源估算**：估算LUT、DSP、BRAM等FPGA资源使用
- 📈 **可视化图表**：柱状图直观展示资源占用情况
- 💡 **优化建议**：智能分析代码，提供HLS优化方向
- 📚 **历史记录**：SQLite数据库存储所有估算历史

## 技术栈

### 后端
- Node.js + Express
- better-sqlite3（数据库）

### 前端
- React 18 + Vite
- Monaco Editor（代码编辑器）
- Chart.js + react-chartjs-2（图表）
- Tailwind CSS（样式）

## 快速开始

### 1. 安装后端依赖

```bash
cd backend
npm install
```

### 2. 启动后端服务

```bash
cd backend
npm start
```

后端服务将运行在 `http://localhost:3001`

### 3. 安装前端依赖

```bash
cd frontend
npm install
```

### 4. 启动前端开发服务器

```bash
cd frontend
npm run dev
```

前端服务将运行在 `http://localhost:3000`

## 使用说明

1. 在左侧编辑器中输入或上传C代码
2. 点击"开始估算"按钮
3. 查看右侧的资源估算结果柱状图
4. 切换到"优化建议"标签页查看代码优化方向
5. 所有估算结果会自动保存到历史记录中

## 项目结构

```
p112/
├── backend/                 # 后端服务
│   ├── src/
│   │   ├── routes/         # API路由
│   │   ├── services/       # 业务逻辑（HLS估算、优化建议）
│   │   ├── db/             # 数据库
│   │   └── server.js       # 服务入口
│   └── package.json
├── frontend/               # 前端应用
│   ├── src/
│   │   ├── components/     # React组件
│   │   ├── services/       # API服务
│   │   └── App.jsx         # 主应用
│   └── package.json
└── README.md
```

## API 接口

### POST /api/estimate
- 提交C代码进行资源估算
- 请求体：`{ "code": "...", "codeName": "..." }`

### GET /api/history
- 获取所有历史记录

### GET /api/history/:id
- 获取单条历史记录详情

### DELETE /api/history/:id
- 删除历史记录
