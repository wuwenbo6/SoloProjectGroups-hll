# eBPF XDP Web Editor

一个基于Web的eBPF XDP程序编辑、编译、验证和模拟测试平台。

## 功能特性

- 代码编辑器：基于Monaco Editor的C语言代码编辑，支持语法高亮
- 编译与验证：模拟clang编译和内核verifier验证过程
- 虚拟网卡：支持创建虚拟网卡并加载XDP程序
- 流量模拟：生成模拟网络流量，测试XDP程序行为
- 数据可视化：展示丢包统计、动作分布图表和数据包详情

## 项目结构

```
p377/
├── server/              # 后端服务
│   ├── src/
│   │   ├── index.js          # Express服务器入口
│   │   └── ebpf-simulator.js # eBPF模拟器核心
│   └── package.json
├── client/              # 前端应用
│   ├── src/
│   │   ├── App.jsx           # 主应用组件
│   │   ├── main.jsx          # React入口
│   │   └── styles.css        # 样式文件
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
└── package.json         # 根目录配置
```

## 快速开始

### 安装依赖

```bash
# 安装根目录依赖
npm install

# 安装后端依赖
cd server && npm install && cd ..

# 安装前端依赖
cd client && npm install && cd ..
```

### 开发模式运行

```bash
# 同时启动前后端
npm run dev

# 或者分别启动
# 后端 (端口 3001)
cd server && npm run dev

# 前端 (端口 3000)
cd client && npm run dev
```

### 生产构建

```bash
# 构建前端
npm run build

# 启动后端服务
npm start
```

## API接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/health | 健康检查 |
| POST | /api/verify | 验证eBPF程序 |
| POST | /api/compile | 编译eBPF程序 |
| POST | /api/attach | 挂载程序到网卡 |
| POST | /api/simulate | 运行流量模拟 |
| GET | /api/examples | 获取示例程序列表 |
| GET | /api/examples/:id | 获取指定示例程序 |
| GET | /api/interfaces | 获取虚拟网卡列表 |
| GET | /api/interfaces/:name/stats | 获取网卡统计 |
| POST | /api/interfaces/:name/reset | 重置网卡统计 |

## 内置示例程序

1. **XDP Drop All** - 丢弃所有数据包
2. **XDP Pass All** - 放行所有数据包
3. **XDP Drop by Port** - 根据端口过滤（如阻止SSH）
4. **XDP Drop by IP** - 根据源IP过滤
5. **XDP Statistics** - 使用eBPF map统计数据包

## 技术栈

- **前端**: React 18 + Vite + Monaco Editor
- **后端**: Node.js + Express
- **模拟**: 纯JavaScript实现的eBPF验证器和虚拟网卡模拟器

## 说明

> ⚠️ 这是一个模拟环境，用于学习和测试eBPF XDP程序的基本逻辑。
> 
> 由于macOS不原生支持eBPF，本项目使用软件模拟的方式实现：
> - 代码验证：静态分析eBPF C代码结构
> - 流量模拟：基于代码特征智能推断XDP动作概率
> 
> 在真实Linux环境中，请使用真实的clang+llvm编译链和内核加载机制。
