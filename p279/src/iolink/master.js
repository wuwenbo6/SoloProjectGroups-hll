const {
  COM_SPEED,
  DEVICE_STATE,
  MC_OPCODE,
  AC_OPCODE,
  M_SEQUENCE_TYPE,
  buildMasterFrame,
  parseDeviceFrame,
  buildISDUReadRequest,
  buildISDUWriteRequest,
  buildType0Frame,
  buildType2Frame,
  buildType3Frame,
  buildWakeupPulse,
  checksum,
} = require('./protocol');

const { MSequenceStateMachine, CyclicScheduler, MSEQ_STATE } = require('./msequence');
const IoLinkDevice = require('./device');
const UartTransport = require('./uart');

class IoLinkMaster {
  constructor() {
    this.transport = new UartTransport();
    this.devices = new Map();
    this.state = DEVICE_STATE.INACTIVE;
    this.currentComSpeed = COM_SPEED.COM1;

    this.stateMachine = new MSequenceStateMachine({
      timeout: 50,
      maxRetries: 3,
    });

    this.scheduler = new CyclicScheduler(this);

    this.onDeviceUpdate = null;
    this.onEvent = null;
    this.onStateChange = null;
    this.onLog = null;

    this._cycleCount = 0;
  }

  _log(level, message) {
    if (this.onLog) {
      this.onLog({ level, message, timestamp: Date.now() });
    }
  }

  _setState(newState) {
    const oldState = this.state;
    this.state = newState;
    if (oldState !== newState && this.onStateChange) {
      this.onStateChange({ oldState, newState });
    }
  }

  async listSerialPorts() {
    return this.transport.listPorts();
  }

  async connect(portPath, baudRate) {
    try {
      const result = await this.transport.open(portPath, baudRate);
      this._log('info', `Transport opened: ${result.simulated ? 'SIMULATED' : 'REAL'} @ ${result.baudRate} baud`);

      this.stateMachine.onLog = (log) => this._log(log.level, log.message);
      this.stateMachine.onStateChange = (change) => {
        this._log('debug', `[MSeq] TX#${change.transactionId} ${change.oldState} → ${change.newState}`);
      };

      if (result.simulated) {
        this._addSimulatedDevices();
      }

      this.transport.onData = (data) => {
        this._handleIncomingData(data);
      };

      return { success: true, simulated: result.simulated };
    } catch (err) {
      this._log('error', `Connection failed: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  async disconnect() {
    this.scheduler.stop();
    await this.transport.close();
    this.devices.clear();
    this.stateMachine.resetStats();
    this._setState(DEVICE_STATE.INACTIVE);
    this._log('info', 'Disconnected');
  }

  _addSimulatedDevices() {
    const tempSensor = new IoLinkDevice({
      vendorId: 0x0042,
      deviceId: 0x0001,
      deviceFunction: 0x0001,
      serialNumber: 'SN-2024-T100',
      hardwareRevision: '1.0',
      firmwareRevision: '2.1.3',
      vendorName: 'ACME Sensors',
      deviceName: 'Temp Sensor T100',
      productId: 'T100-IO-001',
    });

    const pressureSensor = new IoLinkDevice({
      vendorId: 0x0042,
      deviceId: 0x0002,
      deviceFunction: 0x0002,
      serialNumber: 'SN-2024-P200',
      hardwareRevision: '2.0',
      firmwareRevision: '1.5.0',
      vendorName: 'ACME Sensors',
      deviceName: 'Pressure Sensor P200',
      productId: 'P200-IO-002',
    });

    this.devices.set(1, tempSensor);
    this.devices.set(2, pressureSensor);

    this._log('info', `Simulated devices added: Port 1 (Temp), Port 2 (Pressure)`);
  }

  async wakeupDevice(portNumber, comSpeed) {
    const device = this.devices.get(portNumber);
    if (!device) {
      this._log('error', `No device on port ${portNumber}`);
      return { success: false, error: 'No device on port' };
    }

    this.currentComSpeed = comSpeed || COM_SPEED.COM2;

    if (this.transport.simulated) {
      device.wakeup(this.currentComSpeed.code);
      this._log('info', `Device on port ${portNumber} woken up (simulated) @ ${this.currentComSpeed.name}`);
    } else {
      const wakeupPulse = buildWakeupPulse();
      await this.transport.write(wakeupPulse);
      this._log('info', `Wake-up pulse sent to port ${portNumber}`);
    }

    this._setState(DEVICE_STATE.PREOPERATE);
    return { success: true, device: device.getDeviceInfo() };
  }

  async startOperate(portNumber) {
    const device = this.devices.get(portNumber);
    if (!device) {
      return { success: false, error: 'No device on port' };
    }

    device.startOperate();
    this._setState(DEVICE_STATE.OPERATE);

    this.scheduler.start(100);
    this._log('info', `Port ${portNumber} started in OPERATE mode, cyclic scheduler running`);
    return { success: true };
  }

  async stopOperate(portNumber) {
    const device = this.devices.get(portNumber);
    if (!device) return { success: false, error: 'No device on port' };

    device.stopOperate();
    this.scheduler.stop();
    this._setState(DEVICE_STATE.INACTIVE);
    this._log('info', `Port ${portNumber} stopped, cyclic scheduler halted`);
    return { success: true };
  }

  async readISDU(portNumber, index, subindex) {
    const device = this.devices.get(portNumber);
    if (!device) return { success: false, error: 'No device on port' };

    if (this.transport.simulated) {
      const result = device.handleISDURead(index, subindex || 0);
      if (result.error) {
        this._log('warn', `ISDU read failed: index 0x${index.toString(16)}, ack=${result.ackCode}`);
        return { success: false, error: `Device error: ack=${result.ackCode}` };
      }

      const param = device.isduParameters.get(index);
      this._log('info', `[MSeq Type1] ISDU read: index 0x${index.toString(16)} = ${param ? param.value : 'N/A'}`);
      return {
        success: true,
        index,
        value: param ? param.value : null,
        type: param ? param.type : 'unknown',
        name: param ? param.name : 'Unknown',
      };
    } else {
      const si = subindex || 0;
      this.scheduler.queueISDURead(portNumber, index, si);
      this._log('info', `[MSeq Type1] ISDU read queued: index 0x${index.toString(16)}`);
      return { success: true, index, pending: true };
    }
  }

  async writeISDU(portNumber, index, subindex, value) {
    const device = this.devices.get(portNumber);
    if (!device) return { success: false, error: 'No device on port' };

    if (this.transport.simulated) {
      const param = device.isduParameters.get(index);
      if (!param) return { success: false, error: 'Parameter not found' };
      if (param.access === 'ro') return { success: false, error: 'Parameter is read-only' };

      let data;
      if (param.type === 'string') {
        data = Buffer.from(String(value), 'utf8');
      } else if (param.type === 'uint16') {
        data = Buffer.alloc(2);
        data.writeUInt16BE(Number(value), 0);
      } else if (param.type === 'int16') {
        data = Buffer.alloc(2);
        data.writeInt16BE(Number(value), 0);
      } else if (param.type === 'uint8') {
        data = Buffer.alloc(1);
        data.writeUInt8(Number(value), 0);
      } else if (param.type === 'float32') {
        data = Buffer.alloc(4);
        data.writeFloatBE(Number(value), 0);
      } else {
        data = Buffer.from([0x00]);
      }

      const result = device.handleISDUWrite(index, subindex || 0, data);
      if (result.error) {
        return { success: false, error: `Device error: ack=${result.ackCode}` };
      }

      this._log('info', `[MSeq Type1] ISDU write: index 0x${index.toString(16)} = ${value}`);
      return { success: true, index, value };
    } else {
      this.scheduler.queueISDUWrite(portNumber, index, subindex || 0, [value]);
      return { success: true, index, pending: true };
    }
  }

  async readPage(portNumber, pageNumber) {
    const device = this.devices.get(portNumber);
    if (!device) return { success: false, error: 'No device on port' };

    if (this.transport.simulated) {
      const pageData = device.handlePageRequest(pageNumber);
      this._log('info', `[MSeq Type3] Page read: port ${portNumber}, page ${pageNumber}`);
      return {
        success: true,
        pageNumber,
        data: [...pageData],
        deviceInfo: device.getDeviceInfo(),
      };
    } else {
      const frame = buildType3Frame(pageNumber);
      await this.transport.write(frame);
      return { success: true, pageNumber, pending: true };
    }
  }

  getDeviceList() {
    const list = [];
    for (const [port, device] of this.devices) {
      list.push({
        port,
        info: device.getDeviceInfo(),
        processData: device.getProcessData(),
        isduList: device.getISDUList(),
        recentEvents: device.getEvents().slice(-10),
      });
    }
    return list;
  }

  getDevice(portNumber) {
    return this.devices.get(portNumber) || null;
  }

  getMSeqStats() {
    return this.stateMachine.getStats();
  }

  getMSeqHistory(count) {
    return this.stateMachine.getHistory(count);
  }

  getMSeqActiveTransaction(portNumber) {
    const tx = this.stateMachine.getActiveTransaction(portNumber);
    if (!tx) return null;
    return {
      id: tx.id,
      type: tx.type,
      typeLabel: tx.label,
      state: tx.state,
      portNumber: tx.portNumber,
      retries: tx.retries,
      elapsed: tx.elapsed,
    };
  }

  getCycleCount() {
    return this.scheduler.cycleCount;
  }

  _handleIncomingData(data) {
    const frame = parseDeviceFrame(data);
    if (!frame || !frame.valid) {
      this._log('warn', `Invalid frame received: ${data.toString('hex')}`);
      return;
    }
    this._log('debug', `Frame received: ack=0x${frame.ack.toString(16)}, data=${frame.inputData.toString('hex')}`);
  }
}

module.exports = IoLinkMaster;
