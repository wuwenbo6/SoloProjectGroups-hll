'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const rhea = require('rhea');

const HTTP_PORT = process.env.HTTP_PORT || 3000;
const TARGET_ADDRESS = 'examples/flow-control';
const BROKER_PORT = 5672;

// Dynamic window configuration
const INITIAL_CREDIT = parseInt(process.env.INITIAL_CREDIT || '5', 10);
const MIN_CREDIT = 1;
const MAX_CREDIT = 200;
const TARGET_LATENCY_MS = parseInt(process.env.TARGET_LATENCY || '50', 10);
const ADJUST_INTERVAL_MS = 500;
const LATENCY_ALPHA = 0.2; // EWMA smoothing factor

const container = rhea.create_container({ id: 'flow-control-demo' });

// ---------- Telemetry ----------
const stats = {
  sent: 0,
  received: 0,
  sentThisSec: 0,
  receivedThisSec: 0,
  lastSentPerSec: 0,
  lastReceivedPerSec: 0,
  senderCredit: 0,
  receiverCredit: 0,
  paused: false,
  retrans: 0,
  latencyMs: 0,      // smoothed end-to-end latency (EWMA)
  currentWindow: INITIAL_CREDIT,
  targetLatency: TARGET_LATENCY_MS,
};

// Track send time by message_id for latency calculation
const sendTimestamps = new Map();

setInterval(() => {
  stats.lastSentPerSec = stats.sentThisSec;
  stats.lastReceivedPerSec = stats.receivedThisSec;
  stats.sentThisSec = 0;
  stats.receivedThisSec = 0;
  broadcast({ type: 'tick', ...snapshot() });
}, 1000);

function snapshot() {
  return {
    ts: Date.now(),
    sent: stats.sent,
    received: stats.received,
    sentPerSec: stats.lastSentPerSec,
    receivedPerSec: stats.lastReceivedPerSec,
    senderCredit: stats.senderCredit,
    receiverCredit: stats.receiverCredit,
    paused: stats.paused,
    retrans: stats.retrans,
    latencyMs: stats.latencyMs,
    currentWindow: stats.currentWindow,
    targetLatency: stats.targetLatency,
  };
}

// ---------- WebSocket ----------
const wss = new WebSocketServer({ noServer: true });
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: 'hello', ...snapshot() }));
  ws.on('close', () => clients.delete(ws));
});

function broadcast(msg) {
  const payload = JSON.stringify(msg);
  for (const c of clients) {
    if (c.readyState === 1) c.send(payload);
  }
}

// ---------- Dynamic credit window controller ----------
// Adjusts credit based on measured end-to-end latency using an additive-
// increase/multiplicative-decrease (AIMD) style controller:
//   - If latency < target: increase credit (additive)
//   - If latency > target: decrease credit (multiplicative)
let receiverLink = null;
let currentCredit = INITIAL_CREDIT;
let smoothedLatency = 0;

function adjustWindow() {
  if (!receiverLink) return;

  let target = currentCredit;
  if (smoothedLatency === 0) {
    // No data yet, stay at current
  } else if (smoothedLatency < TARGET_LATENCY_MS * 0.8) {
    // Latency well below target: increase credit aggressively
    target = Math.min(MAX_CREDIT, currentCredit + Math.max(1, Math.floor(currentCredit * 0.2)));
  } else if (smoothedLatency < TARGET_LATENCY_MS) {
    // Approaching target: gentle increase
    target = Math.min(MAX_CREDIT, currentCredit + 1);
  } else if (smoothedLatency > TARGET_LATENCY_MS * 1.5) {
    // Well above target: aggressive decrease
    target = Math.max(MIN_CREDIT, Math.floor(currentCredit * 0.5));
  } else {
    // Slightly above target: gentle decrease
    target = Math.max(MIN_CREDIT, currentCredit - 1);
  }

  if (target !== currentCredit) {
    const delta = target - currentCredit;
    console.log(`[controller] latency=${smoothedLatency.toFixed(1)}ms, window ${currentCredit} -> ${target} (delta=${delta > 0 ? '+' : ''}${delta})`);
    currentCredit = target;
    receiverLink.add_credit(delta);
    stats.currentWindow = currentCredit;
    stats.receiverCredit = receiverLink.credit || 0;
  }
}

setInterval(adjustWindow, ADJUST_INTERVAL_MS);

// ---------- AMQP Receiver ----------
// Mark receiver created for server-side connections
const serverReceivers = new WeakSet();

container.on('connection_open', (context) => {
  console.log('[connection] open, is_server=' + context.connection.is_server);
  if (context.connection.is_server) {
    const rcv = context.connection.open_receiver({ source: TARGET_ADDRESS, credit_window: 0 });
    serverReceivers.add(rcv);
    receiverLink = rcv;
  }
});

container.on('receiver_open', (context) => {
  console.log('[receiver] open event, source=' + JSON.stringify(context.receiver.source));
  // Only handle the receiver we explicitly created on the server side
  if (!serverReceivers.has(context.receiver)) return;
  receiverLink = context.receiver;
  console.log('[receiver] link opened, initial credit=' + INITIAL_CREDIT);
  receiverLink.add_credit(INITIAL_CREDIT);
  stats.receiverCredit = INITIAL_CREDIT;
  stats.currentWindow = INITIAL_CREDIT;
  currentCredit = INITIAL_CREDIT;
});

container.on('message', (context) => {
  if (!serverReceivers.has(context.receiver)) return;
  stats.received++;
  stats.receivedThisSec++;
  stats.receiverCredit = context.receiver.credit || 0;

  // Calculate end-to-end latency
  const msg = context.message;
  if (msg && msg.body && msg.body.seq !== undefined && msg.body.ts !== undefined) {
    const oneWay = Date.now() - msg.body.ts;
    if (smoothedLatency === 0) {
      smoothedLatency = oneWay;
    } else {
      smoothedLatency = LATENCY_ALPHA * oneWay + (1 - LATENCY_ALPHA) * smoothedLatency;
    }
    stats.latencyMs = smoothedLatency;
    sendTimestamps.delete(msg.body.seq);
  }

  context.delivery.accept();
});

// ---------- AMQP Sender (explicit credit check + no retrans counting) ----------
const senderSenders = new WeakSet();
let seq = 0;
const sentSeqs = new Set();
let senderLink = null;

function sendOne(sender) {
  if (!sender.sendable()) {
    stats.paused = true;
    stats.senderCredit = sender.credit || 0;
    return false;
  }

  seq++;
  const messageId = seq;
  const now = Date.now();
  const body = { seq: messageId, ts: now, payload: 'x'.repeat(64) };
  sender.send({ body, message_id: messageId });
  sendTimestamps.set(messageId, now);

  if (!sentSeqs.has(messageId)) {
    sentSeqs.add(messageId);
    stats.sent++;
    stats.sentThisSec++;
  } else {
    stats.retrans++;
  }

  stats.senderCredit = sender.credit || 0;
  stats.paused = !sender.sendable();
  return true;
}

container.on('sendable', (context) => {
  if (!senderSenders.has(context.sender)) return;
  console.log('[sender] sendable event, credit=' + context.sender.credit);
  stats.paused = false;
  stats.senderCredit = context.sender.credit || 0;

  const maxBatch = Math.max(10, currentCredit * 2);
  let sentCount = 0;
  while (sentCount < maxBatch) {
    if (!context.sender.sendable()) break;
    if (!sendOne(context.sender)) break;
    sentCount++;
  }

  stats.senderCredit = context.sender.credit || 0;
  console.log('[sender] batch done, sent=' + sentCount + ', remaining credit=' + stats.senderCredit);
  if (stats.senderCredit <= 0) {
    stats.paused = true;
  }
});

container.on('sender_flow', (context) => {
  if (!senderSenders.has(context.sender)) return;
  console.log('[sender] flow event, credit=' + context.sender.credit);
  stats.senderCredit = context.sender.credit || 0;
  if (context.sender.credit > 0) {
    stats.paused = false;
  }
});

container.on('sender_open', (context) => {
  console.log('[sender] open event, target=' + JSON.stringify(context.sender.target));
  if (!senderSenders.has(context.sender)) return;
  senderLink = context.sender;
  console.log('[sender] link opened, initial credit=' + context.sender.credit);
});

// ---------- AMQP Listener (server side) ----------
const amqpServer = container.listen({ port: BROKER_PORT });
amqpServer.on('listening', () => {
  console.log(`[broker] AMQP listener on port ${BROKER_PORT}`);
  setTimeout(() => {
    console.log('[sender-client] connecting...');
    const conn = container.connect({ port: BROKER_PORT, host: '127.0.0.1' });
    conn.on('connection_open', () => {
      console.log('[sender-client] connection opened');
      const snd = conn.open_sender({ target: TARGET_ADDRESS });
      senderSenders.add(snd);
    });
    conn.on('connection_error', (e) => console.error('[sender-client] error', e));
    conn.on('disconnected', () => console.error('[sender-client] disconnected'));
  }, 1000);
});

// ---------- HTTP server ----------
const httpServer = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

httpServer.on('upgrade', (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

httpServer.listen(HTTP_PORT, () => {
  console.log(`[http] dashboard available at http://localhost:${HTTP_PORT}/`);
});
