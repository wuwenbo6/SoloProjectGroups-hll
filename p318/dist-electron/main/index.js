var R = Object.defineProperty;
var w = (o, t, e) => t in o ? R(o, t, { enumerable: !0, configurable: !0, writable: !0, value: e }) : o[t] = e;
var n = (o, t, e) => w(o, typeof t != "symbol" ? t + "" : t, e);
import { ipcMain as l, dialog as N, app as f, BrowserWindow as v, shell as U } from "electron";
import h from "node:path";
import { fileURLToPath as k } from "node:url";
import p from "node:fs";
const I = {
  baudRate: 9600,
  arbitrateWaitTime: 50,
  maxRetries: 5,
  collisionDetectTime: 20,
  mode: "csma",
  modbusTurnaroundDelay: 10,
  modbusResponseTimeout: 100
}, S = [
  "#165DFF",
  "#00B42A",
  "#FF7D00",
  "#F53F3F",
  "#722ED1",
  "#14C9C9",
  "#FF9A2E",
  "#EB0AA4"
], B = (o, t) => ({
  id: o,
  name: `节点 ${t + 1}`,
  sendInterval: 1e3 + Math.random() * 500,
  dataLength: 8 + Math.floor(Math.random() * 8),
  color: S[t % S.length],
  enabled: !0,
  role: "slave",
  slaveId: t + 1,
  modbusPollInterval: 500
});
class x {
  constructor(t) {
    n(this, "config");
    this.config = t;
  }
  updateConfig(t) {
    this.config = t;
  }
  calculateBackoffTime(t) {
    const e = Math.min(t, 10), s = Math.pow(2, e) - 1;
    return Math.floor(Math.random() * (s + 1)) * this.config.collisionDetectTime;
  }
  getBackoffSlots(t) {
    const e = Math.min(t, 10), s = Math.pow(2, e) - 1;
    return { k: e, maxSlots: s };
  }
  calculateSendTime(t) {
    return t * 10 / this.config.baudRate * 1e3;
  }
  shouldDetectCollision(t) {
    return t.length > 1;
  }
  getArbitrateWaitTime() {
    return this.config.arbitrateWaitTime;
  }
  getMaxRetries() {
    return this.config.maxRetries;
  }
}
class T {
  constructor(t, e, s) {
    n(this, "config");
    n(this, "state");
    n(this, "bus");
    n(this, "arbitrationEngine");
    n(this, "sendTimer", null);
    n(this, "operationTimer", null);
    n(this, "collisionCheckTimer", null);
    n(this, "sendEndTimer", null);
    n(this, "isManualSendMode", !1);
    n(this, "pendingManualSend", !1);
    this.config = t, this.bus = e, this.arbitrationEngine = s, this.state = this.createInitialState(t.id);
  }
  createInitialState(t) {
    return {
      id: t,
      status: "idle",
      sendCount: 0,
      conflictCount: 0,
      retryCount: 0,
      lastSendDelay: 0,
      avgSendDelay: 0,
      maxSendDelay: 0,
      totalDelays: 0,
      currentSendStart: null
    };
  }
  getConfig() {
    return { ...this.config };
  }
  getState() {
    return { ...this.state };
  }
  updateConfig(t) {
    this.config = { ...this.config, ...t };
  }
  start() {
    !this.config.enabled || this.sendTimer || (this.state.status = "idle", this.scheduleNextSend());
  }
  stop() {
    this.clearTimers(), this.state.status = "idle", this.state.currentSendStart = null, this.pendingManualSend = !1;
  }
  reset() {
    this.stop(), this.state = this.createInitialState(this.config.id);
  }
  manualSend() {
    !this.config.enabled || this.state.status !== "idle" || (this.pendingManualSend = !0, this.isManualSendMode = !0, this.attemptSend());
  }
  scheduleNextSend() {
    if (this.isManualSendMode) return;
    const t = this.config.sendInterval + (Math.random() - 0.5) * 100;
    this.sendTimer = setTimeout(() => {
      this.attemptSend();
    }, t);
  }
  clearTimers() {
    this.sendTimer && (clearTimeout(this.sendTimer), this.sendTimer = null), this.operationTimer && (clearTimeout(this.operationTimer), this.operationTimer = null), this.collisionCheckTimer && (clearInterval(this.collisionCheckTimer), this.collisionCheckTimer = null), this.sendEndTimer && (clearTimeout(this.sendEndTimer), this.sendEndTimer = null);
  }
  attemptSend() {
    if (!this.config.enabled) return;
    this.state.status = "listening", this.state.currentSendStart = Date.now(), this.bus.addTimelineEvent({
      id: `${this.config.id}-listen-${Date.now()}`,
      nodeId: this.config.id,
      type: "listen_start",
      timestamp: Date.now()
    }), this.bus.log("info", this.config.id, `开始监听总线，等待 ${this.arbitrationEngine.getArbitrateWaitTime()}ms`);
    const t = Date.now();
    this.operationTimer = setTimeout(() => {
      this.bus.isBusy() ? this.handleBusBusy(t) : this.startSending();
    }, this.arbitrationEngine.getArbitrateWaitTime());
  }
  handleBusBusy(t) {
    this.bus.addTimelineEvent({
      id: `${this.config.id}-listen-end-${Date.now()}`,
      nodeId: this.config.id,
      type: "listen_end",
      timestamp: Date.now(),
      duration: Date.now() - t,
      success: !1
    }), this.bus.log("warning", this.config.id, "总线忙，等待后重试"), this.state.status = "waiting", this.state.retryCount++;
    const e = this.arbitrationEngine.calculateBackoffTime(this.state.retryCount);
    this.bus.log("info", this.config.id, `退避等待 ${e.toFixed(0)}ms，重试次数 ${this.state.retryCount}`), this.bus.addTimelineEvent({
      id: `${this.config.id}-retry-${Date.now()}`,
      nodeId: this.config.id,
      type: "retry",
      timestamp: Date.now(),
      duration: e
    }), this.operationTimer = setTimeout(() => {
      this.attemptSend();
    }, e);
  }
  startSending() {
    if (!this.bus.requestSend(this.config.id)) {
      this.bus.log("warning", this.config.id, "总线被抢占，发生冲突"), this.handleConflict();
      return;
    }
    this.bus.addTimelineEvent({
      id: `${this.config.id}-send-start-${Date.now()}`,
      nodeId: this.config.id,
      type: "send_start",
      timestamp: Date.now()
    }), this.state.status = "sending";
    const e = this.arbitrationEngine.calculateSendTime(this.config.dataLength);
    this.bus.log("info", this.config.id, `开始发送数据，预计耗时 ${e.toFixed(2)}ms，发送期间持续监听冲突检测`);
    const s = Math.max(5, this.bus.getBusConfig().collisionDetectTime / 2);
    this.collisionCheckTimer = setInterval(() => {
      this.bus.checkCollision(this.config.id) && this.stopSendingAndHandleConflict();
    }, s), this.sendEndTimer = setTimeout(() => {
      this.collisionCheckTimer && (clearInterval(this.collisionCheckTimer), this.collisionCheckTimer = null), this.bus.checkCollision(this.config.id) ? this.handleConflict() : this.completeSend(e);
    }, e);
  }
  stopSendingAndHandleConflict() {
    this.collisionCheckTimer && (clearInterval(this.collisionCheckTimer), this.collisionCheckTimer = null), this.sendEndTimer && (clearTimeout(this.sendEndTimer), this.sendEndTimer = null), this.bus.log("warning", this.config.id, "发送期间检测到冲突，立即停止发送"), this.handleConflict();
  }
  handleConflict() {
    if (this.state.conflictCount++, this.state.status = "conflict", this.bus.notifyConflict(), this.bus.addTimelineEvent({
      id: `${this.config.id}-conflict-${Date.now()}`,
      nodeId: this.config.id,
      type: "conflict",
      timestamp: Date.now()
    }), this.bus.log("error", this.config.id, `检测到冲突！立即停止发送，累计冲突次数: ${this.state.conflictCount}`), this.bus.releaseBus(this.config.id), this.state.retryCount++, this.state.retryCount > this.arbitrationEngine.getMaxRetries())
      this.bus.log("error", this.config.id, `达到最大重试次数(${this.arbitrationEngine.getMaxRetries()})，发送失败，等待下一个周期`), this.state.status = "idle", this.state.retryCount = 0, this.state.currentSendStart = null, this.scheduleNextSend();
    else {
      const { k: t, maxSlots: e } = this.arbitrationEngine.getBackoffSlots(this.state.retryCount), s = this.arbitrationEngine.calculateBackoffTime(this.state.retryCount), i = Math.round(s / this.bus.getBusConfig().collisionDetectTime);
      this.bus.log(
        "warning",
        this.config.id,
        `二进制指数退避: k=${t}, 时隙范围[0,${e}], 选择${i}时隙, 等待${s.toFixed(0)}ms (${this.state.retryCount}/${this.arbitrationEngine.getMaxRetries()})`
      ), this.bus.addTimelineEvent({
        id: `${this.config.id}-retry-${Date.now()}`,
        nodeId: this.config.id,
        type: "retry",
        timestamp: Date.now(),
        duration: s
      }), this.state.status = "waiting", this.operationTimer = setTimeout(() => {
        this.attemptSend();
      }, s);
    }
  }
  completeSend(t) {
    const e = Date.now() - (this.state.currentSendStart || Date.now());
    this.state.status = "success", this.state.sendCount++, this.state.lastSendDelay = e, this.state.totalDelays += e, this.state.avgSendDelay = this.state.totalDelays / this.state.sendCount, this.state.maxSendDelay = Math.max(this.state.maxSendDelay, e), this.state.retryCount = 0, this.bus.releaseBus(this.config.id), this.bus.addTimelineEvent({
      id: `${this.config.id}-send-end-${Date.now()}`,
      nodeId: this.config.id,
      type: "send_end",
      timestamp: Date.now(),
      duration: t,
      success: !0
    }), this.bus.log("success", this.config.id, `发送成功！延时: ${e}ms，数据长度: ${this.config.dataLength}字节`), setTimeout(() => {
      this.state.status = "idle", this.state.currentSendStart = null, this.pendingManualSend ? (this.pendingManualSend = !1, this.isManualSendMode = !1) : this.scheduleNextSend();
    }, 50);
  }
}
class C {
  constructor(t, e, s) {
    n(this, "config");
    n(this, "state");
    n(this, "bus");
    n(this, "arbitrationEngine");
    n(this, "pollTimer", null);
    n(this, "operationTimer", null);
    n(this, "collisionCheckTimer", null);
    n(this, "sendEndTimer", null);
    n(this, "currentSlaveId", 1);
    n(this, "pendingManualSend", !1);
    this.config = t, this.bus = e, this.arbitrationEngine = s, this.state = this.createInitialState(t.id);
  }
  createInitialState(t) {
    return {
      id: t,
      status: "idle",
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
      modbusTimeoutCount: 0
    };
  }
  getConfig() {
    return { ...this.config };
  }
  getState() {
    return { ...this.state };
  }
  updateConfig(t) {
    this.config = { ...this.config, ...t };
  }
  start() {
    !this.config.enabled || this.pollTimer || (this.state.status = "idle", this.scheduleNextPoll());
  }
  stop() {
    this.clearTimers(), this.state.status = "idle", this.state.currentSendStart = null, this.pendingManualSend = !1;
  }
  reset() {
    this.stop(), this.state = this.createInitialState(this.config.id);
  }
  manualSend() {
    !this.config.enabled || this.state.status !== "idle" || (this.pendingManualSend = !0, this.sendModbusRequest());
  }
  scheduleNextPoll() {
    const t = this.config.modbusPollInterval || 500;
    this.pollTimer = setTimeout(() => {
      this.sendModbusRequest();
    }, t);
  }
  clearTimers() {
    this.pollTimer && (clearTimeout(this.pollTimer), this.pollTimer = null), this.operationTimer && (clearTimeout(this.operationTimer), this.operationTimer = null), this.collisionCheckTimer && (clearInterval(this.collisionCheckTimer), this.collisionCheckTimer = null), this.sendEndTimer && (clearTimeout(this.sendEndTimer), this.sendEndTimer = null);
  }
  sendModbusRequest() {
    if (!this.config.enabled) return;
    this.clearTimers();
    const t = this.bus.getSlaveNodes();
    if (t.length === 0) {
      this.scheduleNextPoll();
      return;
    }
    this.currentSlaveId = t[this.state.modbusRequestCount % t.length].config.slaveId || 1;
    const e = 3, s = 8, i = this.arbitrationEngine.calculateSendTime(s);
    this.state.status = "listening", this.state.currentSendStart = Date.now(), this.bus.addTimelineEvent({
      nodeId: this.config.id,
      type: "listen_start",
      timestamp: Date.now()
    }), this.bus.log("info", this.config.id, `Modbus RTU: 监听总线，准备向从站 ${this.currentSlaveId} 发送请求`), this.operationTimer = setTimeout(() => {
      this.bus.isBusy() ? this.handleBusBusy() : this.startSendingRequest(this.currentSlaveId, e, s, i);
    }, this.arbitrationEngine.getArbitrateWaitTime());
  }
  handleBusBusy() {
    if (this.bus.log("warning", this.config.id, "Modbus RTU: 总线忙，等待后重试"), this.state.status = "waiting", this.state.retryCount++, this.state.retryCount > this.arbitrationEngine.getMaxRetries()) {
      this.bus.log("error", this.config.id, "Modbus RTU: 达到最大重试次数，跳过本次请求"), this.state.retryCount = 0, this.state.status = "idle", this.scheduleNextPoll();
      return;
    }
    const t = this.arbitrationEngine.calculateBackoffTime(this.state.retryCount);
    this.bus.addTimelineEvent({
      nodeId: this.config.id,
      type: "retry",
      timestamp: Date.now(),
      duration: t
    }), this.operationTimer = setTimeout(() => {
      this.sendModbusRequest();
    }, t);
  }
  startSendingRequest(t, e, s, i) {
    if (!this.bus.requestSend(this.config.id)) {
      this.handleConflict();
      return;
    }
    this.state.status = "sending", this.state.modbusRequestCount++, this.bus.addTimelineEvent({
      nodeId: this.config.id,
      type: "modbus_request",
      timestamp: Date.now(),
      duration: i
    }), this.bus.log(
      "info",
      this.config.id,
      `Modbus RTU: 发送请求 → 从站${t}, 功能码=0x${e.toString(16).toUpperCase()}, 帧长=${s}字节, 耗时=${i.toFixed(2)}ms`
    );
    const r = Math.max(5, this.bus.getBusConfig().collisionDetectTime / 2);
    this.collisionCheckTimer = setInterval(() => {
      this.bus.checkCollision(this.config.id) && this.stopSendingAndHandleConflict();
    }, r), this.sendEndTimer = setTimeout(() => {
      this.collisionCheckTimer && (clearInterval(this.collisionCheckTimer), this.collisionCheckTimer = null), this.bus.checkCollision(this.config.id) ? this.handleConflict() : this.completeRequestSend(t, e, i);
    }, i);
  }
  stopSendingAndHandleConflict() {
    this.collisionCheckTimer && (clearInterval(this.collisionCheckTimer), this.collisionCheckTimer = null), this.sendEndTimer && (clearTimeout(this.sendEndTimer), this.sendEndTimer = null), this.bus.log("warning", this.config.id, "Modbus RTU: 发送期间检测到冲突，立即停止"), this.handleConflict();
  }
  handleConflict() {
    if (this.state.conflictCount++, this.state.status = "conflict", this.bus.notifyConflict(), this.bus.addTimelineEvent({
      nodeId: this.config.id,
      type: "conflict",
      timestamp: Date.now()
    }), this.bus.log("error", this.config.id, `Modbus RTU: 冲突！累计冲突次数: ${this.state.conflictCount}`), this.bus.releaseBus(this.config.id), this.state.retryCount++, this.state.retryCount > this.arbitrationEngine.getMaxRetries())
      this.bus.log("error", this.config.id, "Modbus RTU: 达到最大重试次数，跳过本次请求"), this.state.status = "idle", this.state.retryCount = 0, this.scheduleNextPoll();
    else {
      const t = this.arbitrationEngine.calculateBackoffTime(this.state.retryCount);
      this.bus.addTimelineEvent({
        nodeId: this.config.id,
        type: "retry",
        timestamp: Date.now(),
        duration: t
      }), this.state.status = "waiting", this.operationTimer = setTimeout(() => {
        this.sendModbusRequest();
      }, t);
    }
  }
  completeRequestSend(t, e, s) {
    this.state.sendCount++, this.state.retryCount = 0, this.bus.releaseBus(this.config.id);
    const i = Date.now() - (this.state.currentSendStart || Date.now());
    this.state.lastSendDelay = i, this.state.totalDelays += i, this.state.avgSendDelay = this.state.totalDelays / this.state.sendCount, this.state.maxSendDelay = Math.max(this.state.maxSendDelay, i), this.bus.addTimelineEvent({
      nodeId: this.config.id,
      type: "send_end",
      timestamp: Date.now(),
      duration: s,
      success: !0
    });
    const a = this.bus.getBusConfig().modbusTurnaroundDelay || 10;
    this.state.status = "waiting", this.operationTimer = setTimeout(() => {
      this.waitForResponse(t, e);
    }, a);
  }
  waitForResponse(t, e) {
    const s = this.bus.getBusConfig().modbusResponseTimeout || 100, i = this.bus.getSlaveBySlaveId(t);
    i && this.bus.notifySlaveResponse(t, e), this.bus.log("info", this.config.id, `Modbus RTU: 等待从站${t}响应 (超时: ${s}ms)`), this.operationTimer = setTimeout(() => {
      if (i) {
        const a = 5 + Math.floor(Math.random() * 8), r = this.arbitrationEngine.calculateSendTime(a);
        this.state.modbusResponseCount++, this.state.status = "success", this.bus.addTimelineEvent({
          nodeId: this.config.id,
          type: "modbus_response",
          timestamp: Date.now(),
          duration: r,
          success: !0
        }), this.bus.log(
          "success",
          this.config.id,
          `Modbus RTU: 收到从站${t}响应, 数据长度=${a}字节`
        ), this.operationTimer = setTimeout(() => {
          this.state.status = "idle", this.state.currentSendStart = null, this.pendingManualSend ? this.pendingManualSend = !1 : this.scheduleNextPoll();
        }, 50);
      } else
        this.state.modbusTimeoutCount++, this.state.status = "idle", this.bus.addTimelineEvent({
          nodeId: this.config.id,
          type: "modbus_timeout",
          timestamp: Date.now()
        }), this.bus.log("warning", this.config.id, `Modbus RTU: 从站${t}响应超时`), this.state.currentSendStart = null, this.pendingManualSend ? this.pendingManualSend = !1 : this.scheduleNextPoll();
    }, i ? 50 + Math.random() * 30 : s);
  }
}
class y {
  constructor(t, e, s) {
    n(this, "config");
    n(this, "state");
    n(this, "bus");
    n(this, "arbitrationEngine");
    n(this, "responseTimer", null);
    n(this, "collisionCheckTimer", null);
    n(this, "sendEndTimer", null);
    n(this, "holdingRegisters");
    n(this, "pendingRequest", null);
    this.config = t, this.bus = e, this.arbitrationEngine = s, this.state = this.createInitialState(t.id), this.holdingRegisters = Array.from({ length: 100 }, () => Math.floor(Math.random() * 65535));
  }
  createInitialState(t) {
    return {
      id: t,
      status: "idle",
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
      modbusTimeoutCount: 0
    };
  }
  getConfig() {
    return { ...this.config };
  }
  getState() {
    return { ...this.state };
  }
  updateConfig(t) {
    this.config = { ...this.config, ...t };
  }
  getSlaveId() {
    return this.config.slaveId || 1;
  }
  getHoldingRegisters() {
    return [...this.holdingRegisters];
  }
  start() {
    this.config.enabled && (this.state.status = "idle");
  }
  stop() {
    this.clearTimers(), this.state.status = "idle", this.state.currentSendStart = null, this.pendingRequest = null;
  }
  reset() {
    this.stop(), this.state = this.createInitialState(this.config.id), this.holdingRegisters = Array.from({ length: 100 }, () => Math.floor(Math.random() * 65535));
  }
  onMasterRequest(t) {
    if (!this.config.enabled || this.state.status !== "idle") return;
    this.pendingRequest = { functionCode: t }, this.state.modbusRequestCount++, this.state.currentSendStart = Date.now(), this.bus.log(
      "info",
      this.config.id,
      `Modbus RTU: 收到主站请求, 功能码=0x${t.toString(16).toUpperCase()}`
    );
    const e = 5 + Math.random() * 15;
    this.responseTimer = setTimeout(() => {
      this.sendResponse();
    }, e);
  }
  clearTimers() {
    this.responseTimer && (clearTimeout(this.responseTimer), this.responseTimer = null), this.collisionCheckTimer && (clearInterval(this.collisionCheckTimer), this.collisionCheckTimer = null), this.sendEndTimer && (clearTimeout(this.sendEndTimer), this.sendEndTimer = null);
  }
  sendResponse() {
    if (!this.pendingRequest) return;
    const t = this.pendingRequest.functionCode, s = this.calculateResponseDataLength(t) + 5, i = this.arbitrationEngine.calculateSendTime(s);
    this.state.status = "listening", this.bus.log("info", this.config.id, "Modbus RTU: 监听总线，准备发送响应"), this.responseTimer = setTimeout(() => {
      if (this.bus.isBusy()) {
        if (this.bus.log("warning", this.config.id, "Modbus RTU: 总线忙，延迟响应"), this.state.retryCount++, this.state.retryCount > 3) {
          this.bus.log("error", this.config.id, "Modbus RTU: 响应延迟超过最大重试，丢弃响应"), this.state.status = "idle", this.state.retryCount = 0, this.pendingRequest = null;
          return;
        }
        const a = this.arbitrationEngine.calculateBackoffTime(this.state.retryCount);
        this.responseTimer = setTimeout(() => {
          this.sendResponse();
        }, a);
      } else
        this.startSendingResponse(s, i, t);
    }, this.arbitrationEngine.getArbitrateWaitTime());
  }
  startSendingResponse(t, e, s) {
    if (!this.bus.requestSend(this.config.id)) {
      if (this.state.conflictCount++, this.state.status = "conflict", this.bus.notifyConflict(), this.bus.addTimelineEvent({
        nodeId: this.config.id,
        type: "conflict",
        timestamp: Date.now()
      }), this.bus.log("error", this.config.id, "Modbus RTU: 发送响应时冲突"), this.bus.releaseBus(this.config.id), this.state.retryCount++, this.state.retryCount <= 3) {
        const r = this.arbitrationEngine.calculateBackoffTime(this.state.retryCount);
        this.state.status = "waiting", this.responseTimer = setTimeout(() => {
          this.sendResponse();
        }, r);
      } else
        this.state.status = "idle", this.state.retryCount = 0, this.pendingRequest = null;
      return;
    }
    this.state.status = "responding", this.bus.addTimelineEvent({
      nodeId: this.config.id,
      type: "modbus_response",
      timestamp: Date.now(),
      duration: e,
      success: !0
    }), this.bus.log(
      "info",
      this.config.id,
      `Modbus RTU: 发送响应, 功能码=0x${s.toString(16).toUpperCase()}, 帧长=${t}字节, 耗时=${e.toFixed(2)}ms`
    );
    const a = Math.max(5, this.bus.getBusConfig().collisionDetectTime / 2);
    this.collisionCheckTimer = setInterval(() => {
      this.bus.checkCollision(this.config.id) && this.stopSendingAndHandleConflict();
    }, a), this.sendEndTimer = setTimeout(() => {
      this.collisionCheckTimer && (clearInterval(this.collisionCheckTimer), this.collisionCheckTimer = null), this.completeResponseSend(e);
    }, e);
  }
  stopSendingAndHandleConflict() {
    this.collisionCheckTimer && (clearInterval(this.collisionCheckTimer), this.collisionCheckTimer = null), this.sendEndTimer && (clearTimeout(this.sendEndTimer), this.sendEndTimer = null), this.state.conflictCount++, this.state.status = "conflict", this.bus.notifyConflict(), this.bus.addTimelineEvent({
      nodeId: this.config.id,
      type: "conflict",
      timestamp: Date.now()
    }), this.bus.releaseBus(this.config.id), this.bus.log("error", this.config.id, "Modbus RTU: 响应发送期间冲突"), this.state.status = "idle", this.state.retryCount = 0, this.pendingRequest = null;
  }
  completeResponseSend(t) {
    const e = Date.now() - (this.state.currentSendStart || Date.now());
    this.state.status = "success", this.state.sendCount++, this.state.modbusResponseCount++, this.state.lastSendDelay = e, this.state.totalDelays += e, this.state.avgSendDelay = this.state.totalDelays / this.state.sendCount, this.state.maxSendDelay = Math.max(this.state.maxSendDelay, e), this.state.retryCount = 0, this.bus.releaseBus(this.config.id), this.bus.addTimelineEvent({
      nodeId: this.config.id,
      type: "send_end",
      timestamp: Date.now(),
      duration: t,
      success: !0
    }), setTimeout(() => {
      this.state.status = "idle", this.state.currentSendStart = null, this.pendingRequest = null;
    }, 50);
  }
  calculateResponseDataLength(t) {
    switch (t) {
      case 1:
      case 2:
        return Math.ceil(8 / 8) + 2;
      case 3:
      case 4:
        return 18;
      case 5:
      case 6:
        return 4;
      case 15:
      case 16:
        return 4;
      default:
        return 8;
    }
  }
}
class $ {
  constructor(t) {
    n(this, "csmaNodes", /* @__PURE__ */ new Map());
    n(this, "modbusMasters", /* @__PURE__ */ new Map());
    n(this, "modbusSlaves", /* @__PURE__ */ new Map());
    n(this, "arbitrationEngine");
    n(this, "busConfig");
    n(this, "busState");
    n(this, "currentSenders", /* @__PURE__ */ new Set());
    n(this, "conflictFlag", !1);
    n(this, "onStateUpdate", null);
    n(this, "onLog", null);
    n(this, "onTimelineEvent", null);
    n(this, "stateUpdateTimer", null);
    n(this, "utilizationTimer", null);
    n(this, "startTime", null);
    n(this, "busyTimeAccumulator", 0);
    n(this, "idleTimeAccumulator", 0);
    n(this, "lastUtilizationCheck", 0);
    n(this, "utilizationSamples", []);
    n(this, "perNodeSendTime", {});
    n(this, "lastBusyState", !1);
    this.busConfig = { ...I, ...t }, this.arbitrationEngine = new x(this.busConfig), this.busState = {
      isBusy: !1,
      currentSender: null,
      conflictDetected: !1,
      isRunning: !1,
      mode: this.busConfig.mode
    };
  }
  setOnStateUpdate(t) {
    this.onStateUpdate = t;
  }
  setOnLog(t) {
    this.onLog = t;
  }
  setOnTimelineEvent(t) {
    this.onTimelineEvent = t;
  }
  addNode(t) {
    if (this.getAllNodeIds().has(t.id)) {
      this.updateNode(t.id, t);
      return;
    }
    if (this.busConfig.mode === "modbus-rtu")
      if (t.role === "master") {
        const s = new C(t, this, this.arbitrationEngine);
        this.modbusMasters.set(t.id, s), this.log("info", t.id, `已添加Modbus主站: ${t.name}`);
      } else {
        const s = new y(t, this, this.arbitrationEngine);
        this.modbusSlaves.set(t.id, s), this.log("info", t.id, `已添加Modbus从站: ${t.name} (Slave ID: ${t.slaveId})`);
      }
    else {
      const s = new T(t, this, this.arbitrationEngine);
      this.csmaNodes.set(t.id, s), this.log("info", t.id, `已添加节点: ${t.name}`);
    }
    this.pushStateUpdate();
  }
  removeNode(t) {
    this.csmaNodes.has(t) ? (this.csmaNodes.get(t).stop(), this.csmaNodes.delete(t)) : this.modbusMasters.has(t) ? (this.modbusMasters.get(t).stop(), this.modbusMasters.delete(t)) : this.modbusSlaves.has(t) && (this.modbusSlaves.get(t).stop(), this.modbusSlaves.delete(t)), delete this.perNodeSendTime[t], this.log("info", t, "已移除节点"), this.pushStateUpdate();
  }
  updateNode(t, e) {
    const s = this.findNode(t);
    s && (s.updateConfig(e), this.log("info", t, "已更新节点配置"), this.pushStateUpdate());
  }
  getNode(t) {
    return this.findNode(t);
  }
  getAllNodes() {
    return [
      ...Array.from(this.csmaNodes.values()),
      ...Array.from(this.modbusMasters.values()),
      ...Array.from(this.modbusSlaves.values())
    ];
  }
  getSlaveNodes() {
    return Array.from(this.modbusSlaves.values()).map((t) => ({
      config: t.getConfig()
    }));
  }
  getSlaveBySlaveId(t) {
    return Array.from(this.modbusSlaves.values()).find((e) => e.getSlaveId() === t);
  }
  notifySlaveResponse(t, e) {
    const s = this.getSlaveBySlaveId(t);
    s && s.onMasterRequest(e);
  }
  updateBusConfig(t) {
    const e = this.busConfig.mode;
    this.busConfig = { ...this.busConfig, ...t }, this.busState.mode = this.busConfig.mode, this.arbitrationEngine.updateConfig(this.busConfig), e !== this.busConfig.mode && this.switchMode(this.busConfig.mode), this.log("info", void 0, `已更新总线配置: 模式=${this.busConfig.mode}`), this.pushStateUpdate();
  }
  getBusConfig() {
    return { ...this.busConfig };
  }
  getBusState() {
    return { ...this.busState };
  }
  start() {
    this.busState.isRunning || (this.busState.isRunning = !0, this.busState.mode = this.busConfig.mode, this.startTime = Date.now(), this.lastUtilizationCheck = Date.now(), this.busyTimeAccumulator = 0, this.idleTimeAccumulator = 0, this.lastBusyState = !1, this.log("info", void 0, `总线模拟已启动 (模式: ${this.busConfig.mode === "csma" ? "CSMA/CD" : "Modbus RTU"})`), this.csmaNodes.forEach((t) => t.start()), this.modbusMasters.forEach((t) => t.start()), this.modbusSlaves.forEach((t) => t.start()), this.startStateUpdateLoop(), this.startUtilizationTracking(), this.pushStateUpdate());
  }
  pause() {
    this.busState.isRunning && (this.busState.isRunning = !1, this.log("info", void 0, "总线模拟已暂停"), this.csmaNodes.forEach((t) => t.stop()), this.modbusMasters.forEach((t) => t.stop()), this.modbusSlaves.forEach((t) => t.stop()), this.stopStateUpdateLoop(), this.stopUtilizationTracking(), this.pushStateUpdate());
  }
  reset() {
    this.pause(), this.currentSenders.clear(), this.conflictFlag = !1, this.busState = {
      isBusy: !1,
      currentSender: null,
      conflictDetected: !1,
      isRunning: !1,
      mode: this.busConfig.mode
    }, this.startTime = null, this.busyTimeAccumulator = 0, this.idleTimeAccumulator = 0, this.utilizationSamples = [], this.perNodeSendTime = {}, this.csmaNodes.forEach((t) => t.reset()), this.modbusMasters.forEach((t) => t.reset()), this.modbusSlaves.forEach((t) => t.reset()), this.log("info", void 0, "总线模拟已重置"), this.pushStateUpdate();
  }
  manualSend(t) {
    const e = this.csmaNodes.get(t);
    if (e) {
      e.manualSend();
      return;
    }
    const s = this.modbusMasters.get(t);
    s && s.manualSend();
  }
  isBusy() {
    return this.currentSenders.size > 0;
  }
  requestSend(t) {
    return this.trackUtilization(), this.currentSenders.size > 0 && !this.currentSenders.has(t) ? (this.conflictFlag = !0, this.currentSenders.add(t), !1) : (this.currentSenders.add(t), this.busState.isBusy = !0, this.busState.currentSender = t, this.busState.conflictDetected = !1, this.currentSenders.size > 1 ? (this.conflictFlag = !0, !1) : !0);
  }
  checkCollision(t) {
    return !!(this.conflictFlag || this.currentSenders.size > 1);
  }
  notifyConflict() {
    this.busState.conflictDetected = !0;
  }
  releaseBus(t) {
    this.trackUtilization(), this.currentSenders.delete(t), this.currentSenders.size === 0 && (this.busState.isBusy = !1, this.busState.currentSender = null, this.busState.conflictDetected = !1, this.conflictFlag = !1);
  }
  getUtilizationStats() {
    const t = this.startTime ? Date.now() - this.startTime : 0, e = this.utilizationSamples.slice(-120), s = e.length > 0 ? e[e.length - 1].utilization : 0, i = e.length > 0 ? e.reduce((c, m) => c + m.utilization, 0) / e.length : 0, a = e.length > 0 ? Math.max(...e.map((c) => c.utilization)) : 0, r = {};
    for (const [c, m] of Object.entries(this.perNodeSendTime))
      r[c] = {
        sendTime: m.sendTime,
        sendCount: m.sendCount,
        utilization: t > 0 ? m.sendTime / t * 100 : 0
      };
    return {
      currentUtilization: s,
      avgUtilization: i,
      peakUtilization: a,
      totalBusyTime: this.busyTimeAccumulator,
      totalIdleTime: this.idleTimeAccumulator,
      totalRuntime: t,
      samples: e,
      perNodeStats: r
    };
  }
  recordNodeSendTime(t, e) {
    this.perNodeSendTime[t] || (this.perNodeSendTime[t] = { sendTime: 0, sendCount: 0 }), this.perNodeSendTime[t].sendTime += e, this.perNodeSendTime[t].sendCount++;
  }
  log(t, e, s) {
    const i = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      level: t,
      nodeId: e,
      message: s
    };
    this.onLog && this.onLog(i);
  }
  addTimelineEvent(t) {
    const e = {
      id: t.id || `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      nodeId: t.nodeId,
      type: t.type,
      timestamp: t.timestamp,
      duration: t.duration,
      success: t.success
    };
    this.onTimelineEvent && this.onTimelineEvent(e);
  }
  getStartTime() {
    return this.startTime;
  }
  destroy() {
    this.stopStateUpdateLoop(), this.stopUtilizationTracking(), this.csmaNodes.forEach((t) => t.stop()), this.modbusMasters.forEach((t) => t.stop()), this.modbusSlaves.forEach((t) => t.stop()), this.csmaNodes.clear(), this.modbusMasters.clear(), this.modbusSlaves.clear();
  }
  findNode(t) {
    return this.csmaNodes.get(t) || this.modbusMasters.get(t) || this.modbusSlaves.get(t);
  }
  getAllNodeIds() {
    return /* @__PURE__ */ new Set([
      ...this.csmaNodes.keys(),
      ...this.modbusMasters.keys(),
      ...this.modbusSlaves.keys()
    ]);
  }
  switchMode(t) {
    const e = this.busState.isRunning;
    if (e && this.pause(), this.csmaNodes.forEach((s) => s.stop()), this.modbusMasters.forEach((s) => s.stop()), this.modbusSlaves.forEach((s) => s.stop()), this.currentSenders.clear(), this.conflictFlag = !1, this.busyTimeAccumulator = 0, this.idleTimeAccumulator = 0, this.utilizationSamples = [], this.perNodeSendTime = {}, t === "modbus-rtu") {
      const s = Array.from(this.csmaNodes.entries());
      this.csmaNodes.clear();
      for (const [i, a] of s) {
        const r = a.getConfig();
        r.role = r.role || "slave", r.slaveId || (r.slaveId = parseInt(i.slice(-1), 16) || 1), r.modbusPollInterval || (r.modbusPollInterval = 500), r.role === "master" ? this.modbusMasters.set(i, new C(r, this, this.arbitrationEngine)) : this.modbusSlaves.set(i, new y(r, this, this.arbitrationEngine));
      }
      this.log("info", void 0, "已切换到 Modbus RTU 主从模式");
    } else {
      const s = [
        ...Array.from(this.modbusMasters.entries()),
        ...Array.from(this.modbusSlaves.entries())
      ];
      this.modbusMasters.clear(), this.modbusSlaves.clear();
      for (const [i, a] of s) {
        const r = a.getConfig();
        this.csmaNodes.set(i, new T(r, this, this.arbitrationEngine));
      }
      this.log("info", void 0, "已切换到 CSMA/CD 多主模式");
    }
    e && this.start();
  }
  trackUtilization() {
    const t = Date.now();
    if (this.lastUtilizationCheck === 0) {
      this.lastUtilizationCheck = t;
      return;
    }
    const e = t - this.lastUtilizationCheck;
    e <= 0 || (this.busState.isBusy ? this.busyTimeAccumulator += e : this.idleTimeAccumulator += e, this.lastBusyState = this.busState.isBusy, this.lastUtilizationCheck = t);
  }
  startUtilizationTracking() {
    this.utilizationTimer || (this.lastUtilizationCheck = Date.now(), this.utilizationTimer = setInterval(() => {
      this.trackUtilization();
      const t = this.busyTimeAccumulator + this.idleTimeAccumulator, e = t > 0 ? this.busyTimeAccumulator / t * 100 : 0;
      this.utilizationSamples.push({
        timestamp: Date.now(),
        utilization: e,
        busyTime: this.busyTimeAccumulator,
        idleTime: this.idleTimeAccumulator
      }), this.utilizationSamples.length > 120 && (this.utilizationSamples = this.utilizationSamples.slice(-120));
    }, 1e3));
  }
  stopUtilizationTracking() {
    this.utilizationTimer && (clearInterval(this.utilizationTimer), this.utilizationTimer = null);
  }
  startStateUpdateLoop() {
    this.stateUpdateTimer || (this.stateUpdateTimer = setInterval(() => {
      this.pushStateUpdate();
    }, 50));
  }
  stopStateUpdateLoop() {
    this.stateUpdateTimer && (clearInterval(this.stateUpdateTimer), this.stateUpdateTimer = null);
  }
  pushStateUpdate() {
    if (!this.onStateUpdate) return;
    const t = {};
    this.csmaNodes.forEach((s, i) => {
      t[i] = s.getState();
    }), this.modbusMasters.forEach((s, i) => {
      t[i] = s.getState();
    }), this.modbusSlaves.forEach((s, i) => {
      t[i] = s.getState();
    });
    const e = this.getUtilizationStats();
    this.onStateUpdate({
      nodes: t,
      bus: { ...this.busState },
      utilization: e
    });
  }
}
class z {
  constructor(t) {
    n(this, "bus");
    n(this, "nodeIndex", 0);
    this.bus = t;
  }
  createNode(t) {
    const e = `node-${Date.now()}-${this.nodeIndex}`, s = this.bus.getBusConfig(), i = B(e, this.nodeIndex);
    s.mode === "modbus-rtu" && (i.role = this.nodeIndex === 0 ? "master" : "slave", i.slaveId = this.nodeIndex === 0 ? void 0 : this.nodeIndex, i.modbusPollInterval = 500, i.role === "master" ? i.name = "主站" : i.name = `从站 ${this.nodeIndex}`);
    const a = {
      ...i,
      ...t
    };
    return this.nodeIndex++, this.bus.addNode(a), a;
  }
  removeNode(t) {
    this.bus.removeNode(t);
  }
  updateNode(t, e) {
    this.bus.updateNode(t, e);
  }
  updateBusConfig(t) {
    this.bus.updateBusConfig(t);
  }
  setBusMode(t) {
    this.bus.updateBusConfig({ mode: t });
  }
  startSimulation() {
    this.bus.start();
  }
  pauseSimulation() {
    this.bus.pause();
  }
  resetSimulation() {
    this.bus.reset();
  }
  manualSend(t) {
    this.bus.manualSend(t);
  }
  getNodeConfigs() {
    const t = {};
    return this.bus.getAllNodes().forEach((e) => {
      const s = e.getConfig();
      t[s.id] = s;
    }), t;
  }
  getBusConfig() {
    return this.bus.getBusConfig();
  }
  getUtilizationStats() {
    return this.bus.getUtilizationStats();
  }
  exportData() {
    const t = this.bus.getBusConfig(), e = this.bus.getUtilizationStats(), s = this.bus.getAllNodes().map((i) => ({
      config: i.getConfig(),
      state: i.getState()
    }));
    return {
      exportTime: (/* @__PURE__ */ new Date()).toISOString(),
      busConfig: t,
      busMode: t.mode,
      utilization: e,
      nodes: s,
      logs: []
    };
  }
  initializeDefaultNodes(t = 4) {
    const e = this.bus.getBusConfig().mode;
    if (this.nodeIndex = 0, e === "modbus-rtu") {
      this.createNode({
        role: "master",
        name: "主站",
        modbusPollInterval: 500,
        color: "#165DFF"
      });
      for (let s = 1; s < t; s++)
        this.createNode({
          role: "slave",
          slaveId: s,
          name: `从站 ${s}`,
          color: void 0
        });
    } else
      for (let s = 0; s < t; s++)
        this.createNode();
  }
}
function A(o, t, e) {
  o.setOnStateUpdate((s) => {
    e("state:update", s);
  }), o.setOnLog((s) => {
    e("log:new", s);
  }), o.setOnTimelineEvent((s) => {
    e("timeline:update", s);
  }), l.handle("sim:start", (s, i) => (i && t.updateBusConfig(i), t.startSimulation(), { success: !0 })), l.handle("sim:pause", () => (t.pauseSimulation(), { success: !0 })), l.handle("sim:reset", () => (t.resetSimulation(), { success: !0 })), l.handle("sim:getState", () => ({
    nodes: t.getNodeConfigs(),
    busConfig: t.getBusConfig(),
    busState: o.getBusState(),
    startTime: o.getStartTime(),
    utilization: o.getUtilizationStats()
  })), l.handle("node:add", (s, i) => ({ success: !0, config: t.createNode(i) })), l.handle("node:remove", (s, i) => (t.removeNode(i), { success: !0 })), l.handle("node:update", (s, i, a) => (t.updateNode(i, a), { success: !0 })), l.handle("node:manualSend", (s, i) => (t.manualSend(i), { success: !0 })), l.handle("bus:updateConfig", (s, i) => (t.updateBusConfig(i), { success: !0 })), l.handle("bus:getConfig", () => t.getBusConfig()), l.handle("bus:setMode", (s, i) => (t.setBusMode(i), { success: !0 })), l.handle("bus:getUtilization", () => o.getUtilizationStats()), l.handle("export:data", async () => {
    try {
      const s = t.exportData(), i = await N.showSaveDialog({
        title: "导出总线统计数据",
        defaultPath: `rs485-stats-${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}.json`,
        filters: [
          { name: "JSON", extensions: ["json"] },
          { name: "CSV", extensions: ["csv"] }
        ]
      });
      if (i.canceled || !i.filePath)
        return { success: !1, message: "已取消导出" };
      if (i.filePath.endsWith(".csv")) {
        const a = F(s);
        p.writeFileSync(i.filePath, a, "utf-8");
      } else
        p.writeFileSync(i.filePath, JSON.stringify(s, null, 2), "utf-8");
      return { success: !0, path: i.filePath };
    } catch (s) {
      return { success: !1, message: s instanceof Error ? s.message : String(s) };
    }
  });
}
function F(o) {
  const t = [];
  t.push("RS-485 总线统计数据导出"), t.push(`导出时间,${o.exportTime}`), t.push(`总线模式,${o.busMode === "csma" ? "CSMA/CD" : "Modbus RTU"}`), t.push(""), t.push("总线配置"), t.push(`波特率,${o.busConfig.baudRate}`), t.push(`仲裁等待时间(ms),${o.busConfig.arbitrateWaitTime}`), t.push(`最大重试次数,${o.busConfig.maxRetries}`), t.push(`冲突检测时间(ms),${o.busConfig.collisionDetectTime}`), o.busMode === "modbus-rtu" && (t.push(`从站响应延迟(ms),${o.busConfig.modbusTurnaroundDelay}`), t.push(`响应超时(ms),${o.busConfig.modbusResponseTimeout}`)), t.push(""), t.push("总线利用率统计"), t.push(`当前利用率(%),${o.utilization.currentUtilization.toFixed(2)}`), t.push(`平均利用率(%),${o.utilization.avgUtilization.toFixed(2)}`), t.push(`峰值利用率(%),${o.utilization.peakUtilization.toFixed(2)}`), t.push(`总线忙时间(ms),${o.utilization.totalBusyTime}`), t.push(`总线闲时间(ms),${o.utilization.totalIdleTime}`), t.push(`总运行时间(ms),${o.utilization.totalRuntime}`), t.push(""), t.push("节点统计"), t.push("节点ID,节点名称,角色,发送成功数,冲突次数,平均延时(ms),最大延时(ms),Modbus请求数,Modbus响应数,Modbus超时数,总线占用率(%)");
  for (const e of o.nodes) {
    const s = o.utilization.perNodeStats[e.config.id];
    t.push([
      e.config.id,
      e.config.name,
      e.config.role === "master" ? "主站" : "从站",
      e.state.sendCount,
      e.state.conflictCount,
      e.state.avgSendDelay.toFixed(2),
      e.state.maxSendDelay.toFixed(2),
      e.state.modbusRequestCount || 0,
      e.state.modbusResponseCount || 0,
      e.state.modbusTimeoutCount || 0,
      s ? s.utilization.toFixed(2) : "0.00"
    ].join(","));
  }
  return t.join(`
`);
}
const D = h.dirname(k(import.meta.url));
process.env.APP_ROOT = h.join(D, "../..");
const b = process.env.VITE_DEV_SERVER_URL, W = h.join(process.env.APP_ROOT, "dist-electron"), E = h.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = b ? h.join(process.env.APP_ROOT, "public") : E;
let u = null, d = null, g = null;
function M() {
  u = new v({
    width: 1440,
    height: 900,
    minWidth: 1280,
    minHeight: 800,
    backgroundColor: "#0f172a",
    titleBarStyle: "hiddenInset",
    icon: h.join(process.env.VITE_PUBLIC, "favicon.svg"),
    webPreferences: {
      preload: h.join(D, "../preload/index.mjs"),
      contextIsolation: !0,
      nodeIntegration: !1,
      sandbox: !1
    }
  });
  const o = (t, ...e) => {
    u && !u.isDestroyed() && u.webContents.send(t, ...e);
  };
  d = new $(), g = new z(d), A(d, g, o), g.initializeDefaultNodes(4), b ? (u.loadURL(b), u.webContents.openDevTools()) : u.loadFile(h.join(E, "index.html")), u.webContents.setWindowOpenHandler(({ url: t }) => (t.startsWith("https:") && U.openExternal(t), { action: "deny" }));
}
f.whenReady().then(M);
f.on("window-all-closed", () => {
  d && (d.destroy(), d = null), g = null, u = null, process.platform !== "darwin" && f.quit();
});
f.on("second-instance", () => {
  u && (u.isMinimized() && u.restore(), u.focus());
});
f.on("activate", () => {
  const o = v.getAllWindows();
  o.length ? o[0].focus() : M();
});
export {
  W as MAIN_DIST,
  E as RENDERER_DIST,
  b as VITE_DEV_SERVER_URL
};
