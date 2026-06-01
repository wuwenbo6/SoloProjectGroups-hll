# Modbus 模糊测试平台

用于自动化测试PLC设备Modbus协议健壮性的Web应用平台。

## 功能特性

- 🎯 **多种变异策略**: 功能码异常、地址越界、数据畸形、长度异常等8种测试策略
- 📡 **实时监控**: WebSocket实时推送报文数据和状态更新
- 📊 **可视化界面**: 仪表板统计、趋势图表、崩溃报告
- 💾 **数据持久化**: SQLite存储测试任务、报文记录和崩溃信息
- ⚡ **健康检测**: TCP连接和Modbus协议双重健康检测

## 技术栈

### 后端
- **框架**: FastAPI + Uvicorn
- **协议**: pymodbus + 自定义报文构造
- **实时通信**: python-socketio
- **数据库**: SQLite + SQLAlchemy ORM

### 前端
- **框架**: React 18 + TypeScript
- **构建工具**: Vite
- **样式**: TailwindCSS 3
- **图表**: Recharts
- **图标**: Lucide React

## 项目结构

```
.
├── backend/                    # 后端Python项目
│   ├── app/
│   │   ├── api/               # API路由
│   │   │   ├── targets.py
│   │   │   ├── strategies.py
│   │   │   ├── tasks.py
│   │   │   ├── cases.py
│   │   │   └── stats.py
│   │   ├── core/              # 核心模块
│   │   │   ├── config.py
│   │   │   ├── database.py
│   │   │   └── websocket.py
│   │   ├── models/            # 数据模型
│   │   ├── schemas/           # Pydantic模式
│   │   └── services/          # 业务服务
│   │       ├── mutator.py     # 报文变异模块
│   │       ├── monitor.py     # 健康监控模块
│   │       └── fuzzer.py      # 模糊测试引擎
│   ├── data/                  # SQLite数据库目录
│   ├── main.py
│   └── requirements.txt
├── frontend/                   # 前端React项目
│   ├── src/
│   │   ├── components/        # 组件
│   │   ├── pages/             # 页面
│   │   ├── services/          # API和WebSocket服务
│   │   └── types/             # TypeScript类型定义
│   └── package.json
└── start.sh                    # 一键启动脚本
```

## 快速开始

### 一键启动

```bash
./start.sh
```

### 手动启动

#### 后端服务

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py
```

后端服务运行在 http://localhost:8000
API文档: http://localhost:8000/docs

#### 前端服务

```bash
cd frontend
npm install --legacy-peer-deps
npm run dev
```

前端服务运行在 http://localhost:3000

## 变异策略

| 策略ID | 名称 | 描述 |
|--------|------|------|
| invalid_function_code | 无效功能码 | 发送未定义的功能码测试设备容错能力 |
| address_out_of_range | 地址越界 | 访问超出设备范围的寄存器/线圈地址 |
| invalid_data_length | 数据长度异常 | 发送与功能码不匹配的数据长度 |
| malformed_data | 数据畸形 | 发送随机或边界值数据 |
| invalid_slave_id | 从站ID异常 | 使用无效或广播从站ID |
| packet_truncation | 报文截断 | 发送不完整的Modbus报文 |
| oversized_packet | 超大报文 | 发送超过最大长度限制的报文 |
| fuzzing_random | 完全随机 | 完全随机生成报文内容 |

## 使用流程

1. **配置目标设备**: 在「测试配置」页面添加PLC设备信息（IP、端口、从站ID）
2. **选择变异策略**: 勾选需要测试的变异策略
3. **创建测试任务**: 输入任务名称并创建测试任务
4. **执行测试**: 在「测试执行」页面启动测试，实时监控报文发送和设备状态
5. **分析结果**: 在「结果分析」页面查看报文记录和崩溃报告

## API接口

### 目标设备
- `GET /api/targets` - 获取目标设备列表
- `POST /api/targets` - 创建目标设备
- `POST /api/targets/{id}/test` - 测试连接

### 测试任务
- `GET /api/tasks` - 获取任务列表
- `POST /api/tasks` - 创建任务
- `POST /api/tasks/{id}/start` - 启动测试
- `POST /api/tasks/{id}/stop` - 停止测试

### WebSocket事件
- `test:packet` - 实时报文推送
- `test:status` - 测试状态更新
- `test:crash` - 崩溃检测通知
- `test:progress` - 测试进度更新

## 注意事项

⚠️ **安全警告**: 本工具用于授权的安全测试。未经授权测试他人设备可能违反法律法规。

## License

MIT License
