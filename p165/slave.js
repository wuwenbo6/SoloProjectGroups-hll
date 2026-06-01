const dgram = require('dgram');
const WebSocket = require('ws');

const MASTER_ADDRESS = '127.0.0.1';
const MASTER_UDP_PORT = 319;
const TC_PORT = 321;
const SLAVE_UDP_PORT = 320;
const WS_URL = 'ws://127.0.0.1:8080';

const USE_TC = process.env.USE_TC === 'true';
const TARGET_PORT = USE_TC ? TC_PORT : MASTER_UDP_PORT;

const PTP_MSG_SYNC = 0x00;
const PTP_MSG_FOLLOW_UP = 0x08;
const PTP_MSG_DELAY_REQ = 0x01;
const PTP_MSG_DELAY_RESP = 0x09;

const SLAVE_ID = process.pid;
const FILTER_WINDOW_SIZE = 10;
const PI_KP = 0.15;
const PI_KI = 0.02;

const udpClient = dgram.createSocket('udp4');
let ws = null;

let t1 = 0;
let t2 = 0;
let t3 = 0;
let t4 = 0;
let lastSyncTime = 0;
let sequenceId = 0;

let initialClockOffset = Math.floor(Math.random() * 2000000) - 1000000;
let currentClockOffset = initialClockOffset;

const networkJitter = () => Math.floor(Math.random() * 100000);

const delayHistory = [];
const offsetHistory = [];

let piIntegral = 0;

console.log(`PTP Slave started, ID: ${SLAVE_ID}`);
console.log(`Initial clock offset: ${initialClockOffset / 1e6} ms`);
console.log(`Filter window: ${FILTER_WINDOW_SIZE} samples`);
console.log(`PI Controller: Kp=${PI_KP}, Ki=${PI_KI}`);

function getSlaveTimestamp() {
  const now = process.hrtime();
  return now[0] * 1e9 + now[1] + currentClockOffset;
}

function serializePtpMessage(type, sequenceId, timestamp, slaveId = SLAVE_ID, correctionField = 0) {
  const buf = Buffer.alloc(44);
  buf.writeUInt8(type, 0);
  buf.writeUInt8(0x02, 1);
  buf.writeUInt16BE(44, 2);
  buf.writeUInt8(0, 4);
  buf.writeUInt8(0, 5);
  buf.writeUInt16BE(sequenceId, 6);
  buf.writeUInt8(0, 8);
  buf.writeUInt8(0, 9);
  buf.writeBigUInt64BE(BigInt(slaveId), 10);
  buf.writeBigUInt64BE(BigInt(timestamp), 18);
  buf.writeBigInt64BE(BigInt(correctionField), 26);
  buf.writeUInt16BE(0, 34);
  buf.writeUInt32BE(0, 36);
  buf.writeUInt8(0, 40);
  buf.writeUInt8(0, 41);
  return buf;
}

function parsePtpMessage(msg) {
  if (msg.length < 34) return null;
  const hasCorrection = msg.length >= 44;
  return {
    type: msg.readUInt8(0),
    version: msg.readUInt8(1),
    length: msg.readUInt16BE(2),
    domain: msg.readUInt8(4),
    flags: msg.readUInt16BE(6),
    sequenceId: msg.readUInt16BE(6),
    control: msg.readUInt8(8),
    logMessageInterval: msg.readInt8(9),
    slaveId: Number(msg.readBigUInt64BE(10)),
    timestamp: Number(msg.readBigUInt64BE(18)),
    correctionField: hasCorrection ? Number(msg.readBigInt64BE(26)) : 0,
    oneStep: hasCorrection ? msg.readUInt8(40) : 0,
  };
}

function connectWebSocket() {
  ws = new WebSocket(WS_URL);

  ws.on('open', () => {
    console.log('Connected to WebSocket server');
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
  });

  ws.on('close', () => {
    console.log('WebSocket disconnected, reconnecting...');
    setTimeout(connectWebSocket, 2000);
  });
}

function sendDelayReq() {
  t3 = getSlaveTimestamp();
  const delayReq = serializePtpMessage(PTP_MSG_DELAY_REQ, sequenceId++, t3);
  
  setTimeout(() => {
    udpClient.send(delayReq, TARGET_PORT, MASTER_ADDRESS, (err) => {
      if (err) console.error('Error sending Delay_Req:', err);
    });
  }, networkJitter() / 1000);
}

function filterDelay(rawDelay) {
  delayHistory.push(rawDelay);
  if (delayHistory.length > FILTER_WINDOW_SIZE) {
    delayHistory.shift();
  }
  return Math.min(...delayHistory);
}

function piController(measuredOffset) {
  const error = measuredOffset;
  
  piIntegral += error * PI_KI;
  
  piIntegral = Math.max(-5000, Math.min(5000, piIntegral));
  
  const output = PI_KP * error + piIntegral;
  
  return output;
}

let lastCorrectionField = 0;

udpClient.on('message', (msg, rinfo) => {
  const parsed = parsePtpMessage(msg);
  if (!parsed) return;

  if (parsed.type === PTP_MSG_SYNC) {
    t2 = getSlaveTimestamp();
    lastSyncTime = parsed.timestamp;
    lastCorrectionField = parsed.correctionField;

    if (parsed.oneStep) {
      t1 = parsed.timestamp + parsed.correctionField;
      setTimeout(sendDelayReq, 100 + networkJitter() / 1000);
    }
  } else if (parsed.type === PTP_MSG_FOLLOW_UP) {
    t1 = parsed.timestamp + parsed.correctionField;
    setTimeout(sendDelayReq, 100 + networkJitter() / 1000);
  } else if (parsed.type === PTP_MSG_DELAY_RESP) {
    if (parsed.slaveId !== SLAVE_ID) return;
    
    t4 = parsed.timestamp + parsed.correctionField;
    lastCorrectionField = parsed.correctionField;
    calculateAndReport();
  }
});

function calculateAndReport() {
  if (t1 === 0 || t2 === 0 || t3 === 0 || t4 === 0) return;

  const delayMs1 = (t2 - t1) / 1e6;
  const delayMs2 = (t4 - t3) / 1e6;
  const rawPathDelay = (delayMs1 + delayMs2) / 2;
  const rawOffset = ((t2 - t1) - (t4 - t3)) / 2 / 1e6;

  const filteredDelay = filterDelay(rawPathDelay);
  
  const offsetNs = rawOffset * 1e6;
  offsetHistory.push(offsetNs);
  if (offsetHistory.length > FILTER_WINDOW_SIZE) {
    offsetHistory.shift();
  }
  
  const sortedOffsets = [...offsetHistory].sort((a, b) => a - b);
  const mid = Math.floor(sortedOffsets.length / 2);
  const medianOffset = sortedOffsets.length % 2 !== 0 
    ? sortedOffsets[mid] 
    : (sortedOffsets[mid - 1] + sortedOffsets[mid]) / 2;
  const filteredOffset = medianOffset / 1e6;

  const correction = piController(filteredOffset);
  
  currentClockOffset -= Math.round(correction * 1e6);
  
  currentClockOffset = Math.max(-100000000, Math.min(100000000, currentClockOffset));

  console.log('==============================');
  console.log(`t1 (Master send):   ${t1} ns`);
  console.log(`t2 (Slave recv):    ${t2} ns`);
  console.log(`t3 (Slave send):    ${t3} ns`);
  console.log(`t4 (Master recv):   ${t4} ns`);
  console.log(`Correction Field:   ${lastCorrectionField} ns`);
  console.log(`Raw Path Delay:     ${rawPathDelay.toFixed(3)} ms`);
  console.log(`Filtered Delay:     ${filteredDelay.toFixed(3)} ms (min of ${delayHistory.length})`);
  console.log(`Raw Offset:         ${rawOffset.toFixed(3)} ms`);
  console.log(`Filtered Offset:    ${filteredOffset.toFixed(3)} ms`);
  console.log(`Initial Offset:     ${initialClockOffset / 1e6} ms`);
  console.log(`Current Offset:     ${currentClockOffset / 1e6} ms`);
  console.log(`PI Correction:      ${correction.toFixed(3)} ms`);
  console.log(`PI Integral:        ${piIntegral.toFixed(3)} ms`);
  console.log(`Use TC:             ${USE_TC}`);
  console.log('==============================\n');

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'ptp_result',
      slaveId: SLAVE_ID,
      t1,
      t2,
      t3,
      t4,
      correctionField: lastCorrectionField,
      pathDelay: rawPathDelay,
      filteredDelay: filteredDelay,
      offset: rawOffset,
      filteredOffset: filteredOffset,
      initialOffset: initialClockOffset / 1e6,
      currentOffset: currentClockOffset / 1e6,
      actualOffset: initialClockOffset / 1e6,
      piCorrection: correction,
      piIntegral: piIntegral,
      useTc: USE_TC,
      delayHistory: [...delayHistory],
      timestamp: Date.now()
    }));
  }
}

udpClient.on('error', (err) => {
  console.error('UDP client error:', err);
});

udpClient.bind(SLAVE_UDP_PORT, () => {
  console.log(`Slave UDP socket bound to port ${SLAVE_UDP_PORT}`);
  sendDelayReq();
  connectWebSocket();
});

setInterval(() => {
  if (t1 > 0) {
    sendDelayReq();
  }
}, 2000);
