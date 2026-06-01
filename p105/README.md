# KVM虚拟机备份管理系统

一个基于Node.js和Vue.js的KVM虚拟机磁盘快照备份管理系统，支持完整备份和增量备份，提供Web界面进行备份管理和文件浏览。

## 功能特性

- 🖥️ **虚拟机管理** - 自动从libvirt同步虚拟机列表
- 💾 **完整备份** - 创建完整的qcow2磁盘镜像备份
- 🔄 **增量备份** - 仅备份变化的磁盘块，节省存储空间
- 🔗 **备份链展示** - 可视化展示备份链和恢复点
- 📂 **文件浏览** - 挂载备份镜像，直接浏览内部文件系统
- ⏪ **一键恢复** - 快速恢复到任意备份点
- 📊 **状态监控** - 实时显示备份任务进度和状态

## 系统架构

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Vue.js 前端   │────▶│  Node.js 后端   │────▶│   libvirt API   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────┐
                        │  SQLite DB  │
                        └─────────────┘
```

## 技术栈

### 后端
- Node.js + Express
- SQLite3 (数据存储)
- libvirt + virsh (虚拟机管理)
- qemu-img (磁盘镜像操作)
- guestmount (文件系统挂载)

### 前端
- Vue 3 + Vite
- Element Plus (UI组件库)
- Vue Router
- Axios

## 环境要求

- Linux 系统 (支持KVM)
- Node.js >= 16.x
- libvirt + QEMU/KVM
- guestmount (libguestfs-tools)
- qemu-img

### 安装依赖

```bash
# Ubuntu/Debian
sudo apt install libvirt-bin qemu-kvm libguestfs-tools

# CentOS/RHEL
sudo yum install libvirt qemu-kvm libguestfs-tools
```

## 安装部署

### 1. 克隆项目

```bash
git clone <repository-url>
cd p105
```

### 2. 安装后端依赖

```bash
cd backend
npm install
```

### 3. 安装前端依赖

```bash
cd ../frontend
npm install
```

### 4. 构建前端

```bash
cd frontend
npm run build
```

### 5. 启动后端服务

```bash
cd ../backend
npm start
```

服务将在 `http://localhost:3000` 启动

### 6. 开发模式

```bash
# 终端1: 启动后端
cd backend
npm run dev

# 终端2: 启动前端开发服务器
cd frontend
npm run dev
```

## API 接口

### 虚拟机管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/vms` | 获取虚拟机列表 |
| POST | `/api/vms/sync` | 从libvirt同步虚拟机 |
| GET | `/api/vms/:vmId/backups` | 获取虚拟机备份链 |

### 备份操作

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/vms/:vmId/backup/full` | 创建完整备份 |
| POST | `/api/vms/:vmId/backup/incremental` | 创建增量备份 |
| GET | `/api/backups/:backupId` | 获取备份详情 |
| DELETE | `/api/backups/:backupId` | 删除备份 |
| POST | `/api/backups/:backupId/restore` | 恢复备份 |

### 挂载浏览

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/backups/:backupId/mount` | 挂载备份镜像 |
| POST | `/api/backups/:backupId/unmount` | 卸载备份镜像 |
| GET | `/api/backups/:backupId/browse?path=/` | 浏览文件系统 |

## 增量备份原理

1. **创建快照**: 使用 `virsh snapshot-create-as` 创建磁盘快照
2. **比较镜像**: 使用 `qemu-img compare` 检测变化的磁盘块
3. **增量备份**: 仅读取并备份变化的块数据
4. **存储格式**: 自定义格式，头部存储偏移量，后跟数据块

## 项目结构

```
p105/
├── backend/
│   ├── src/
│   │   ├── server.js          # 服务入口
│   │   ├── routes.js          # API路由
│   │   ├── database.js        # 数据库操作
│   │   ├── libvirt.js         # libvirt API封装
│   │   └── backupManager.js   # 备份管理器
│   ├── data/                  # 数据库目录
│   ├── backups/               # 备份存储目录
│   ├── mounts/                # 挂载点目录
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── views/
│   │   │   ├── VMList.vue     # 虚拟机列表页
│   │   │   └── VMDetail.vue   # 虚拟机详情页
│   │   ├── App.vue            # 根组件
│   │   ├── main.js            # 入口文件
│   │   ├── router.js          # 路由配置
│   │   ├── api.js             # API封装
│   │   └── style.css          # 全局样式
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
└── README.md
```

## 使用说明

1. **同步虚拟机**: 点击首页的"同步虚拟机"按钮，从libvirt获取KVM虚拟机列表
2. **创建备份**: 进入虚拟机详情页，点击"完整备份"或"增量备份"
3. **查看备份链**: 在虚拟机详情页查看可视化的备份链
4. **浏览文件**: 选择一个备份，点击"挂载并浏览文件"
5. **恢复备份**: 选择要恢复的备份点，点击"恢复到此备份"

## 注意事项

1. 运行本系统需要root权限或libvirt访问权限
2. 增量备份依赖于上一次备份，请确保完整备份存在
3. 大虚拟机备份可能需要较长时间
4. 请确保有足够的磁盘空间存储备份

## 许可证

MIT License
