import type { NodeConfig, NodeState, NodeStatus } from '../../shared/types';
import type { ArbitrationEngine } from './Arbitration';
import type { RS485Bus } from './RS485Bus';

export class RS485Node {
  private config: NodeConfig;
  private state: NodeState;
  private bus: RS485Bus;
  private arbitrationEngine: ArbitrationEngine;
  private sendTimer: NodeJS.Timeout | null = null;
  private operationTimer: NodeJS.Timeout | null = null;
  private collisionCheckTimer: NodeJS.Timeout | null = null;
  private sendEndTimer: NodeJS.Timeout | null = null;
  private isManualSendMode = false;
  private pendingManualSend = false;

  constructor(config: NodeConfig, bus: RS485Bus, arbitrationEngine: ArbitrationEngine) {
    this.config = config;
    this.bus = bus;
    this.arbitrationEngine = arbitrationEngine;
    this.state = this.createInitialState(config.id);
  }

  private createInitialState(id: string): NodeState {
    return {
      id,
      status: 'idle',
      sendCount: 0,
      conflictCount: 0,
      retryCount: 0,
      lastSendDelay: 0,
      avgSendDelay: 0,
      maxSendDelay: 0,
      totalDelays: 0,
      currentSendStart: null,
    };
  }

  getConfig(): NodeConfig {
    return { ...this.config };
  }

  getState(): NodeState {
    return { ...this.state };
  }

  updateConfig(config: Partial<NodeConfig>): void {
    this.config = { ...this.config, ...config };
  }

  start(): void {
    if (!this.config.enabled || this.sendTimer) return;
    this.state.status = 'idle';
    this.scheduleNextSend();
  }

  stop(): void {
    this.clearTimers();
    this.state.status = 'idle';
    this.state.currentSendStart = null;
    this.pendingManualSend = false;
  }

  reset(): void {
    this.stop();
    this.state = this.createInitialState(this.config.id);
  }

  manualSend(): void {
    if (!this.config.enabled || this.state.status !== 'idle') return;
    this.pendingManualSend = true;
    this.isManualSendMode = true;
    this.attemptSend();
  }

  private scheduleNextSend(): void {
    if (this.isManualSendMode) return;
    
    const interval = this.config.sendInterval + (Math.random() - 0.5) * 100;
    this.sendTimer = setTimeout(() => {
      this.attemptSend();
    }, interval);
  }

  private clearTimers(): void {
    if (this.sendTimer) {
      clearTimeout(this.sendTimer);
      this.sendTimer = null;
    }
    if (this.operationTimer) {
      clearTimeout(this.operationTimer);
      this.operationTimer = null;
    }
    if (this.collisionCheckTimer) {
      clearInterval(this.collisionCheckTimer);
      this.collisionCheckTimer = null;
    }
    if (this.sendEndTimer) {
      clearTimeout(this.sendEndTimer);
      this.sendEndTimer = null;
    }
  }

  private attemptSend(): void {
    if (!this.config.enabled) return;
    
    this.state.status = 'listening';
    this.state.currentSendStart = Date.now();
    this.bus.addTimelineEvent({
      id: `${this.config.id}-listen-${Date.now()}`,
      nodeId: this.config.id,
      type: 'listen_start',
      timestamp: Date.now(),
    });
    this.bus.log('info', this.config.id, `开始监听总线，等待 ${this.arbitrationEngine.getArbitrateWaitTime()}ms`);

    const listenStartTime = Date.now();
    this.operationTimer = setTimeout(() => {
      if (this.bus.isBusy()) {
        this.handleBusBusy(listenStartTime);
      } else {
        this.startSending();
      }
    }, this.arbitrationEngine.getArbitrateWaitTime());
  }

  private handleBusBusy(listenStartTime: number): void {
    this.bus.addTimelineEvent({
      id: `${this.config.id}-listen-end-${Date.now()}`,
      nodeId: this.config.id,
      type: 'listen_end',
      timestamp: Date.now(),
      duration: Date.now() - listenStartTime,
      success: false,
    });
    this.bus.log('warning', this.config.id, '总线忙，等待后重试');
    this.state.status = 'waiting';
    this.state.retryCount++;

    const backoffTime = this.arbitrationEngine.calculateBackoffTime(this.state.retryCount);
    this.bus.log('info', this.config.id, `退避等待 ${backoffTime.toFixed(0)}ms，重试次数 ${this.state.retryCount}`);

    this.bus.addTimelineEvent({
      id: `${this.config.id}-retry-${Date.now()}`,
      nodeId: this.config.id,
      type: 'retry',
      timestamp: Date.now(),
      duration: backoffTime,
    });

    this.operationTimer = setTimeout(() => {
      this.attemptSend();
    }, backoffTime);
  }

  private startSending(): void {
    const canSend = this.bus.requestSend(this.config.id);
    
    if (!canSend) {
      this.bus.log('warning', this.config.id, '总线被抢占，发生冲突');
      this.handleConflict();
      return;
    }

    this.bus.addTimelineEvent({
      id: `${this.config.id}-send-start-${Date.now()}`,
      nodeId: this.config.id,
      type: 'send_start',
      timestamp: Date.now(),
    });

    this.state.status = 'sending';
    const sendTime = this.arbitrationEngine.calculateSendTime(this.config.dataLength);
    this.bus.log('info', this.config.id, `开始发送数据，预计耗时 ${sendTime.toFixed(2)}ms，发送期间持续监听冲突检测`);

    const collisionCheckInterval = Math.max(5, this.bus.getBusConfig().collisionDetectTime / 2);
    
    this.collisionCheckTimer = setInterval(() => {
      if (this.bus.checkCollision(this.config.id)) {
        this.stopSendingAndHandleConflict();
      }
    }, collisionCheckInterval);

    this.sendEndTimer = setTimeout(() => {
      if (this.collisionCheckTimer) {
        clearInterval(this.collisionCheckTimer);
        this.collisionCheckTimer = null;
      }
      
      if (this.bus.checkCollision(this.config.id)) {
        this.handleConflict();
      } else {
        this.completeSend(sendTime);
      }
    }, sendTime);
  }

  private stopSendingAndHandleConflict(): void {
    if (this.collisionCheckTimer) {
      clearInterval(this.collisionCheckTimer);
      this.collisionCheckTimer = null;
    }
    if (this.sendEndTimer) {
      clearTimeout(this.sendEndTimer);
      this.sendEndTimer = null;
    }
    
    this.bus.log('warning', this.config.id, '发送期间检测到冲突，立即停止发送');
    this.handleConflict();
  }

  private handleConflict(): void {
    this.state.conflictCount++;
    this.state.status = 'conflict';
    this.bus.notifyConflict();
    
    this.bus.addTimelineEvent({
      id: `${this.config.id}-conflict-${Date.now()}`,
      nodeId: this.config.id,
      type: 'conflict',
      timestamp: Date.now(),
    });

    this.bus.log('error', this.config.id, `检测到冲突！立即停止发送，累计冲突次数: ${this.state.conflictCount}`);

    this.bus.releaseBus(this.config.id);
    this.state.retryCount++;

    if (this.state.retryCount > this.arbitrationEngine.getMaxRetries()) {
      this.bus.log('error', this.config.id, `达到最大重试次数(${this.arbitrationEngine.getMaxRetries()})，发送失败，等待下一个周期`);
      this.state.status = 'idle';
      this.state.retryCount = 0;
      this.state.currentSendStart = null;
      this.scheduleNextSend();
    } else {
      const { k, maxSlots } = this.arbitrationEngine.getBackoffSlots(this.state.retryCount);
      const backoffTime = this.arbitrationEngine.calculateBackoffTime(this.state.retryCount);
      const slots = Math.round(backoffTime / this.bus.getBusConfig().collisionDetectTime);
      
      this.bus.log('warning', this.config.id, 
        `二进制指数退避: k=${k}, 时隙范围[0,${maxSlots}], 选择${slots}时隙, 等待${backoffTime.toFixed(0)}ms (${this.state.retryCount}/${this.arbitrationEngine.getMaxRetries()})`);
      
      this.bus.addTimelineEvent({
        id: `${this.config.id}-retry-${Date.now()}`,
        nodeId: this.config.id,
        type: 'retry',
        timestamp: Date.now(),
        duration: backoffTime,
      });

      this.state.status = 'waiting';
      this.operationTimer = setTimeout(() => {
        this.attemptSend();
      }, backoffTime);
    }
  }

  private completeSend(sendTime: number): void {
    const delay = Date.now() - (this.state.currentSendStart || Date.now());
    
    this.state.status = 'success';
    this.state.sendCount++;
    this.state.lastSendDelay = delay;
    this.state.totalDelays += delay;
    this.state.avgSendDelay = this.state.totalDelays / this.state.sendCount;
    this.state.maxSendDelay = Math.max(this.state.maxSendDelay, delay);
    this.state.retryCount = 0;

    this.bus.releaseBus(this.config.id);

    this.bus.addTimelineEvent({
      id: `${this.config.id}-send-end-${Date.now()}`,
      nodeId: this.config.id,
      type: 'send_end',
      timestamp: Date.now(),
      duration: sendTime,
      success: true,
    });

    this.bus.log('success', this.config.id, `发送成功！延时: ${delay}ms，数据长度: ${this.config.dataLength}字节`);

    setTimeout(() => {
      this.state.status = 'idle';
      this.state.currentSendStart = null;
      
      if (this.pendingManualSend) {
        this.pendingManualSend = false;
        this.isManualSendMode = false;
      } else {
        this.scheduleNextSend();
      }
    }, 50);
  }
}
