import type { NodeConfig, NodeState, ModbusFunctionCode } from '../../shared/types';
import type { ArbitrationEngine } from './Arbitration';
import type { RS485Bus } from './RS485Bus';

export class ModbusMasterNode {
  private config: NodeConfig;
  private state: NodeState;
  private bus: RS485Bus;
  private arbitrationEngine: ArbitrationEngine;
  private pollTimer: NodeJS.Timeout | null = null;
  private operationTimer: NodeJS.Timeout | null = null;
  private collisionCheckTimer: NodeJS.Timeout | null = null;
  private sendEndTimer: NodeJS.Timeout | null = null;
  private currentSlaveId: number = 1;
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

  start(): void {
    if (!this.config.enabled || this.pollTimer) return;
    this.state.status = 'idle';
    this.scheduleNextPoll();
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
    this.sendModbusRequest();
  }

  private scheduleNextPoll(): void {
    const interval = this.config.modbusPollInterval || 500;
    this.pollTimer = setTimeout(() => {
      this.sendModbusRequest();
    }, interval);
  }

  private clearTimers(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
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

  private sendModbusRequest(): void {
    if (!this.config.enabled) return;

    this.clearTimers();

    const slaveNodes = this.bus.getSlaveNodes();
    if (slaveNodes.length === 0) {
      this.scheduleNextPoll();
      return;
    }

    this.currentSlaveId = slaveNodes[this.state.modbusRequestCount! % slaveNodes.length].config.slaveId || 1;

    const functionCode: ModbusFunctionCode = 0x03;
    const requestFrameSize = 8;
    const requestSendTime = this.arbitrationEngine.calculateSendTime(requestFrameSize);

    this.state.status = 'listening';
    this.state.currentSendStart = Date.now();

    this.bus.addTimelineEvent({
      nodeId: this.config.id,
      type: 'listen_start',
      timestamp: Date.now(),
    });
    this.bus.log('info', this.config.id, `Modbus RTU: 监听总线，准备向从站 ${this.currentSlaveId} 发送请求`);

    this.operationTimer = setTimeout(() => {
      if (this.bus.isBusy()) {
        this.handleBusBusy();
      } else {
        this.startSendingRequest(this.currentSlaveId, functionCode, requestFrameSize, requestSendTime);
      }
    }, this.arbitrationEngine.getArbitrateWaitTime());
  }

  private handleBusBusy(): void {
    this.bus.log('warning', this.config.id, 'Modbus RTU: 总线忙，等待后重试');
    this.state.status = 'waiting';
    this.state.retryCount++;

    if (this.state.retryCount > this.arbitrationEngine.getMaxRetries()) {
      this.bus.log('error', this.config.id, 'Modbus RTU: 达到最大重试次数，跳过本次请求');
      this.state.retryCount = 0;
      this.state.status = 'idle';
      this.scheduleNextPoll();
      return;
    }

    const backoffTime = this.arbitrationEngine.calculateBackoffTime(this.state.retryCount);
    this.bus.addTimelineEvent({
      nodeId: this.config.id,
      type: 'retry',
      timestamp: Date.now(),
      duration: backoffTime,
    });

    this.operationTimer = setTimeout(() => {
      this.sendModbusRequest();
    }, backoffTime);
  }

  private startSendingRequest(
    slaveId: number,
    functionCode: ModbusFunctionCode,
    frameSize: number,
    sendTime: number,
  ): void {
    const canSend = this.bus.requestSend(this.config.id);
    if (!canSend) {
      this.handleConflict();
      return;
    }

    this.state.status = 'sending';
    this.state.modbusRequestCount!++;
    this.bus.addTimelineEvent({
      nodeId: this.config.id,
      type: 'modbus_request',
      timestamp: Date.now(),
      duration: sendTime,
    });
    this.bus.log('info', this.config.id,
      `Modbus RTU: 发送请求 → 从站${slaveId}, 功能码=0x${functionCode.toString(16).toUpperCase()}, 帧长=${frameSize}字节, 耗时=${sendTime.toFixed(2)}ms`);

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
        this.completeRequestSend(slaveId, functionCode, sendTime);
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
    this.bus.log('warning', this.config.id, 'Modbus RTU: 发送期间检测到冲突，立即停止');
    this.handleConflict();
  }

  private handleConflict(): void {
    this.state.conflictCount++;
    this.state.status = 'conflict';
    this.bus.notifyConflict();
    this.bus.addTimelineEvent({
      nodeId: this.config.id,
      type: 'conflict',
      timestamp: Date.now(),
    });
    this.bus.log('error', this.config.id, `Modbus RTU: 冲突！累计冲突次数: ${this.state.conflictCount}`);
    this.bus.releaseBus(this.config.id);
    this.state.retryCount++;

    if (this.state.retryCount > this.arbitrationEngine.getMaxRetries()) {
      this.bus.log('error', this.config.id, 'Modbus RTU: 达到最大重试次数，跳过本次请求');
      this.state.status = 'idle';
      this.state.retryCount = 0;
      this.scheduleNextPoll();
    } else {
      const backoffTime = this.arbitrationEngine.calculateBackoffTime(this.state.retryCount);
      this.bus.addTimelineEvent({
        nodeId: this.config.id,
        type: 'retry',
        timestamp: Date.now(),
        duration: backoffTime,
      });
      this.state.status = 'waiting';
      this.operationTimer = setTimeout(() => {
        this.sendModbusRequest();
      }, backoffTime);
    }
  }

  private completeRequestSend(
    slaveId: number,
    functionCode: ModbusFunctionCode,
    requestSendTime: number,
  ): void {
    this.state.sendCount++;
    this.state.retryCount = 0;
    this.bus.releaseBus(this.config.id);

    const delay = Date.now() - (this.state.currentSendStart || Date.now());
    this.state.lastSendDelay = delay;
    this.state.totalDelays += delay;
    this.state.avgSendDelay = this.state.totalDelays / this.state.sendCount;
    this.state.maxSendDelay = Math.max(this.state.maxSendDelay, delay);

    this.bus.addTimelineEvent({
      nodeId: this.config.id,
      type: 'send_end',
      timestamp: Date.now(),
      duration: requestSendTime,
      success: true,
    });

    const turnaroundDelay = this.bus.getBusConfig().modbusTurnaroundDelay || 10;
    this.state.status = 'waiting';

    this.operationTimer = setTimeout(() => {
      this.waitForResponse(slaveId, functionCode);
    }, turnaroundDelay);
  }

  private waitForResponse(slaveId: number, functionCode: ModbusFunctionCode): void {
    const responseTimeout = this.bus.getBusConfig().modbusResponseTimeout || 100;
    const slave = this.bus.getSlaveBySlaveId(slaveId);

    if (slave) {
      this.bus.notifySlaveResponse(slaveId, functionCode);
    }

    this.bus.log('info', this.config.id, `Modbus RTU: 等待从站${slaveId}响应 (超时: ${responseTimeout}ms)`);

    this.operationTimer = setTimeout(() => {
      if (slave) {
        const responseDataLength = 5 + Math.floor(Math.random() * 8);
        const responseSendTime = this.arbitrationEngine.calculateSendTime(responseDataLength);

        this.state.modbusResponseCount!++;
        this.state.status = 'success';

        this.bus.addTimelineEvent({
          nodeId: this.config.id,
          type: 'modbus_response',
          timestamp: Date.now(),
          duration: responseSendTime,
          success: true,
        });
        this.bus.log('success', this.config.id,
          `Modbus RTU: 收到从站${slaveId}响应, 数据长度=${responseDataLength}字节`);

        this.operationTimer = setTimeout(() => {
          this.state.status = 'idle';
          this.state.currentSendStart = null;
          if (this.pendingManualSend) {
            this.pendingManualSend = false;
          } else {
            this.scheduleNextPoll();
          }
        }, 50);
      } else {
        this.state.modbusTimeoutCount!++;
        this.state.status = 'idle';
        this.bus.addTimelineEvent({
          nodeId: this.config.id,
          type: 'modbus_timeout',
          timestamp: Date.now(),
        });
        this.bus.log('warning', this.config.id, `Modbus RTU: 从站${slaveId}响应超时`);
        this.state.currentSendStart = null;
        if (this.pendingManualSend) {
          this.pendingManualSend = false;
        } else {
          this.scheduleNextPoll();
        }
      }
    }, slave ? (50 + Math.random() * 30) : responseTimeout);
  }
}
