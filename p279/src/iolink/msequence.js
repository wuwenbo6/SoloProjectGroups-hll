const { MC_OPCODE, AC_OPCODE, M_SEQUENCE_TYPE, checksum, buildMasterFrame, parseDeviceFrame } = require('./protocol');

const MSEQ_STATE = {
  IDLE: 'IDLE',
  MC_SEND: 'MC_SEND',
  WAIT_AC: 'WAIT_AC',
  AC_RECEIVED: 'AC_RECEIVED',
  COMPLETE: 'COMPLETE',
  TIMEOUT: 'TIMEOUT',
  ERROR: 'ERROR',
};

const MSEQ_TYPE_LABEL = {
  [M_SEQUENCE_TYPE.TYPE_0]: 'Type0_ProcessData',
  [M_SEQUENCE_TYPE.TYPE_1]: 'Type1_ISDU',
  [M_SEQUENCE_TYPE.TYPE_2]: 'Type2_Event',
  [M_SEQUENCE_TYPE.TYPE_3]: 'Type3_Page',
};

const DEFAULT_TIMEOUT_MS = 50;
const MAX_RETRIES = 3;

class MSequenceTransaction {
  constructor(type, mcFrame, portNumber) {
    this.id = MSequenceTransaction._nextId++;
    this.type = type;
    this.mcFrame = mcFrame;
    this.acFrame = null;
    this.portNumber = portNumber;
    this.state = MSEQ_STATE.IDLE;
    this.createdAt = Date.now();
    this.sentAt = null;
    this.completedAt = null;
    this.retries = 0;
    this.error = null;
    this.result = null;
    this.onComplete = null;
  }

  transition(newState) {
    const oldState = this.state;
    this.state = newState;
    return { oldState, newState, transactionId: this.id, type: this.type };
  }

  get elapsed() {
    if (this.completedAt) return this.completedAt - this.sentAt;
    if (this.sentAt) return Date.now() - this.sentAt;
    return 0;
  }

  get label() {
    return MSEQ_TYPE_LABEL[this.type] || `Type${this.type}`;
  }
}
MSequenceTransaction._nextId = 1;

class MSequenceStateMachine {
  constructor(options = {}) {
    this.timeout = options.timeout || DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries || MAX_RETRIES;
    this.onStateChange = null;
    this.onTransactionComplete = null;
    this.onLog = null;

    this._transactions = new Map();
    this._activeTransactions = new Map();
    this._pendingQueue = [];
    this._history = [];
    this._maxHistory = 200;
    this._stats = {
      totalSent: 0,
      totalReceived: 0,
      totalTimeout: 0,
      totalError: 0,
      byType: {},
    };
    for (const t of Object.values(M_SEQUENCE_TYPE)) {
      this._stats.byType[t] = { sent: 0, received: 0, timeout: 0, error: 0 };
    }
  }

  _log(level, message) {
    if (this.onLog) this.onLog({ level, message, timestamp: Date.now() });
  }

  _updateTransactionState(transaction, newState) {
    const change = transaction.transition(newState);
    if (this.onStateChange) {
      this.onStateChange(change);
    }
  }

  createTransaction(type, mcFrame, portNumber) {
    const tx = new MSequenceTransaction(type, mcFrame, portNumber);
    this._transactions.set(tx.id, tx);
    return tx;
  }

  registerActiveTransaction(tx) {
    this._activeTransactions.set(tx.portNumber, tx);
  }

  advanceTransaction(tx, newState) {
    this._updateTransactionState(tx, newState);
  }

  recordSend(tx) {
    this._stats.totalSent++;
    this._stats.byType[tx.type].sent++;
  }

  async executeTransaction(type, mcFrame, portNumber, sendFn) {
    const tx = this.createTransaction(type, mcFrame, portNumber);

    return new Promise((resolve, reject) => {
      tx.onComplete = (completedTx) => {
        if (completedTx.state === MSEQ_STATE.COMPLETE) {
          resolve(completedTx.result);
        } else {
          reject(new Error(completedTx.error || `Transaction failed: ${completedTx.state}`));
        }
      };

      this._activeTransactions.set(portNumber, tx);
      this._sendTransaction(tx, sendFn);
    });
  }

  _sendTransaction(tx, sendFn) {
    this._updateTransactionState(tx, MSEQ_STATE.MC_SEND);
    tx.sentAt = Date.now();

    this._stats.totalSent++;
    this._stats.byType[tx.type].sent++;

    try {
      sendFn(tx.mcFrame);
      this._updateTransactionState(tx, MSEQ_STATE.WAIT_AC);

      tx._timeoutHandle = setTimeout(() => {
        this._handleTimeout(tx, sendFn);
      }, this.timeout);
    } catch (err) {
      tx.error = err.message;
      this._updateTransactionState(tx, MSEQ_STATE.ERROR);
      this._stats.totalError++;
      this._stats.byType[tx.type].error++;
      this._finalizeTransaction(tx);
    }
  }

  _handleTimeout(tx, sendFn) {
    if (tx.state !== MSEQ_STATE.WAIT_AC) return;

    if (tx.retries < this.maxRetries) {
      tx.retries++;
      this._log('warn', `[Port ${tx.portNumber}] ${tx.label} timeout, retry ${tx.retries}/${this.maxRetries}`);
      this._updateTransactionState(tx, MSEQ_STATE.MC_SEND);
      this._sendTransaction(tx, sendFn);
    } else {
      this._stats.totalTimeout++;
      this._stats.byType[tx.type].timeout++;
      tx.error = `Timeout after ${tx.retries} retries`;
      this._updateTransactionState(tx, MSEQ_STATE.TIMEOUT);
      this._finalizeTransaction(tx);
    }
  }

  receiveAck(portNumber, rawFrame) {
    const tx = this._activeTransactions.get(portNumber);
    if (!tx || tx.state !== MSEQ_STATE.WAIT_AC) {
      this._log('warn', `[Port ${portNumber}] Unexpected ACK, no pending transaction`);
      return null;
    }

    if (tx._timeoutHandle) {
      clearTimeout(tx._timeoutHandle);
      tx._timeoutHandle = null;
    }

    const parsed = parseDeviceFrame(rawFrame);
    if (!parsed) {
      tx.error = 'Invalid frame (parse failed)';
      this._updateTransactionState(tx, MSEQ_STATE.ERROR);
      this._stats.totalError++;
      this._stats.byType[tx.type].error++;
      this._finalizeTransaction(tx);
      return null;
    }

    if (!parsed.valid) {
      tx.error = 'Checksum mismatch';
      this._updateTransactionState(tx, MSEQ_STATE.ERROR);
      this._stats.totalError++;
      this._stats.byType[tx.type].error++;
      this._finalizeTransaction(tx);
      return null;
    }

    tx.acFrame = parsed;
    this._updateTransactionState(tx, MSEQ_STATE.AC_RECEIVED);

    this._stats.totalReceived++;
    this._stats.byType[tx.type].received++;

    if (parsed.ack !== AC_OPCODE.OK) {
      tx.error = `Device NACK: ack=0x${parsed.ack.toString(16)}`;
      this._updateTransactionState(tx, MSEQ_STATE.ERROR);
      this._stats.totalError++;
      this._stats.byType[tx.type].error++;
      this._finalizeTransaction(tx);
      return null;
    }

    tx.result = {
      inputData: parsed.inputData,
      ack: parsed.ack,
    };

    this._updateTransactionState(tx, MSEQ_STATE.COMPLETE);
    this._finalizeTransaction(tx);
    return tx;
  }

  _finalizeTransaction(tx) {
    tx.completedAt = Date.now();
    this._activeTransactions.delete(tx.portNumber);

    this._history.push({
      id: tx.id,
      type: tx.type,
      typeLabel: tx.label,
      portNumber: tx.portNumber,
      state: tx.state,
      error: tx.error,
      retries: tx.retries,
      elapsed: tx.elapsed,
      createdAt: tx.createdAt,
      completedAt: tx.completedAt,
      mcFrameHex: tx.mcFrame.toString('hex'),
      acFrameHex: tx.acFrame ? tx.acFrame.inputData.toString('hex') : null,
    });

    if (this._history.length > this._maxHistory) {
      this._history.shift();
    }

    if (tx.onComplete) {
      tx.onComplete(tx);
    }

    if (this.onTransactionComplete) {
      this.onTransactionComplete(tx);
    }
  }

  getActiveTransaction(portNumber) {
    return this._activeTransactions.get(portNumber) || null;
  }

  getStats() {
    return { ...this._stats };
  }

  getHistory(count) {
    return this._history.slice(-(count || 50));
  }

  resetStats() {
    this._stats = {
      totalSent: 0,
      totalReceived: 0,
      totalTimeout: 0,
      totalError: 0,
      byType: {},
    };
    for (const t of Object.values(M_SEQUENCE_TYPE)) {
      this._stats.byType[t] = { sent: 0, received: 0, timeout: 0, error: 0 };
    }
    this._history = [];
  }
}

class CyclicScheduler {
  constructor(master) {
    this.master = master;
    this.interval = 100;
    this.timer = null;
    this._cycleCount = 0;
    this._isduQueue = [];
    this._eventPollInterval = 10;
    this._running = false;
    this.onCycleComplete = null;
  }

  start(interval) {
    if (this._running) return;
    this.interval = interval || this.interval;
    this._running = true;
    this._cycleCount = 0;
    this.timer = setInterval(() => this._tick(), this.interval);
  }

  stop() {
    this._running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  get cycleCount() {
    return this._cycleCount;
  }

  queueISDURead(portNumber, index, subindex) {
    this._isduQueue.push({
      type: M_SEQUENCE_TYPE.TYPE_1,
      portNumber,
      index,
      subindex: subindex || 0,
      direction: 'read',
    });
  }

  queueISDUWrite(portNumber, index, subindex, data) {
    this._isduQueue.push({
      type: M_SEQUENCE_TYPE.TYPE_1,
      portNumber,
      index,
      subindex: subindex || 0,
      direction: 'write',
      data,
    });
  }

  _tick() {
    this._cycleCount++;
    for (const [portNumber, device] of this.master.devices) {
      if (device.state !== 'OPERATE') continue;

      this._executeType0(portNumber, device);

      if (this._cycleCount % this._eventPollInterval === 0) {
        this._executeType2(portNumber, device);
      }

      if (this._isduQueue.length > 0) {
        const pending = this._isduQueue.filter(q => q.portNumber === portNumber);
        if (pending.length > 0) {
          const item = this._isduQueue.splice(this._isduQueue.indexOf(pending[0]), 1)[0];
          this._executeType1(portNumber, device, item);
        }
      }
    }

    if (this.onCycleComplete) {
      this.onCycleComplete(this._cycleCount);
    }
  }

  _executeType0(portNumber, device) {
    const mcFrame = buildMasterFrame(MC_OPCODE.TYPE_0_OD0, []);
    const sm = this.master.stateMachine;

    if (this.master.transport.simulated) {
      const inputData = device.handleProcessDataExchange([]);
      const acFrame = Buffer.from([AC_OPCODE.OK, ...inputData, checksum([AC_OPCODE.OK, ...inputData])]);

      const tx = sm.createTransaction(M_SEQUENCE_TYPE.TYPE_0, mcFrame, portNumber);
      sm.registerActiveTransaction(tx);
      sm.advanceTransaction(tx, MSEQ_STATE.MC_SEND);
      tx.sentAt = Date.now();
      sm.recordSend(tx);

      sm.advanceTransaction(tx, MSEQ_STATE.WAIT_AC);
      sm.receiveAck(portNumber, acFrame);

      if (tx.state === MSEQ_STATE.COMPLETE && this.master.onDeviceUpdate) {
        this.master.onDeviceUpdate({
          port: portNumber,
          deviceInfo: device.getDeviceInfo(),
          processData: device.getProcessData(),
          isduList: device.getISDUList(),
          events: device.getEvents(),
          mseqState: sm.getActiveTransaction(portNumber)?.state || MSEQ_STATE.IDLE,
        });
      }
    } else {
      sm.executeTransaction(
        M_SEQUENCE_TYPE.TYPE_0,
        mcFrame,
        portNumber,
        (frame) => this.master.transport.write(frame)
      ).then(result => {
        if (this.master.onDeviceUpdate) {
          this.master.onDeviceUpdate({
            port: portNumber,
            deviceInfo: device.getDeviceInfo(),
            processData: device.getProcessData(),
            mseqState: MSEQ_STATE.IDLE,
          });
        }
      }).catch(err => {
        this.master._log('error', `[Port ${portNumber}] Type0 failed: ${err.message}`);
      });
    }
  }

  _executeType2(portNumber, device) {
    if (device.getPendingEventCount() === 0) return;

    const mcFrame = buildMasterFrame(MC_OPCODE.TYPE_2, []);
    const sm = this.master.stateMachine;

    if (this.master.transport.simulated) {
      const eventResult = device.handleEventRequest();
      if (!eventResult.hasEvent) return;

      const acFrame = Buffer.from([AC_OPCODE.OK, ...eventResult.data, checksum([AC_OPCODE.OK, ...eventResult.data])]);

      const tx = sm.createTransaction(M_SEQUENCE_TYPE.TYPE_2, mcFrame, portNumber);
      sm.registerActiveTransaction(tx);
      sm.advanceTransaction(tx, MSEQ_STATE.MC_SEND);
      tx.sentAt = Date.now();
      sm.recordSend(tx);
      sm.advanceTransaction(tx, MSEQ_STATE.WAIT_AC);
      sm.receiveAck(portNumber, acFrame);

      if (tx.state === MSEQ_STATE.COMPLETE && this.master.onEvent) {
        this.master.onEvent({
          port: portNumber,
          ...eventResult.event,
        });
      }
    } else {
      sm.executeTransaction(
        M_SEQUENCE_TYPE.TYPE_2,
        mcFrame,
        portNumber,
        (frame) => this.master.transport.write(frame)
      ).then(result => {
        this.master._handleIncomingData(Buffer.from([result.ack, ...result.inputData]));
      }).catch(err => {
        this.master._log('error', `[Port ${portNumber}] Type2 failed: ${err.message}`);
      });
    }
  }

  _executeType1(portNumber, device, item) {
    const sm = this.master.stateMachine;
    let mcFrame;

    if (item.direction === 'read') {
      const idxLo = item.index & 0xFF;
      const idxHi = (item.index >> 8) & 0xFF;
      mcFrame = buildMasterFrame(MC_OPCODE.TYPE_1_READ, [idxLo, idxHi, item.subindex]);
    } else {
      const idxLo = item.index & 0xFF;
      const idxHi = (item.index >> 8) & 0xFF;
      mcFrame = buildMasterFrame(MC_OPCODE.TYPE_1_WRITE, [idxLo, idxHi, item.subindex, ...item.data]);
    }

    if (this.master.transport.simulated) {
      let deviceResult;
      if (item.direction === 'read') {
        deviceResult = device.handleISDURead(item.index, item.subindex);
      } else {
        deviceResult = device.handleISDUWrite(item.index, item.subindex, Buffer.from(item.data));
      }

      const ack = deviceResult.error ? deviceResult.ackCode : AC_OPCODE.OK;
      const respData = deviceResult.error ? [] : [...(deviceResult.data || [])];
      const acFrame = Buffer.from([ack, ...respData, checksum([ack, ...respData])]);

      const tx = sm.createTransaction(M_SEQUENCE_TYPE.TYPE_1, mcFrame, portNumber);
      sm.registerActiveTransaction(tx);
      sm.advanceTransaction(tx, MSEQ_STATE.MC_SEND);
      tx.sentAt = Date.now();
      sm.recordSend(tx);
      sm.advanceTransaction(tx, MSEQ_STATE.WAIT_AC);
      sm.receiveAck(portNumber, acFrame);
    } else {
      sm.executeTransaction(
        M_SEQUENCE_TYPE.TYPE_1,
        mcFrame,
        portNumber,
        (frame) => this.master.transport.write(frame)
      ).catch(err => {
        this.master._log('error', `[Port ${portNumber}] Type1 failed: ${err.message}`);
      });
    }
  }
}

module.exports = {
  MSEQ_STATE,
  MSEQ_TYPE_LABEL,
  MSequenceTransaction,
  MSequenceStateMachine,
  CyclicScheduler,
};
