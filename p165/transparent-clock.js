const dgram = require('dgram');
const WebSocket = require('ws');

const MASTER_ADDRESS = '127.0.0.1';
const MASTER_UDP_PORT = 319;
const TC_LISTEN_PORT = 321;
const TC_MASTER_PORT = 322;

const PTP_MSG_SYNC = 0x00;
const PTP_MSG_FOLLOW_UP = 0x08;
const PTP_MSG_DELAY_REQ = 0x01;
const PTP_MSG_DELAY_RESP = 0x09;

const TC_ID = process.pid;
const TC_PROCESSING_DELAY_MIN = 5000;
const TC_PROCESSING_DELAY_MAX = 20000;

const tcFromSlave = dgram.createSocket('udp4');
const tcToMaster = dgram.createSocket('udp4');
let ws = null;

let slaveInfo = null;
let totalResidenceTime = 0;
let packetCount = 0;

console.log(`PTP Transparent Clock started, ID: ${TC_ID}`);
console.log(`TC Slave-side port: ${TC_LISTEN_PORT}, Master-side port: ${TC_MASTER_PORT}`);
console.log(`Processing delay range: ${TC_PROCESSING_DELAY_MIN}-${TC_PROCESSING_DELAY_MAX} ns`);

function connectWebSocket() {
  try {
    ws = new WebSocket('ws://127.0.0.1:8080');
    
    ws.on('open', () => {
      console.log('TC connected to WebSocket server');
      ws.send(JSON.stringify({
        type: 'tc_status',
        tcId: TC_ID,
        status: 'connected',
        timestamp: Date.now()
      }));
    });

    ws.on('error', (err) => {
      console.error('TC WebSocket error:', err.message);
    });

    ws.on('close', () => {
      console.log('TC WebSocket disconnected, reconnecting...');
      setTimeout(connectWebSocket, 2000);
    });
  } catch (e) {
    console.error('TC WebSocket connection failed:', e.message);
    setTimeout(connectWebSocket, 2000);
  }
}

function getTimestamp() {
  const now = process.hrtime();
  return now[0] * 1e9 + now[1];
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
    raw: msg
  };
}

function updateCorrectionField(msg, residenceTime) {
  if (msg.length < 44) {
    const newBuf = Buffer.alloc(44);
    msg.copy(newBuf, 0, 0, 34);
    newBuf.writeBigInt64BE(BigInt(residenceTime), 26);
    newBuf.writeUInt16BE(0, 34);
    newBuf.writeUInt32BE(0, 36);
    return newBuf;
  }
  
  const currentCorrection = msg.readBigInt64BE(26);
  const newCorrection = currentCorrection + BigInt(residenceTime);
  msg.writeBigInt64BE(newCorrection, 26);
  return msg;
}

function getMsgTypeName(type) {
  switch (type) {
    case PTP_MSG_SYNC: return 'Sync';
    case PTP_MSG_FOLLOW_UP: return 'Follow_Up';
    case PTP_MSG_DELAY_REQ: return 'Delay_Req';
    case PTP_MSG_DELAY_RESP: return 'Delay_Resp';
    default: return `Unknown(0x${type.toString(16)})`;
  }
}

tcFromSlave.on('message', (msg, rinfo) => {
  const parsed = parsePtpMessage(msg);
  if (!parsed) return;

  const arrivalTime = getTimestamp();
  const msgType = getMsgTypeName(parsed.type);
  packetCount++;

  slaveInfo = { address: rinfo.address, port: rinfo.port };

  const processingDelay = Math.floor(Math.random() * (TC_PROCESSING_DELAY_MAX - TC_PROCESSING_DELAY_MIN)) + TC_PROCESSING_DELAY_MIN;
  const residenceTime = processingDelay;

  const updatedMsg = updateCorrectionField(Buffer.from(msg), residenceTime);
  totalResidenceTime += residenceTime;

  setTimeout(() => {
    tcToMaster.send(updatedMsg, MASTER_UDP_PORT, MASTER_ADDRESS, (err) => {
      if (err) console.error('TC->Master forwarding error:', err);
    });
    console.log(`TC: ${msgType} Slave->Master, correction=${parsed.correctionField}+${residenceTime}=${parsed.correctionField + residenceTime} ns`);

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'tc_update',
        tcId: TC_ID,
        msgType: msgType,
        direction: 'slave-to-master',
        residenceTime: residenceTime,
        correctionFieldBefore: parsed.correctionField,
        correctionFieldAfter: parsed.correctionField + residenceTime,
        totalResidenceTime: totalResidenceTime,
        packetCount: packetCount,
        timestamp: Date.now()
      }));
    }
  }, processingDelay / 1000);
});

tcToMaster.on('message', (msg, rinfo) => {
  const parsed = parsePtpMessage(msg);
  if (!parsed) return;

  const arrivalTime = getTimestamp();
  const msgType = getMsgTypeName(parsed.type);
  packetCount++;

  const processingDelay = Math.floor(Math.random() * (TC_PROCESSING_DELAY_MAX - TC_PROCESSING_DELAY_MIN)) + TC_PROCESSING_DELAY_MIN;
  const residenceTime = processingDelay;

  const updatedMsg = updateCorrectionField(Buffer.from(msg), residenceTime);
  totalResidenceTime += residenceTime;

  setTimeout(() => {
    if (slaveInfo) {
      tcFromSlave.send(updatedMsg, slaveInfo.port, slaveInfo.address, (err) => {
        if (err) console.error('TC->Slave forwarding error:', err);
      });
      console.log(`TC: ${msgType} Master->Slave, correction=${parsed.correctionField}+${residenceTime}=${parsed.correctionField + residenceTime} ns`);
    } else {
      console.log(`TC: ${msgType} from Master but no slave connected yet`);
    }

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'tc_update',
        tcId: TC_ID,
        msgType: msgType,
        direction: 'master-to-slave',
        residenceTime: residenceTime,
        correctionFieldBefore: parsed.correctionField,
        correctionFieldAfter: parsed.correctionField + residenceTime,
        totalResidenceTime: totalResidenceTime,
        packetCount: packetCount,
        timestamp: Date.now()
      }));
    }
  }, processingDelay / 1000);
});

tcFromSlave.on('error', (err) => {
  console.error('TC Slave-side socket error:', err);
});

tcToMaster.on('error', (err) => {
  console.error('TC Master-side socket error:', err);
});

tcFromSlave.bind(TC_LISTEN_PORT, () => {
  console.log(`TC Slave-side socket bound to port ${TC_LISTEN_PORT}`);
});

tcToMaster.bind(TC_MASTER_PORT, () => {
  console.log(`TC Master-side socket bound to port ${TC_MASTER_PORT}`);
  connectWebSocket();
});

process.on('SIGINT', () => {
  console.log(`\nTC shutting down. Total packets: ${packetCount}, Total residence time: ${totalResidenceTime} ns`);
  process.exit(0);
});
