const COM_SPEED = {
  COM1: { baudRate: 4800, code: 0x01, name: 'COM1 (4.8 kBaud)' },
  COM2: { baudRate: 38400, code: 0x02, name: 'COM2 (38.4 kBaud)' },
  COM3: { baudRate: 230400, code: 0x03, name: 'COM3 (230.4 kBaud)' },
};

const M_SEQUENCE_TYPE = {
  TYPE_0: 0x00,
  TYPE_1: 0x01,
  TYPE_2: 0x02,
  TYPE_3: 0x03,
};

const MC_OPCODE = {
  TYPE_0_OD0: 0x00,
  TYPE_0_OD1: 0x01,
  TYPE_0_OD2: 0x02,
  TYPE_1_READ: 0x40,
  TYPE_1_WRITE: 0x41,
  TYPE_2: 0x80,
  TYPE_3: 0xC0,
};

const AC_OPCODE = {
  OK: 0x00,
  ERROR: 0x01,
  NOT_SUPPORTED: 0x02,
  DEVICE_BUSY: 0x03,
};

const ISDU_INDEX = {
  VENDOR_ID: 0x0001,
  DEVICE_ID: 0x0002,
  DEVICE_FUNCTION: 0x0003,
  SERIAL_NUMBER: 0x0005,
  HARDWARE_REVISION: 0x0006,
  FIRMWARE_REVISION: 0x0007,
  PROCESS_DATA_INPUT: 0x0010,
  PROCESS_DATA_OUTPUT: 0x0011,
  DIRECT_PARAM_PAGE_1: 0x0018,
  DIRECT_PARAM_PAGE_2: 0x0019,
  DEVICE_STATUS: 0x0028,
  VENDOR_NAME: 0x0080,
  DEVICE_NAME: 0x0081,
  PRODUCT_ID: 0x0082,
};

const EVENT_TYPE = {
  NOTIFICATION: 0x00,
  WARNING: 0x01,
  ERROR: 0x02,
};

const DEVICE_STATE = {
  INACTIVE: 'INACTIVE',
  WAKEUP: 'WAKEUP',
  STARTUP: 'STARTUP',
  PREOPERATE: 'PREOPERATE',
  OPERATE: 'OPERATE',
  ERROR: 'ERROR',
};

function checksum(data) {
  let cs = 0;
  for (let i = 0; i < data.length; i++) {
    cs ^= data[i];
  }
  return cs;
}

function buildMasterFrame(opcode, outputData) {
  const od = outputData || [];
  const frame = [opcode, ...od];
  frame.push(checksum(frame));
  return Buffer.from(frame);
}

function parseDeviceFrame(buffer) {
  if (!buffer || buffer.length < 2) return null;
  const ack = buffer[0];
  const dataLen = buffer.length - 2;
  const inputData = Buffer.from(buffer.slice(1, 1 + dataLen));
  const receivedChecksum = buffer[buffer.length - 1];
  const calculatedChecksum = checksum(buffer.slice(0, -1));
  return {
    ack,
    inputData,
    valid: receivedChecksum === calculatedChecksum,
    checksum: receivedChecksum,
  };
}

function buildISDUReadRequest(index, subindex) {
  const opcode = MC_OPCODE.TYPE_1_READ;
  const idxLo = index & 0xFF;
  const idxHi = (index >> 8) & 0xFF;
  return buildMasterFrame(opcode, [idxLo, idxHi, subindex || 0x00]);
}

function buildISDUWriteRequest(index, subindex, data) {
  const opcode = MC_OPCODE.TYPE_1_WRITE;
  const idxLo = index & 0xFF;
  const idxHi = (index >> 8) & 0xFF;
  const payload = [idxLo, idxHi, subindex || 0x00, ...data];
  return buildMasterFrame(opcode, payload);
}

function parseISDUResponse(deviceFrame) {
  if (!deviceFrame || !deviceFrame.valid) return null;
  if (deviceFrame.ack !== AC_OPCODE.OK) {
    return { error: true, ackCode: deviceFrame.ack };
  }
  return {
    error: false,
    data: deviceFrame.inputData,
  };
}

function buildType0Frame(outputData) {
  return buildMasterFrame(MC_OPCODE.TYPE_0_OD0, outputData);
}

function buildType2Frame() {
  return buildMasterFrame(MC_OPCODE.TYPE_2, []);
}

function buildType3Frame(pageNumber) {
  return buildMasterFrame(MC_OPCODE.TYPE_3, [pageNumber]);
}

function buildWakeupPulse() {
  return Buffer.from([0x55, 0xAA, 0x55, 0xAA]);
}

module.exports = {
  COM_SPEED,
  M_SEQUENCE_TYPE,
  MC_OPCODE,
  AC_OPCODE,
  ISDU_INDEX,
  EVENT_TYPE,
  DEVICE_STATE,
  checksum,
  buildMasterFrame,
  parseDeviceFrame,
  buildISDUReadRequest,
  buildISDUWriteRequest,
  parseISDUResponse,
  buildType0Frame,
  buildType2Frame,
  buildType3Frame,
  buildWakeupPulse,
};
