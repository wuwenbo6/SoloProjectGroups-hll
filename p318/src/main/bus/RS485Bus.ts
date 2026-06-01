import type { BusConfig, BusState, LogEntry, TimelineEvent, BusUtilizationStats, BusUtilizationSample, ModbusFunctionCode, NodeState } from '../../shared/types';
import { DEFAULT_BUS_CONFIG } from '../../shared/types';
import { ArbitrationEngine } from './Arbitration';
import { RS485Node } from './RS485Node';
import { ModbusMasterNode } from './ModbusMasterNode';
import { ModbusSlaveNode } from './ModbusSlaveNode';
import type { NodeConfig } from '../../shared/types';

type StateUpdateCallback = (state: {
  nodes: Record<string, NodeState>;
  bus: BusState;
  utilization: BusUtilizationStats;
}) => void;

type LogCallback = (log: LogEntry) => void;
type TimelineCallback = (event: TimelineEvent) => void;

type AnyNode = RS485Node | ModbusMasterNode | ModbusSlaveNode;

export class RS485Bus {
  private csmaNodes: Map<string, RS485Node> = new Map();
  private modbusMasters: Map<string, ModbusMasterNode> = new Map();
  private modbusSlaves: Map<string, ModbusSlaveNode> = new Map();
  private arbitrationEngine: ArbitrationEngine;
  private busConfig: BusConfig;
  private busState: BusState;
  private currentSenders: Set<string> = new Set();
  private conflictFlag = false;

  private onStateUpdate: StateUpdateCallback | null = null;
  private onLog: LogCallback | null = null;
  private onTimelineEvent: TimelineCallback | null = null;

  private stateUpdateTimer: NodeJS.Timeout | null = null;
  private utilizationTimer: NodeJS.Timeout | null = null;
  private startTime: number | null = null;

  private busyTimeAccumulator = 0;
  private idleTimeAccumulator = 0;
  private lastUtilizationCheck = 0;
  private utilizationSamples: BusUtilizationSample[] = [];
  private perNodeSendTime: Record<string, { sendTime: number; sendCount: number }> = {};
  private lastBusyState = false;

  constructor(config?: Partial<BusConfig>) {
    this.busConfig = { ...DEFAULT_BUS_CONFIG, ...config };
    this.arbitrationEngine = new ArbitrationEngine(this.busConfig);
    this.busState = {
      isBusy: false,
      currentSender: null,
      conflictDetected: false,
      isRunning: false,
      mode: this.busConfig.mode,
    };
  }

  setOnStateUpdate(callback: StateUpdateCallback): void {
    this.onStateUpdate = callback;
  }

  setOnLog(callback: LogCallback): void {
    this.onLog = callback;
  }

  setOnTimelineEvent(callback: TimelineCallback): void {
    this.onTimelineEvent = callback;
  }

  addNode(config: NodeConfig): void {
    const allNodes = this.getAllNodeIds();
    if (allNodes.has(config.id)) {
      this.updateNode(config.id, config);
      return;
    }

    if (this.busConfig.mode === 'modbus-rtu') {
      if (config.role === 'master') {
        const node = new ModbusMasterNode(config, this, this.arbitrationEngine);
        this.modbusMasters.set(config.id, node);
        this.log('info', config.id, `已添加Modbus主站: ${config.name}`);
      } else {
        const node = new ModbusSlaveNode(config, this, this.arbitrationEngine);
        this.modbusSlaves.set(config.id, node);
        this.log('info', config.id, `已添加Modbus从站: ${config.name} (Slave ID: ${config.slaveId})`);
      }
    } else {
      const node = new RS485Node(config, this, this.arbitrationEngine);
      this.csmaNodes.set(config.id, node);
      this.log('info', config.id, `已添加节点: ${config.name}`);
    }

    this.pushStateUpdate();
  }

  removeNode(nodeId: string): void {
    if (this.csmaNodes.has(nodeId)) {
      this.csmaNodes.get(nodeId)!.stop();
      this.csmaNodes.delete(nodeId);
    } else if (this.modbusMasters.has(nodeId)) {
      this.modbusMasters.get(nodeId)!.stop();
      this.modbusMasters.delete(nodeId);
    } else if (this.modbusSlaves.has(nodeId)) {
      this.modbusSlaves.get(nodeId)!.stop();
      this.modbusSlaves.delete(nodeId);
    }
    delete this.perNodeSendTime[nodeId];
    this.log('info', nodeId, '已移除节点');
    this.pushStateUpdate();
  }

  updateNode(nodeId: string, config: Partial<NodeConfig>): void {
    const node = this.findNode(nodeId);
    if (node) {
      node.updateConfig(config);
      this.log('info', nodeId, '已更新节点配置');
      this.pushStateUpdate();
    }
  }

  getNode(nodeId: string): AnyNode | undefined {
    return this.findNode(nodeId);
  }

  getAllNodes(): AnyNode[] {
    return [
      ...Array.from(this.csmaNodes.values()),
      ...Array.from(this.modbusMasters.values()),
      ...Array.from(this.modbusSlaves.values()),
    ];
  }

  getSlaveNodes(): { config: NodeConfig }[] {
    return Array.from(this.modbusSlaves.values()).map((s) => ({
      config: s.getConfig(),
    }));
  }

  getSlaveBySlaveId(slaveId: number): ModbusSlaveNode | undefined {
    return Array.from(this.modbusSlaves.values()).find((s) => s.getSlaveId() === slaveId);
  }

  notifySlaveResponse(slaveId: number, functionCode: ModbusFunctionCode): void {
    const slave = this.getSlaveBySlaveId(slaveId);
    if (slave) {
      slave.onMasterRequest(functionCode);
    }
  }

  updateBusConfig(config: Partial<BusConfig>): void {
    const oldMode = this.busConfig.mode;
    this.busConfig = { ...this.busConfig, ...config };
    this.busState.mode = this.busConfig.mode;
    this.arbitrationEngine.updateConfig(this.busConfig);

    if (oldMode !== this.busConfig.mode) {
      this.switchMode(this.busConfig.mode);
    }

    this.log('info', undefined, `已更新总线配置: 模式=${this.busConfig.mode}`);
    this.pushStateUpdate();
  }

  getBusConfig(): BusConfig {
    return { ...this.busConfig };
  }

  getBusState(): BusState {
    return { ...this.busState };
  }

  start(): void {
    if (this.busState.isRunning) return;

    this.busState.isRunning = true;
    this.busState.mode = this.busConfig.mode;
    this.startTime = Date.now();
    this.lastUtilizationCheck = Date.now();
    this.busyTimeAccumulator = 0;
    this.idleTimeAccumulator = 0;
    this.lastBusyState = false;
    this.log('info', undefined, `总线模拟已启动 (模式: ${this.busConfig.mode === 'csma' ? 'CSMA/CD' : 'Modbus RTU'})`);

    this.csmaNodes.forEach((node) => node.start());
    this.modbusMasters.forEach((node) => node.start());
    this.modbusSlaves.forEach((node) => node.start());

    this.startStateUpdateLoop();
    this.startUtilizationTracking();
    this.pushStateUpdate();
  }

  pause(): void {
    if (!this.busState.isRunning) return;

    this.busState.isRunning = false;
    this.log('info', undefined, '总线模拟已暂停');

    this.csmaNodes.forEach((node) => node.stop());
    this.modbusMasters.forEach((node) => node.stop());
    this.modbusSlaves.forEach((node) => node.stop());

    this.stopStateUpdateLoop();
    this.stopUtilizationTracking();
    this.pushStateUpdate();
  }

  reset(): void {
    this.pause();

    this.currentSenders.clear();
    this.conflictFlag = false;
    this.busState = {
      isBusy: false,
      currentSender: null,
      conflictDetected: false,
      isRunning: false,
      mode: this.busConfig.mode,
    };
    this.startTime = null;
    this.busyTimeAccumulator = 0;
    this.idleTimeAccumulator = 0;
    this.utilizationSamples = [];
    this.perNodeSendTime = {};

    this.csmaNodes.forEach((node) => node.reset());
    this.modbusMasters.forEach((node) => node.reset());
    this.modbusSlaves.forEach((node) => node.reset());

    this.log('info', undefined, '总线模拟已重置');
    this.pushStateUpdate();
  }

  manualSend(nodeId: string): void {
    const csmaNode = this.csmaNodes.get(nodeId);
    if (csmaNode) {
      csmaNode.manualSend();
      return;
    }
    const masterNode = this.modbusMasters.get(nodeId);
    if (masterNode) {
      masterNode.manualSend();
    }
  }

  isBusy(): boolean {
    return this.currentSenders.size > 0;
  }

  requestSend(nodeId: string): boolean {
    this.trackUtilization();

    if (this.currentSenders.size > 0 && !this.currentSenders.has(nodeId)) {
      this.conflictFlag = true;
      this.currentSenders.add(nodeId);
      return false;
    }

    this.currentSenders.add(nodeId);
    this.busState.isBusy = true;
    this.busState.currentSender = nodeId;
    this.busState.conflictDetected = false;

    if (this.currentSenders.size > 1) {
      this.conflictFlag = true;
      return false;
    }

    return true;
  }

  checkCollision(nodeId: string): boolean {
    if (this.conflictFlag || this.currentSenders.size > 1) {
      return true;
    }
    return false;
  }

  notifyConflict(): void {
    this.busState.conflictDetected = true;
  }

  releaseBus(nodeId: string): void {
    this.trackUtilization();

    this.currentSenders.delete(nodeId);

    if (this.currentSenders.size === 0) {
      this.busState.isBusy = false;
      this.busState.currentSender = null;
      this.busState.conflictDetected = false;
      this.conflictFlag = false;
    }
  }

  getUtilizationStats(): BusUtilizationStats {
    const runtime = this.startTime ? Date.now() - this.startTime : 0;
    const samples = this.utilizationSamples.slice(-120);
    const currentUtilization = samples.length > 0 ? samples[samples.length - 1].utilization : 0;
    const avgUtilization = samples.length > 0
      ? samples.reduce((s, v) => s + v.utilization, 0) / samples.length
      : 0;
    const peakUtilization = samples.length > 0
      ? Math.max(...samples.map((v) => v.utilization))
      : 0;

    const perNodeStats: BusUtilizationStats['perNodeStats'] = {};
    for (const [nodeId, data] of Object.entries(this.perNodeSendTime)) {
      perNodeStats[nodeId] = {
        sendTime: data.sendTime,
        sendCount: data.sendCount,
        utilization: runtime > 0 ? (data.sendTime / runtime) * 100 : 0,
      };
    }

    return {
      currentUtilization,
      avgUtilization,
      peakUtilization,
      totalBusyTime: this.busyTimeAccumulator,
      totalIdleTime: this.idleTimeAccumulator,
      totalRuntime: runtime,
      samples,
      perNodeStats,
    };
  }

  recordNodeSendTime(nodeId: string, sendTime: number): void {
    if (!this.perNodeSendTime[nodeId]) {
      this.perNodeSendTime[nodeId] = { sendTime: 0, sendCount: 0 };
    }
    this.perNodeSendTime[nodeId].sendTime += sendTime;
    this.perNodeSendTime[nodeId].sendCount++;
  }

  log(level: LogEntry['level'], nodeId: string | undefined, message: string): void {
    const entry: LogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      level,
      nodeId,
      message,
    };

    if (this.onLog) {
      this.onLog(entry);
    }
  }

  addTimelineEvent(event: Omit<TimelineEvent, 'id'> & { id?: string }): void {
    const timelineEvent: TimelineEvent = {
      id: event.id || `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      nodeId: event.nodeId,
      type: event.type,
      timestamp: event.timestamp,
      duration: event.duration,
      success: event.success,
    };

    if (this.onTimelineEvent) {
      this.onTimelineEvent(timelineEvent);
    }
  }

  getStartTime(): number | null {
    return this.startTime;
  }

  destroy(): void {
    this.stopStateUpdateLoop();
    this.stopUtilizationTracking();
    this.csmaNodes.forEach((node) => node.stop());
    this.modbusMasters.forEach((node) => node.stop());
    this.modbusSlaves.forEach((node) => node.stop());
    this.csmaNodes.clear();
    this.modbusMasters.clear();
    this.modbusSlaves.clear();
  }

  private findNode(nodeId: string): AnyNode | undefined {
    return this.csmaNodes.get(nodeId)
      || this.modbusMasters.get(nodeId)
      || this.modbusSlaves.get(nodeId);
  }

  private getAllNodeIds(): Set<string> {
    return new Set([
      ...this.csmaNodes.keys(),
      ...this.modbusMasters.keys(),
      ...this.modbusSlaves.keys(),
    ]);
  }

  private switchMode(mode: 'csma' | 'modbus-rtu'): void {
    const wasRunning = this.busState.isRunning;
    if (wasRunning) this.pause();

    this.csmaNodes.forEach((n) => n.stop());
    this.modbusMasters.forEach((n) => n.stop());
    this.modbusSlaves.forEach((n) => n.stop());

    this.currentSenders.clear();
    this.conflictFlag = false;
    this.busyTimeAccumulator = 0;
    this.idleTimeAccumulator = 0;
    this.utilizationSamples = [];
    this.perNodeSendTime = {};

    if (mode === 'modbus-rtu') {
      const allCSMA = Array.from(this.csmaNodes.entries());
      this.csmaNodes.clear();
      for (const [id, node] of allCSMA) {
        const config = node.getConfig();
        config.role = config.role || 'slave';
        if (!config.slaveId) config.slaveId = parseInt(id.slice(-1), 16) || 1;
        if (!config.modbusPollInterval) config.modbusPollInterval = 500;

        if (config.role === 'master') {
          this.modbusMasters.set(id, new ModbusMasterNode(config, this, this.arbitrationEngine));
        } else {
          this.modbusSlaves.set(id, new ModbusSlaveNode(config, this, this.arbitrationEngine));
        }
      }
      this.log('info', undefined, '已切换到 Modbus RTU 主从模式');
    } else {
      const allModbus = [
        ...Array.from(this.modbusMasters.entries()),
        ...Array.from(this.modbusSlaves.entries()),
      ];
      this.modbusMasters.clear();
      this.modbusSlaves.clear();
      for (const [id, node] of allModbus) {
        const config = node.getConfig();
        this.csmaNodes.set(id, new RS485Node(config, this, this.arbitrationEngine));
      }
      this.log('info', undefined, '已切换到 CSMA/CD 多主模式');
    }

    if (wasRunning) this.start();
  }

  private trackUtilization(): void {
    const now = Date.now();
    if (this.lastUtilizationCheck === 0) {
      this.lastUtilizationCheck = now;
      return;
    }

    const elapsed = now - this.lastUtilizationCheck;
    if (elapsed <= 0) return;

    if (this.busState.isBusy) {
      this.busyTimeAccumulator += elapsed;
    } else {
      this.idleTimeAccumulator += elapsed;
    }
    this.lastBusyState = this.busState.isBusy;
    this.lastUtilizationCheck = now;
  }

  private startUtilizationTracking(): void {
    if (this.utilizationTimer) return;
    this.lastUtilizationCheck = Date.now();

    this.utilizationTimer = setInterval(() => {
      this.trackUtilization();

      const total = this.busyTimeAccumulator + this.idleTimeAccumulator;
      const utilization = total > 0 ? (this.busyTimeAccumulator / total) * 100 : 0;

      this.utilizationSamples.push({
        timestamp: Date.now(),
        utilization,
        busyTime: this.busyTimeAccumulator,
        idleTime: this.idleTimeAccumulator,
      });

      if (this.utilizationSamples.length > 120) {
        this.utilizationSamples = this.utilizationSamples.slice(-120);
      }
    }, 1000);
  }

  private stopUtilizationTracking(): void {
    if (this.utilizationTimer) {
      clearInterval(this.utilizationTimer);
      this.utilizationTimer = null;
    }
  }

  private startStateUpdateLoop(): void {
    if (this.stateUpdateTimer) return;

    this.stateUpdateTimer = setInterval(() => {
      this.pushStateUpdate();
    }, 50);
  }

  private stopStateUpdateLoop(): void {
    if (this.stateUpdateTimer) {
      clearInterval(this.stateUpdateTimer);
      this.stateUpdateTimer = null;
    }
  }

  private pushStateUpdate(): void {
    if (!this.onStateUpdate) return;

    const nodes: Record<string, ReturnType<AnyNode['getState']>> = {};
    this.csmaNodes.forEach((node, id) => {
      nodes[id] = node.getState();
    });
    this.modbusMasters.forEach((node, id) => {
      nodes[id] = node.getState();
    });
    this.modbusSlaves.forEach((node, id) => {
      nodes[id] = node.getState();
    });

    const utilization = this.getUtilizationStats();

    this.onStateUpdate({
      nodes,
      bus: { ...this.busState },
      utilization,
    });
  }
}
