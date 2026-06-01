## 1. 架构设计

```mermaid
flowchart TD
    "Frontend (React + TypeScript)" --> "状态管理层 (Zustand)"
    "状态管理层" --> "总线模拟器引擎"
    "总线模拟器引擎" --> "节点模型"
    "总线模拟器引擎" --> "仲裁算法"
    "状态管理层" --> "UI组件层"
    "UI组件层" --> "节点控制面板"
    "UI组件层" --> "总线示波器"
    "UI组件层" --> "状态日志"
    "UI组件层" --> "仲裁结果展示"
```

## 2. 技术说明
- 前端：React@18 + TypeScript + Tailwind CSS + Vite
- 状态管理：Zustand
- 图表绘制：Canvas API（自研波形绘制）
- 后端：无（纯前端模拟）
- 初始化工具：vite-init

## 3. 路由定义
| 路由 | 用途 |
|-------|------|
| / | 模拟器主页 |

## 4. 数据模型

### 4.1 节点模型
```typescript
interface BusNode {
  id: string;
  address: number;       // 0-255, 地址越小优先级越高
  name: string;
  data: string;          // 十六进制数据字符串
  status: 'idle' | 'sending' | 'collision' | 'won' | 'lost';
  color: string;         // 波形显示颜色
}
```

### 4.2 总线状态
```typescript
interface BusState {
  time: number;                    // 仿真时间 (ms)
  busLevel: 0 | 1;                 // 当前总线电平 0=低/显性 1=高/隐性
  activeSenders: string[];         // 当前发送节点ID列表
  collisionDetected: boolean;      // 冲突检测标志
  winnerAddress: number | null;    // 获胜节点地址
  waveform: WaveformSample[];      // 波形采样数据
}

interface WaveformSample {
  time: number;
  nodeId: string;
  level: 0 | 1;
  type: 'tx' | 'rx' | 'bus';
}
```

### 4.3 仲裁日志
```typescript
interface LogEntry {
  id: string;
  timestamp: number;
  type: 'info' | 'send' | 'collision' | 'arbitration' | 'complete' | 'error';
  message: string;
  nodeId?: string;
}
```
