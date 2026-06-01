const { COM_SPEED, DEVICE_STATE, ISDU_INDEX, EVENT_TYPE, MC_OPCODE, AC_OPCODE, checksum, parseDeviceFrame } = require('./protocol');

const DEV_MSEQ_STATE = {
  IDLE: 'IDLE',
  MC_RECEIVED: 'MC_RECEIVED',
  PROCESSING: 'PROCESSING',
  AC_SEND: 'AC_SEND',
  COMPLETE: 'COMPLETE',
  ERROR: 'ERROR',
};

class DeviceMSequenceHandler {
  constructor(device) {
    this.device = device;
    this.state = DEV_MSEQ_STATE.IDLE;
    this.lastMcFrame = null;
    this.lastAcFrame = null;
    this.transactionCount = 0;
    this.errorCount = 0;
    this.history = [];
    this._maxHistory = 100;
  }

  processMcFrame(rawFrame) {
    this.transactionCount++;

    const parsed = parseDeviceFrame(rawFrame);
    if (!parsed || !parsed.valid) {
      this.state = DEV_MSEQ_STATE.ERROR;
      this.errorCount++;
      this._addHistory('ERROR', rawFrame, null, 'Invalid MC frame / checksum mismatch');
      return this._buildErrorFrame(AC_OPCODE.ERROR);
    }

    this.lastMcFrame = parsed;
    this.state = DEV_MSEQ_STATE.MC_RECEIVED;

    const opcode = rawFrame[0];
    const mseqType = this._classifyMSeqType(opcode);

    this.state = DEV_MSEQ_STATE.PROCESSING;

    let acFrame;
    let detail;

    switch (mseqType) {
      case 'Type0':
        detail = this._handleType0(rawFrame);
        acFrame = this._buildAckFrame(detail.ack, detail.data);
        break;
      case 'Type1_Read':
        detail = this._handleType1Read(rawFrame);
        acFrame = this._buildAckFrame(detail.ack, detail.data);
        break;
      case 'Type1_Write':
        detail = this._handleType1Write(rawFrame);
        acFrame = this._buildAckFrame(detail.ack, detail.data);
        break;
      case 'Type2':
        detail = this._handleType2(rawFrame);
        acFrame = this._buildAckFrame(detail.ack, detail.data);
        break;
      case 'Type3':
        detail = this._handleType3(rawFrame);
        acFrame = this._buildAckFrame(detail.ack, detail.data);
        break;
      default:
        detail = { ack: AC_OPCODE.NOT_SUPPORTED, data: [], desc: 'Unknown opcode' };
        acFrame = this._buildErrorFrame(AC_OPCODE.NOT_SUPPORTED);
    }

    this.state = DEV_MSEQ_STATE.AC_SEND;
    this.lastAcFrame = acFrame;

    this._addHistory(mseqType, rawFrame, acFrame, detail.desc || 'OK');

    this.state = DEV_MSEQ_STATE.COMPLETE;
    setTimeout(() => {
      if (this.state === DEV_MSEQ_STATE.COMPLETE) {
        this.state = DEV_MSEQ_STATE.IDLE;
      }
    }, 5);

    return acFrame;
  }

  _classifyMSeqType(opcode) {
    if ((opcode & 0xC0) === 0x00) return 'Type0';
    if (opcode === MC_OPCODE.TYPE_1_READ) return 'Type1_Read';
    if (opcode === MC_OPCODE.TYPE_1_WRITE) return 'Type1_Write';
    if ((opcode & 0xC0) === 0x80) return 'Type2';
    if ((opcode & 0xC0) === 0xC0) return 'Type3';
    return 'Unknown';
  }

  _handleType0(rawFrame) {
    if (this.device.state !== DEVICE_STATE.OPERATE) {
      return { ack: AC_OPCODE.ERROR, data: [], desc: 'Not in OPERATE' };
    }
    const outputData = rawFrame.length > 2 ? [...rawFrame.slice(1, -1)] : [];
    const inputData = this.device.handleProcessDataExchange(outputData);
    if (!inputData) {
      return { ack: AC_OPCODE.ERROR, data: [], desc: 'Process data exchange failed' };
    }
    return { ack: AC_OPCODE.OK, data: [...inputData], desc: `PD IN=${inputData.toString('hex')}` };
  }

  _handleType1Read(rawFrame) {
    if (rawFrame.length < 4) {
      return { ack: AC_OPCODE.ERROR, data: [], desc: 'Frame too short for ISDU read' };
    }
    const index = rawFrame[1] | (rawFrame[2] << 8);
    const subindex = rawFrame[3];

    const result = this.device.handleISDURead(index, subindex);
    if (result.error) {
      return { ack: result.ackCode, data: [], desc: `ISDU read fail idx=0x${index.toString(16)}` };
    }
    return { ack: AC_OPCODE.OK, data: [...result.data], desc: `ISDU read idx=0x${index.toString(16)} OK` };
  }

  _handleType1Write(rawFrame) {
    if (rawFrame.length < 5) {
      return { ack: AC_OPCODE.ERROR, data: [], desc: 'Frame too short for ISDU write' };
    }
    const index = rawFrame[1] | (rawFrame[2] << 8);
    const subindex = rawFrame[3];
    const data = Buffer.from(rawFrame.slice(4, -1));

    const result = this.device.handleISDUWrite(index, subindex, data);
    if (result.error) {
      return { ack: result.ackCode, data: [], desc: `ISDU write fail idx=0x${index.toString(16)}` };
    }
    return { ack: AC_OPCODE.OK, data: [], desc: `ISDU write idx=0x${index.toString(16)} OK` };
  }

  _handleType2(rawFrame) {
    const eventResult = this.device.handleEventRequest();
    if (!eventResult.hasEvent) {
      return { ack: AC_OPCODE.OK, data: [0x00], desc: 'No pending events' };
    }
    return { ack: AC_OPCODE.OK, data: [...eventResult.data], desc: `Event code=0x${eventResult.event.code.toString(16)}` };
  }

  _handleType3(rawFrame) {
    if (rawFrame.length < 2) {
      return { ack: AC_OPCODE.ERROR, data: [], desc: 'Frame too short for page read' };
    }
    const pageNumber = rawFrame[1];
    const pageData = this.device.handlePageRequest(pageNumber);
    return { ack: AC_OPCODE.OK, data: [...pageData], desc: `Page ${pageNumber} read` };
  }

  _buildAckFrame(ack, data) {
    const arr = [ack, ...(data || [])];
    arr.push(checksum(arr));
    return Buffer.from(arr);
  }

  _buildErrorFrame(ackCode) {
    const arr = [ackCode || AC_OPCODE.ERROR];
    arr.push(checksum(arr));
    return Buffer.from(arr);
  }

  _addHistory(type, mcFrame, acFrame, desc) {
    this.history.push({
      type,
      mcHex: mcFrame ? mcFrame.toString('hex') : '',
      acHex: acFrame ? acFrame.toString('hex') : '',
      desc,
      timestamp: Date.now(),
    });
    if (this.history.length > this._maxHistory) {
      this.history.shift();
    }
  }

  getStats() {
    return {
      state: this.state,
      transactionCount: this.transactionCount,
      errorCount: this.errorCount,
      historyLength: this.history.length,
    };
  }

  getRecentHistory(count) {
    return this.history.slice(-(count || 20));
  }
}

class IoLinkDevice {
  constructor(config = {}) {
    this.vendorId = config.vendorId || 0x0042;
    this.deviceId = config.deviceId || 0x0001;
    this.deviceFunction = config.deviceFunction || 0x0001;
    this.serialNumber = config.serialNumber || 'SN-2024-00001';
    this.hardwareRevision = config.hardwareRevision || '1.0';
    this.firmwareRevision = config.firmwareRevision || '2.1.3';
    this.vendorName = config.vendorName || 'ACME Sensors';
    this.deviceName = config.deviceName || 'Temperature Sensor T100';
    this.productId = config.productId || 'T100-IO-001';

    this.state = DEVICE_STATE.INACTIVE;
    this.comSpeed = COM_SPEED.COM1;
    this.cycleCounter = 0;

    this.processDataInput = Buffer.from([0x00, 0x00]);
    this.processDataOutput = Buffer.from([0x00]);

    this.pendingEvents = [];
    this.eventHistory = [];

    this.alarmStorage = [];
    this._maxAlarmStorage = 500;
    this._alarmHighActive = false;
    this._alarmLowActive = false;

    this.isduParameters = new Map();
    this._initISDU();

    this.mseqHandler = new DeviceMSequenceHandler(this);

    this.simulationInterval = null;
    this._simulateProcessData = this._simulateProcessData.bind(this);
  }

  _initISDU() {
    this.isduParameters.set(ISDU_INDEX.VENDOR_ID, {
      name: 'Vendor ID',
      value: this.vendorId,
      type: 'uint16',
      access: 'ro',
    });
    this.isduParameters.set(ISDU_INDEX.DEVICE_ID, {
      name: 'Device ID',
      value: this.deviceId,
      type: 'uint16',
      access: 'ro',
    });
    this.isduParameters.set(ISDU_INDEX.DEVICE_FUNCTION, {
      name: 'Device Function',
      value: this.deviceFunction,
      type: 'uint16',
      access: 'ro',
    });
    this.isduParameters.set(ISDU_INDEX.SERIAL_NUMBER, {
      name: 'Serial Number',
      value: this.serialNumber,
      type: 'string',
      access: 'ro',
    });
    this.isduParameters.set(ISDU_INDEX.HARDWARE_REVISION, {
      name: 'Hardware Revision',
      value: this.hardwareRevision,
      type: 'string',
      access: 'ro',
    });
    this.isduParameters.set(ISDU_INDEX.FIRMWARE_REVISION, {
      name: 'Firmware Revision',
      value: this.firmwareRevision,
      type: 'string',
      access: 'ro',
    });
    this.isduParameters.set(ISDU_INDEX.VENDOR_NAME, {
      name: 'Vendor Name',
      value: this.vendorName,
      type: 'string',
      access: 'ro',
    });
    this.isduParameters.set(ISDU_INDEX.DEVICE_NAME, {
      name: 'Device Name',
      value: this.deviceName,
      type: 'string',
      access: 'ro',
    });
    this.isduParameters.set(ISDU_INDEX.PRODUCT_ID, {
      name: 'Product ID',
      value: this.productId,
      type: 'string',
      access: 'ro',
    });
    this.isduParameters.set(ISDU_INDEX.PROCESS_DATA_INPUT, {
      name: 'Process Data Input',
      value: 0,
      type: 'uint16',
      access: 'ro',
    });
    this.isduParameters.set(ISDU_INDEX.DEVICE_STATUS, {
      name: 'Device Status',
      value: 0,
      type: 'uint8',
      access: 'ro',
    });
    this.isduParameters.set(0x0090, {
      name: 'Measurement Range Min',
      value: -40,
      type: 'int16',
      access: 'rw',
    });
    this.isduParameters.set(0x0091, {
      name: 'Measurement Range Max',
      value: 150,
      type: 'int16',
      access: 'rw',
    });
    this.isduParameters.set(0x0092, {
      name: 'Sample Rate (ms)',
      value: 100,
      type: 'uint16',
      access: 'rw',
    });
    this.isduParameters.set(0x0093, {
      name: 'Alarm Threshold High',
      value: 120,
      type: 'int16',
      access: 'rw',
    });
    this.isduParameters.set(0x0094, {
      name: 'Alarm Threshold Low',
      value: -20,
      type: 'int16',
      access: 'rw',
    });
    this.isduParameters.set(0x0095, {
      name: 'Filter Coefficient',
      value: 0.85,
      type: 'float32',
      access: 'rw',
    });
  }

  wakeup(comSpeedCode) {
    this.state = DEVICE_STATE.STARTUP;
    const speeds = Object.values(COM_SPEED);
    const matched = speeds.find(s => s.code === comSpeedCode);
    if (matched) {
      this.comSpeed = matched;
    }
    this.state = DEVICE_STATE.PREOPERATE;
    return true;
  }

  startOperate() {
    this.state = DEVICE_STATE.OPERATE;
    if (!this.simulationInterval) {
      this.simulationInterval = setInterval(this._simulateProcessData, 1000);
    }
  }

  stopOperate() {
    this.state = DEVICE_STATE.INACTIVE;
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }
  }

  _simulateProcessData() {
    if (this.state !== DEVICE_STATE.OPERATE) return;
    this.cycleCounter++;
    const baseTemp = 22.5;
    const variation = (Math.sin(this.cycleCounter * 0.1) * 5) + (Math.random() - 0.5) * 2;
    const temperature = baseTemp + variation;
    const rawValue = Math.round(temperature * 10);
    this.processDataInput = Buffer.alloc(2);
    this.processDataInput.writeInt16BE(rawValue);

    this.isduParameters.get(ISDU_INDEX.PROCESS_DATA_INPUT).value = rawValue;
    this.isduParameters.get(ISDU_INDEX.DEVICE_STATUS).value = this.pendingEvents.length > 0 ? 0x01 : 0x00;

    const alarmHigh = this.isduParameters.get(0x0093).value;
    const alarmLow = this.isduParameters.get(0x0094).value;
    const now = Date.now();

    if (temperature > alarmHigh && !this._alarmHighActive) {
      this._alarmHighActive = true;
      const alarm = {
        type: EVENT_TYPE.ERROR,
        code: 0x201,
        direction: 'high',
        temperature: parseFloat(temperature.toFixed(1)),
        threshold: alarmHigh,
        message: `Temperature HIGH alarm: ${temperature.toFixed(1)}°C > ${alarmHigh}°C`,
        activatedAt: now,
        deactivatedAt: null,
        acknowledged: false,
        cycle: this.cycleCounter,
        duration: null,
      };
      this.alarmStorage.push(alarm);
      this.pushEvent(EVENT_TYPE.ERROR, 0x201, alarm.message);
      if (this.alarmStorage.length > this._maxAlarmStorage) this.alarmStorage.shift();
    } else if (temperature <= alarmHigh * 0.95 && this._alarmHighActive) {
      this._alarmHighActive = false;
      const lastHigh = [...this.alarmStorage].reverse().find(a => a.direction === 'high' && !a.deactivatedAt);
      if (lastHigh) {
        lastHigh.deactivatedAt = now;
        lastHigh.duration = now - lastHigh.activatedAt;
        this.pushEvent(EVENT_TYPE.NOTIFICATION, 0x210, `High alarm cleared after ${((lastHigh.duration) / 1000).toFixed(1)}s`);
      }
    }

    if (temperature < alarmLow && !this._alarmLowActive) {
      this._alarmLowActive = true;
      const alarm = {
        type: EVENT_TYPE.ERROR,
        code: 0x202,
        direction: 'low',
        temperature: parseFloat(temperature.toFixed(1)),
        threshold: alarmLow,
        message: `Temperature LOW alarm: ${temperature.toFixed(1)}°C < ${alarmLow}°C`,
        activatedAt: now,
        deactivatedAt: null,
        acknowledged: false,
        cycle: this.cycleCounter,
        duration: null,
      };
      this.alarmStorage.push(alarm);
      this.pushEvent(EVENT_TYPE.ERROR, 0x202, alarm.message);
      if (this.alarmStorage.length > this._maxAlarmStorage) this.alarmStorage.shift();
    } else if (temperature >= alarmLow * 1.05 && this._alarmLowActive) {
      this._alarmLowActive = false;
      const lastLow = [...this.alarmStorage].reverse().find(a => a.direction === 'low' && !a.deactivatedAt);
      if (lastLow) {
        lastLow.deactivatedAt = now;
        lastLow.duration = now - lastLow.activatedAt;
        this.pushEvent(EVENT_TYPE.NOTIFICATION, 0x220, `Low alarm cleared after ${((lastLow.duration) / 1000).toFixed(1)}s`);
      }
    }

    if (this.cycleCounter % 15 === 0) {
      this.pushEvent(EVENT_TYPE.NOTIFICATION, 0x100, 'Periodic self-check OK');
    }
    if (this.cycleCounter % 50 === 0) {
      this.pushEvent(EVENT_TYPE.NOTIFICATION, 0x300, 'Diagnostic data updated');
    }
  }

  pushEvent(eventType, eventCode, message) {
    const event = {
      type: eventType,
      code: eventCode,
      message,
      timestamp: Date.now(),
      cycle: this.cycleCounter,
    };
    this.pendingEvents.push(event);
    this.eventHistory.push(event);
    if (this.eventHistory.length > 100) {
      this.eventHistory.shift();
    }
  }

  handleProcessDataExchange(outputData) {
    if (this.state !== DEVICE_STATE.OPERATE) return null;
    if (outputData && outputData.length > 0) {
      this.processDataOutput = Buffer.from(outputData);
    }
    return this.processDataInput;
  }

  handleISDURead(index, subindex) {
    const param = this.isduParameters.get(index);
    if (!param) {
      return { error: true, ackCode: 0x02 };
    }
    let data;
    if (param.type === 'string') {
      data = Buffer.from(param.value, 'utf8');
    } else if (param.type === 'uint16') {
      data = Buffer.alloc(2);
      data.writeUInt16BE(param.value, 0);
    } else if (param.type === 'int16') {
      data = Buffer.alloc(2);
      data.writeInt16BE(param.value, 0);
    } else if (param.type === 'uint8') {
      data = Buffer.alloc(1);
      data.writeUInt8(param.value, 0);
    } else if (param.type === 'float32') {
      data = Buffer.alloc(4);
      data.writeFloatBE(param.value, 0);
    } else {
      data = Buffer.from([0x00]);
    }
    return { error: false, data };
  }

  handleISDUWrite(index, subindex, data) {
    const param = this.isduParameters.get(index);
    if (!param) {
      return { error: true, ackCode: 0x02 };
    }
    if (param.access === 'ro') {
      return { error: true, ackCode: 0x03 };
    }
    if (param.type === 'string') {
      param.value = data.toString('utf8');
    } else if (param.type === 'uint16') {
      param.value = data.readUInt16BE(0);
    } else if (param.type === 'int16') {
      param.value = data.readInt16BE(0);
    } else if (param.type === 'uint8') {
      param.value = data.readUInt8(0);
    } else if (param.type === 'float32') {
      param.value = data.readFloatBE(0);
    }
    return { error: false, data: Buffer.alloc(0) };
  }

  handleEventRequest() {
    if (this.pendingEvents.length === 0) {
      return { hasEvent: false };
    }
    const event = this.pendingEvents.shift();
    const data = Buffer.alloc(4);
    data.writeUInt8(event.type, 0);
    data.writeUInt16BE(event.code, 1);
    data.writeUInt8(event.cycle & 0xFF, 3);
    return { hasEvent: true, event, data };
  }

  handlePageRequest(pageNumber) {
    const page0 = Buffer.alloc(16);
    page0.writeUInt16BE(this.vendorId, 0);
    page0.writeUInt16BE(this.deviceId, 2);
    page0.writeUInt8(this.deviceFunction & 0xFF, 4);
    page0.writeUInt8(2, 5);
    page0.write(this.serialNumber.substring(0, 10), 6, 'ascii');

    const page1 = Buffer.alloc(16);
    page1.write(this.vendorName.substring(0, 8), 0, 'ascii');
    page1.write(this.deviceName.substring(0, 8), 8, 'ascii');

    if (pageNumber === 0) return page0;
    if (pageNumber === 1) return page1;
    return Buffer.alloc(16);
  }

  getDeviceInfo() {
    return {
      vendorId: this.vendorId,
      deviceId: this.deviceId,
      deviceFunction: this.deviceFunction,
      serialNumber: this.serialNumber,
      hardwareRevision: this.hardwareRevision,
      firmwareRevision: this.firmwareRevision,
      vendorName: this.vendorName,
      deviceName: this.deviceName,
      productId: this.productId,
      state: this.state,
      comSpeed: this.comSpeed.name,
      cycleCounter: this.cycleCounter,
    };
  }

  getISDUList() {
    const list = [];
    for (const [index, param] of this.isduParameters) {
      list.push({
        index,
        name: param.name,
        value: param.value,
        type: param.type,
        access: param.access,
      });
    }
    return list.sort((a, b) => a.index - b.index);
  }

  getProcessData() {
    if (this.processDataInput.length >= 2) {
      const rawValue = this.processDataInput.readInt16BE(0);
      return {
        raw: rawValue,
        temperature: rawValue / 10,
        unit: '°C',
        rawBytes: [...this.processDataInput],
      };
    }
    return { raw: 0, temperature: 0, unit: '°C', rawBytes: [0, 0] };
  }

  getEvents() {
    return this.eventHistory.slice(-50);
  }

  getPendingEventCount() {
    return this.pendingEvents.length;
  }

  getAlarms(activeOnly) {
    if (activeOnly) {
      return this.alarmStorage.filter(a => !a.deactivatedAt);
    }
    return this.alarmStorage.slice(-100);
  }

  acknowledgeAlarm(index) {
    if (index >= 0 && index < this.alarmStorage.length) {
      this.alarmStorage[index].acknowledged = true;
      return true;
    }
    return false;
  }

  acknowledgeAllAlarms() {
    this.alarmStorage.forEach(a => { a.acknowledged = true; });
  }

  getAlarmSummary() {
    const total = this.alarmStorage.length;
    const active = this.alarmStorage.filter(a => !a.deactivatedAt).length;
    const unacknowledged = this.alarmStorage.filter(a => !a.acknowledged).length;
    const highAlarms = this.alarmStorage.filter(a => a.direction === 'high').length;
    const lowAlarms = this.alarmStorage.filter(a => a.direction === 'low').length;
    return { total, active, unacknowledged, highAlarms, lowAlarms };
  }

  exportISDUAsCSV() {
    const header = 'Index,Name,Value,Type,Access';
    const rows = this.getISDUList().map(p =>
      `${formatHex(p.index)},${p.name},${p.value},${p.type},${p.access}`
    );
    return [header, ...rows].join('\n');

    function formatHex(val, width) {
      return '0x' + val.toString(16).toUpperCase().padStart(width || 4, '0');
    }
  }

  exportISDUAsJSON() {
    return JSON.stringify({
      deviceInfo: this.getDeviceInfo(),
      parameters: this.getISDUList(),
      exportTimestamp: new Date().toISOString(),
    }, null, 2);
  }

  getMSeqStats() {
    return this.mseqHandler.getStats();
  }

  getMSeqHistory(count) {
    return this.mseqHandler.getRecentHistory(count);
  }
}

module.exports = IoLinkDevice;
