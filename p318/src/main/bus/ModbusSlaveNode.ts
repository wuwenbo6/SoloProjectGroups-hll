import type { NodeConfig, NodeState, ModbusFunctionCode } from '../../shared/types';
import type { ArbitrationEngine } from './Arbitration';
import type { RS485Bus } from './RS485Bus';

export class ModbusSlaveNode {
  private config: NodeConfig;
  private state: NodeState;
  private bus: RS485Bus;
  private arbitrationEngine: ArbitrationEngine;
  private responseTimer: NodeJS.Timeout | null = null;
  private collisionCheckTimer: NodeJS.Timeout | null = null;
  private sendEndTimer: NodeJS.Timeout | null = null;
  private holdingRegisters: number[];
  private pendingRequest: { functionCode: ModbusFunctionCode } | null = null;

  constructor(config: NodeConfig, bus: RS485Bus, arbitrationEngine: ArbitrationEngine) {
    this.config = config;
    this.bus = bus;
    this.arbitrationEngine = arbitrationEngine;
    this.state = this.createInitialState(config.id);
    this.holdingRegisters = Array.from({ length: 100 }, () => Math.floor(Math.random() * 65535));
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
      modbusRequestCount: 0,
      modbusResponseCount: 0,
      modbusTimeoutCount: 0,
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

  getSlaveId(): number {
    return this.config.slaveId || 1;
  }

  getHoldingRegisters(): number[] {
    return [...this.holdingRegisters];
  }

  start(): void {
    if (!this.config.enabled) return;
    this.state.status = 'idle';
  }

  stop(): void {
    this.clearTimers();
    this.state.status = 'idle';
    this.state.currentSendStart = null;
    this.pendingRequest = null;
  }

  reset(): void {
    this.stop();
    this.state = this.createInitialState(this.config.id);
    this.holdingRegisters = Array.from({ length: 100 }, () => Math.floor(Math.random() * 65535));
  }

  onMasterRequest(functionCode: ModbusFunctionCode): void {
    if (!this.config.enabled || this.state.status !== 'idle') return;

    this.pendingRequest = { functionCode };
    this.state.modbusRequestCount!++;
    this.state.currentSendStart = Date.now();

    this.bus.log('info', this.config.id,
      `Modbus RTU: 收到主站请求, 功能码=0x${functionCode.toString(16).toUpperCase()}`);

    const processingTime = 5 + Math.random() * 15;
    this.responseTimer = setTimeout(() => {
      this.sendResponse();
    }, processingTime);
  }

  private clearTimers(): void {
    if (this.responseTimer) {
      clearTimeout(this.responseTimer);
      this.responseTimer = null;
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

  private sendResponse(): void {
    if (!this.pendingRequest) return;

    const functionCode = this.pendingRequest.functionCode;
    const responseDataLength = this.calculateResponseDataLength(functionCode);
    const responseFrameSize = responseDataLength + 5;
    const responseSendTime = this.arbitrationEngine.calculateSendTime(responseFrameSize);

    this.state.status = 'listening';
    this.bus.log('info', this.config.id, `Modbus RTU: 监听总线，准备发送响应`);

    this.responseTimer = setTimeout(() => {
      if (this.bus.isBusy()) {
        this.bus.log('warning', this.config.id, 'Modbus RTU: 总线忙，延迟响应');
        this.state.retryCount++;

        if (this.state.retryCount > 3) {
          this.bus.log('error', this.config.id, 'Modbus RTU: 响应延迟超过最大重试，丢弃响应');
          this.state.status = 'idle';
          this.state.retryCount = 0;
          this.pendingRequest = null;
          return;
        }

        const backoffTime = this.arbitrationEngine.calculateBackoffTime(this.state.retryCount);
        this.responseTimer = setTimeout(() => {
          this.sendResponse();
        }, backoffTime);
      } else {
        this.startSendingResponse(responseFrameSize, responseSendTime, functionCode);
      }
    }, this.arbitrationEngine.getArbitrateWaitTime());
  }

  private startSendingResponse(
    frameSize: number,
    sendTime: number,
    functionCode: ModbusFunctionCode,
  ): void {
    const canSend = this.bus.requestSend(this.config.id);
    if (!canSend) {
      this.state.conflictCount++;
      this.state.status = 'conflict';
      this.bus.notifyConflict();
      this.bus.addTimelineEvent({
        nodeId: this.config.id,
        type: 'conflict',
        timestamp: Date.now(),
      });
      this.bus.log('error', this.config.id, 'Modbus RTU: 发送响应时冲突');
      this.bus.releaseBus(this.config.id);

      this.state.retryCount++;
      if (this.state.retryCount <= 3) {
        const backoffTime = this.arbitrationEngine.calculateBackoffTime(this.state.retryCount);
        this.state.status = 'waiting';
        this.responseTimer = setTimeout(() => {
          this.sendResponse();
        }, backoffTime);
      } else {
        this.state.status = 'idle';
        this.state.retryCount = 0;
        this.pendingRequest = null;
      }
      return;
    }

    this.state.status = 'responding';
    this.bus.addTimelineEvent({
      nodeId: this.config.id,
      type: 'modbus_response',
      timestamp: Date.now(),
      duration: sendTime,
      success: true,
    });
    this.bus.log('info', this.config.id,
      `Modbus RTU: 发送响应, 功能码=0x${functionCode.toString(16).toUpperCase()}, 帧长=${frameSize}字节, 耗时=${sendTime.toFixed(2)}ms`);

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
      this.completeResponseSend(sendTime);
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
    this.state.conflictCount++;
    this.state.status = 'conflict';
    this.bus.notifyConflict();
    this.bus.addTimelineEvent({
      nodeId: this.config.id,
      type: 'conflict',
      timestamp: Date.now(),
    });
    this.bus.releaseBus(this.config.id);
    this.bus.log('error', this.config.id, 'Modbus RTU: 响应发送期间冲突');
    this.state.status = 'idle';
    this.state.retryCount = 0;
    this.pendingRequest = null;
  }

  private completeResponseSend(sendTime: number): void {
    const delay = Date.now() - (this.state.currentSendStart || Date.now());

    this.state.status = 'success';
    this.state.sendCount++;
    this.state.modbusResponseCount!++;
    this.state.lastSendDelay = delay;
    this.state.totalDelays += delay;
    this.state.avgSendDelay = this.state.totalDelays / this.state.sendCount;
    this.state.maxSendDelay = Math.max(this.state.maxSendDelay, delay);
    this.state.retryCount = 0;

    this.bus.releaseBus(this.config.id);
    this.bus.addTimelineEvent({
      nodeId: this.config.id,
      type: 'send_end',
      timestamp: Date.now(),
      duration: sendTime,
      success: true,
    });

    setTimeout(() => {
      this.state.status = 'idle';
      this.state.currentSendStart = null;
      this.pendingRequest = null;
    }, 50);
  }

  private calculateResponseDataLength(functionCode: ModbusFunctionCode): number {
    switch (functionCode) {
      case 0x01:
      case 0x02:
        return Math.ceil(8 / 8) + 2;
      case 0x03:
      case 0x04:
        return 8 * 2 + 2;
      case 0x05:
      case 0x06:
        return 4;
      case 0x0F:
      case 0x10:
        return 4;
      default:
        return 8;
    }
  }
}
