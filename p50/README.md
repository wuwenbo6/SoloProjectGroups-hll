# OpenSCAD 参数化 3D 建模 Web 应用

一个基于 Web 的参数化 3D 建模应用，使用 OpenSCAD 后端渲染，支持实时预览和导出 STL/3MF 格式。

## ✨ 功能特性

- 🎛️ **参数化编辑**：通过滑块和输入框调整模型参数
- 👁️ **实时预览**：基于 Three.js 的 3D 模型查看器
- 📤 **多格式导出**：支持 STL 和 3MF 格式导出
- 💾 **参数保存**：SQLite 数据库保存常用参数组合
- 🚀 **智能渲染缓存**：相同参数自动使用缓存
- ⏱️ **进度显示**：渲染时显示进度条
- ✋ **取消渲染**：随时取消当前渲染任务
- 🎨 **精美界面**：深色主题，现代化 UI 设计

## 🔧 性能优化 (v2.0)

### 后端优化
- **预览超时**: 30秒 → 120秒（支持复杂模型）
- **导出超时**: 30秒 → 600秒（大模型导出）
- **渲染缓存**: MD5 参数哈希，重复参数直接返回缓存
- **任务取消**: 支持取消正在进行的渲染任务
- **子进程管理**: 优雅关闭，防止僵尸进程

### 前端优化
- **滑块防抖**: 拖动时不触发，释放鼠标后才渲染
- **输入防抖**: 数字框失去焦点后才更新（800ms）
- **渲染队列**: 渲染中变更参数，完成后自动重新渲染
- **进度指示**: 实时显示渲染进度条
- **取消按钮**: 随时取消当前渲染
- **强制刷新**: 绕过缓存重新生成

## 技术栈

### 后端
- Node.js + Express
- OpenSCAD CLI (系统依赖)
- SQLite (better-sqlite3)
- CORS 支持

### 前端
- React 18
- Three.js + @react-three/fiber
- Axios
- STL Loader

## 系统要求

- **Node.js** >= 16.0
- **OpenSCAD** (必须安装并添加到系统 PATH)
  - macOS: `brew install openscad`
  - Ubuntu: `sudo apt install openscad`
  - Windows: 从官网下载安装

## 安装步骤

### 1. 安装 OpenSCAD

**macOS:**
```bash
brew install openscad
```

**Ubuntu/Debian:**
```bash
sudo apt update && sudo apt install openscad
```

### 2. 安装后端依赖

```bash
cd backend
npm install
```

### 3. 安装前端依赖

```bash
cd frontend
npm install
```

## 运行项目

### 方式一：分别启动（开发模式）

**启动后端服务 (端口 3001):**
```bash
cd backend
npm start
# 或开发模式：npm run dev
```

**启动前端开发服务器 (端口 3000):**
```bash
cd frontend
npm start
```

访问 http://localhost:3000 即可使用应用。

### 方式二：使用启动脚本

```bash
# macOS/Linux
chmod +x start.sh
./start.sh
```

## 项目结构

```
p50/
├── backend/
│   ├── server.js          # Express 服务器主文件 (含性能优化)
│   ├── package.json       # 后端依赖
│   ├── models/            # OpenSCAD 模型文件 (.scad)
│   │   ├── cube.scad
│   │   ├── cylinder.scad
│   │   └── bottle.scad
│   ├── temp/              # 临时文件（自动创建）
│   ├── cache/             # 渲染缓存（自动创建）
│   ├── exports/           # 导出文件目录（自动创建）
│   └── database.db        # SQLite 数据库（自动创建）
├── frontend/
│   ├── src/
│   │   ├── App.js         # 主应用组件 (含防抖逻辑)
│   │   ├── index.js       # 入口文件
│   │   ├── index.css      # 全局样式
│   │   └── components/    # React 组件
│   │       ├── Viewer.js          # 3D 查看器 (含进度条)
│   │       ├── ParameterEditor.js # 参数编辑器 (滑块优化)
│   │       ├── ModelSelector.js   # 模型选择器
│   │       ├── ParameterSets.js   # 参数组合管理
│   │       └── ExportPanel.js     # 导出面板
│   ├── public/
│   └── package.json       # 前端依赖
└── README.md
```

## API 接口

### 渲染预览
`POST /api/preview`
```json
{
  "modelName": "cube",
  "parameters": {
    "width": 30,
    "height": 30,
    "depth": 30
  }
}
```
- 超时：120秒
- 支持缓存：相同参数自动返回缓存结果

### 导出模型
`POST /api/render`
```json
{
  "modelName": "cube",
  "parameters": {...},
  "format": "stl"  // 或 "3mf"
}
```
- 超时：600秒

### 取消渲染
`POST /api/cancel/:jobId`
- 取消正在进行的渲染任务

### 参数组合 CRUD
- `GET /api/parameter-sets` - 获取所有参数组合
- `POST /api/parameter-sets` - 保存新参数组合
- `PUT /api/parameter-sets/:id` - 更新参数组合
- `DELETE /api/parameter-sets/:id` - 删除参数组合

### 模型管理
- `GET /api/models` - 获取可用模型列表
- `GET /api/models/:name` - 获取模型内容

## 添加自定义模型

1. 在 `backend/models/` 目录下创建 `.scad` 文件
2. 在 `frontend/src/App.js` 的 `modelConfigs` 中添加参数配置
3. 重启后端服务

示例模型配置：
```javascript
my_model: {
  parameters: [
    { name: 'param1', label: '参数1', type: 'slider', min: 1, max: 100, step: 1, default: 50 }
  ]
}
```

## 使用技巧

### 提高渲染速度
1. **调整分段数**: 预览时降低 `segments`（如 16），导出时再调高
2. **利用缓存**: 相同参数会自动使用缓存，无需等待
3. **强制刷新**: 如果模型异常，点击"强制刷新"绕过缓存

### 大模型处理
1. **耐心等待**: 复杂模型可能需要数分钟，进度条会显示进度
2. **随时取消**: 渲染中可点击"取消"按钮
3. **分步调整**: 先调好大参数，再微调细节

## 性能对比

| 优化项 | 优化前 | 优化后 | 提升 |
|--------|--------|--------|------|
| 滑块响应 | 每滑动就渲染 | 释放后才渲染 | 约 80% 减少请求 |
| 预览超时 | 30秒 | 120秒 | 4倍 |
| 导出超时 | 30秒 | 600秒 | 20倍 |
| 重复参数渲染 | 每次都重新生成 | 使用缓存 | 即时响应 |
| 渲染中修改 | 请求丢失 | 自动排队 | 100% 不丢失 |

## 故障排除

### OpenSCAD 命令找不到
确保 OpenSCAD 已安装并在系统 PATH 中：
```bash
which openscad  # 应该显示路径
openscad --version  # 应该显示版本
```

### 端口被占用
修改 `backend/server.js` 中的 `PORT` 变量，或关闭占用端口的程序。

### 前端无法连接后端
确保后端服务已启动，检查 `frontend/package.json` 中的 `proxy` 设置是否正确。

### 渲染速度慢
- 降低模型的分段数（segments 参数）
- 检查系统资源使用情况
- 复杂模型请耐心等待或使用更快的计算机

### 缓存问题
- 点击"强制刷新"按钮绕过缓存
- 删除 `backend/cache/` 目录下的文件

## 许可证

MIT