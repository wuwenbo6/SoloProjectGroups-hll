const dgram = require('dgram');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const MASTER_UDP_PORT = 319;
const SLAVE_UDP_PORT = 320;
const TC_PORT = 321;
const HTTP_PORT = 8080;

const PTP_MSG_SYNC = 0x00;
const PTP_MSG_FOLLOW_UP = 0x08;
const PTP_MSG_DELAY_REQ = 0x01;
const PTP_MSG_DELAY_RESP = 0x09;
const PTP_MSG_PDELAY_REQ = 0x02;
const PTP_MSG_PDELAY_RESP = 0x03;

const CLOCK_MODE = process.env.CLOCK_MODE || 'two-step';

const udpServer = dgram.createSocket('udp4');
const clients = new Map();
const webClients = new Set();

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Error loading index.html');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
  } else if (req.url === '/api/config') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      clockMode: CLOCK_MODE,
      masterPort: MASTER_UDP_PORT,
      tcPort: TC_PORT,
      slavePort: SLAVE_UDP_PORT
    }));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  webClients.add(ws);
  console.log('Web client connected');
  ws.send(JSON.stringify({
    type: 'config',
    clockMode: CLOCK_MODE,
    timestamp: Date.now()
  }));
  ws.on('close', () => {
    webClients.delete(ws);
    console.log('Web client disconnected');
  });
});

function broadcastToWeb(data) {
  webClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

function getTimestamp() {
  const now = process.hrtime();
  return now[0] * 1e9 + now[1];
}

function serializePtpMessage(type, sequenceId, timestamp, slaveId = 0, correctionField = 0) {
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
  buf.writeUInt8(CLOCK_MODE === 'one-step' ? 1 : 0, 40);
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
    oneStep: hasCorrection ? msg.readUInt8(40) : 0
  };
}

let sequenceId = 0;

udpServer.on('message', (msg, rinfo) => {
  const parsed = parsePtpMessage(msg);
  if (!parsed) return;

  const clientKey = `${rinfo.address}:${rinfo.port}`;

  if (parsed.type === PTP_MSG_DELAY_REQ) {
    const t4 = getTimestamp();
    const slaveId = parsed.slaveId;

    if (!clients.has(clientKey)) {
      clients.set(clientKey, { id: slaveId, address: rinfo.address, port: rinfo.port });
      console.log(`New slave connected: ID=${slaveId}, ${clientKey}`);
    }

    const delayResp = serializePtpMessage(PTP_MSG_DELAY_RESP, sequenceId++, t4, slaveId, parsed.correctionField);
    udpServer.send(delayResp, rinfo.port, rinfo.address, (err) => {
      if (err) console.error('Error sending Delay_Resp:', err);
    });

    const broadcastData = {
      type: 'delay_req',
      slaveId: slaveId,
      t3: parsed.timestamp,
      t4: t4,
      correctionField: parsed.correctionField,
      timestamp: Date.now(),
    };
    broadcastToWeb(broadcastData);
  }
});

udpServer.on('error', (err) => {
  console.error('UDP server error:', err);
});

udpServer.on('listening', () => {
  const address = udpServer.address();
  console.log(`PTP Master UDP server listening on ${address.address}:${address.port}`);
});

udpServer.bind(MASTER_UDP_PORT, () => {
  console.log(`PTP Master started in ${CLOCK_MODE} mode on UDP port ${MASTER_UDP_PORT}`);
});

function sendSyncMessage() {
  const t1 = getTimestamp();
  const isOneStep = CLOCK_MODE === 'one-step';
  const syncMsg = serializePtpMessage(PTP_MSG_SYNC, sequenceId++, t1, 0, 0);

  clients.forEach((client, key) => {
    const [addr, port] = key.split(':');
    client.lastSyncTime = t1;

    udpServer.send(syncMsg, parseInt(port), addr, (err) => {
      if (err) console.error('Error sending Sync:', err);
    });

    if (!isOneStep) {
      setTimeout(() => {
        const followUp = serializePtpMessage(PTP_MSG_FOLLOW_UP, sequenceId++, t1, 0, 0);
        udpServer.send(followUp, parseInt(port), addr, (err) => {
          if (err) console.error('Error sending Follow_Up:', err);
        });
      }, 1);
    }

    const broadcastData = {
      type: 'sync',
      t1: t1,
      slaveId: client.id,
      clockMode: CLOCK_MODE,
      timestamp: Date.now(),
    };
    broadcastToWeb(broadcastData);
  });

  if (clients.size === 0) {
    const broadcastData = {
      type: 'sync',
      t1: t1,
      slaveId: 0,
      clockMode: CLOCK_MODE,
      timestamp: Date.now(),
    };
    broadcastToWeb(broadcastData);
  }
}

setInterval(sendSyncMessage, 1000);

server.listen(HTTP_PORT, () => {
  console.log(`HTTP/WebSocket server running on http://localhost:${HTTP_PORT}`);
});
