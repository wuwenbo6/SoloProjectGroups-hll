'use strict';

const path = require('path');
const express = require('express');
const { WebSocketServer } = require('ws');
const { SerialPort } = require('serialport');
const {
  MAVLinkParser,
  decodeParamValue,
  decodeParamAck,
  encodeParamSet,
} = require('./mavlink');

const PORT = process.env.PORT || 3000;
const SERIAL_PORT = process.env.SERIAL_PORT || '/dev/tty.usbmodem01';
const BAUD_RATE = Number(process.env.BAUD_RATE) || 57600;
const ACK_TIMEOUT_MS = 3000;
const MAX_RETRIES = 3;

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const server = app.listen(PORT, () => {
  console.log(`[web] listening on http://localhost:${PORT}`);
});

// ---- Param range validation ----
// Maps parameter-name patterns to allowed numeric ranges (inclusive).
// Patterns are matched by exact name first, then by prefix (longest first).
const PARAM_RANGES = [
  { match: 'SYSID_THISMAV',     min: 1,   max: 255 },
  { match: 'SYSID_MYGCS',       min: 1,   max: 255 },
  { match: 'SYSID_ENFORCE',     min: 0,   max: 1 },
  { match: 'SYSID_SW_TYPE',     min: 0,   max: 255 },
  { match: 'BRD_SAFETY_MASK',   min: 0,   max: 65535 },
  { match: 'COM_RC_IN_MODE',    min: 0,   max: 3 },
  { match: 'COM_RC_LOSS_T',     min: 0,   max: 120 },
  { match: 'RTL_RETURN_ALT',    min: 0,   max: 8000 },
  { match: 'RTL_DESCEND_ALT',   min: 0,   max: 1000 },
  { match: 'RTL_LAND_DELAY',    min: -1,  max: 300 },
  { match: 'RTL_ALT',           min: 0,   max: 8000 },
  { match: 'RTL_ALT_TYPE',      min: 0,   max: 1 },
  { match: 'RTL_CLIMB_MIN',     min: 0,   max: 200 },
  { match: 'RTL_CONE_SLOPE',    min: 0.5, max: 10 },
  { match: 'RTL_FLIGHT_TIME',   min: 1,   max: 65535 },
  { match: 'NAV_ACC_RAD',       min: 0.1, max: 200 },
  { match: 'NAV_LOITER_RAD',    min: 1,   max: 2000 },
  { match: 'NAV_L1_PERIOD',     min: 0.1, max: 100 },
  { match: 'LIM_PITCH_MAX',     min: 10,  max: 89 },
  { match: 'LIM_PITCH_MIN',     min: -89, max: -10 },
  { match: 'LIM_ROLL_CD',       min: 10,  max: 89 },
  { match: 'MPC_THR_HOVER',     min: 0.2, max: 0.8 },
  { match: 'MPC_THR_MAX',       min: 0.3, max: 1.0 },
  { match: 'MPC_THR_MIN',       min: 0.0, max: 0.5 },
  { match: 'MPC_Z_VEL_MAX_UP',  min: 0.5, max: 10 },
  { match: 'MPC_Z_VEL_MAX_DN',  min: 0.5, max: 10 },
  { match: 'GPS_1_CONFIG',      min: 0,   max: 255 },
  { match: 'GPS_AUTO_CONFIG',   min: 0,   max: 2 },
  { match: 'IMU_GYRO_RATEMAX',  min: 0,   max: 2000 },
  { match: 'EKF2_IMU_CTRL',     min: 0,   max: 255 },
  { match: 'EKF2_HGT_MODE',     min: 0,   max: 5 },
  { match: 'EKF2_MAG_TYPE',     min: 0,   max: 5 },
];

function validateParamRange(paramId, value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  let best = null;
  for (const rule of PARAM_RANGES) {
    if (paramId === rule.match) return rule;
    if (paramId.startsWith(rule.match) && (!best || rule.match.length > best.match.length)) {
      best = rule;
    }
  }
  if (best) {
    if (value < best.min || value > best.max) return best;
  }
  return null;
}

// ---- Serial port + MAVLink ----
const parser = new MAVLinkParser();
let serial = null;
let serialSeq = 0;
let linkUp = false;

// Store the latest PARAM_VALUE messages keyed by param_id.
const paramStore = new Map();
let paramCount = 0;
let lastHeartbeatAt = 0;

// Outstanding set-param requests awaiting ACK.
// Key: param_id -> { timer, ws, requested, retriesLeft, param_type }
const pendingAcks = new Map();

function sendToOne(ws, obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function sendParamSet(paramId, paramValue, paramType) {
  const buf = encodeParamSet({
    targetSystem: 1,
    targetComponent: 1,
    paramId,
    paramValue,
    paramType,
    seq: (serialSeq++) & 0xFF,
  });
  writeSerial(buf);
}

function scheduleSetRetry(paramId, requested, paramType, ws, retriesLeft) {
  const timer = setTimeout(() => {
    const entry = pendingAcks.get(paramId);
    if (!entry) return;
    if (retriesLeft > 0) {
      console.log(`[param] ${paramId} ACK timeout, retrying (${retriesLeft} left)`);
      sendParamSet(paramId, requested, paramType);
      sendToOne(ws, { type: 'set_retry', param_id: paramId, retries_left: retriesLeft });
      scheduleSetRetry(paramId, requested, paramType, ws, retriesLeft - 1);
    } else {
      console.log(`[param] ${paramId} ACK timeout, giving up`);
      pendingAcks.delete(paramId);
      sendToOne(ws, { type: 'set_timeout', param_id: paramId, requested });
    }
  }, ACK_TIMEOUT_MS);
  const entry = pendingAcks.get(paramId);
  if (entry) {
    clearTimeout(entry.timer);
    entry.timer = timer;
    entry.retriesLeft = retriesLeft;
  } else {
    pendingAcks.set(paramId, { timer, ws, requested, retriesLeft, paramType });
  }
}

function openSerial() {
  if (serial) { try { serial.close(); } catch (_) {} serial = null; }
  serial = new SerialPort({ path: SERIAL_PORT, baudRate: BAUD_RATE, autoOpen: true });
  serial.on('open', () => {
    linkUp = false;
    console.log(`[serial] opened ${SERIAL_PORT} @ ${BAUD_RATE}`);
    broadcast({ type: 'link', state: 'open', port: SERIAL_PORT, baud: BAUD_RATE });
  });
  serial.on('data', (chunk) => {
    const msgs = parser.feed(chunk);
    for (const m of msgs) {
      if (m.msgid === 0) {
        if (!linkUp) {
          linkUp = true;
          broadcast({ type: 'link', state: 'connected', sysid: m.sysid, compid: m.compid });
        }
        lastHeartbeatAt = Date.now();
      } else if (m.msgid === 22 && m.valid) {
        const pv = decodeParamValue(m);
        if (pv) {
          paramStore.set(pv.param_id, {
            param_id: pv.param_id,
            param_value: pv.param_value,
            param_type: pv.param_type,
            param_type_name: pv.param_type_name,
            param_index: pv.param_index,
            param_count: pv.param_count,
            updatedAt: Date.now(),
          });
          if (pv.param_count > 0) paramCount = pv.param_count;
          broadcast({ type: 'param', data: pv, total: paramCount, received: paramStore.size });

          // Some flight stacks don't emit PARAM_ACK; treat a matching PARAM_VALUE
          // as confirmation of a pending set.
          const pending = pendingAcks.get(pv.param_id);
          if (pending) {
            clearTimeout(pending.timer);
            pendingAcks.delete(pv.param_id);
            sendToOne(pending.ws, {
              type: 'set_result',
              param_id: pv.param_id,
              result: 'ACCEPTED',
              value: pv.param_value,
              source: 'param_value',
            });
          }
        }
      } else if (m.msgid === 127 && m.valid) {
        const ack = decodeParamAck(m);
        if (ack) {
          const pending = pendingAcks.get(ack.param_id);
          if (pending) {
            clearTimeout(pending.timer);
            pendingAcks.delete(ack.param_id);
            sendToOne(pending.ws, {
              type: 'set_result',
              param_id: ack.param_id,
              result: ack.param_result_name,
              result_code: ack.param_result,
              source: 'param_ack',
            });
          }
        }
      }
    }
  });
  serial.on('close', () => {
    linkUp = false;
    console.log('[serial] closed');
    broadcast({ type: 'link', state: 'closed' });
  });
  serial.on('error', (err) => {
    console.error('[serial] error:', err.message);
    broadcast({ type: 'link', state: 'error', error: err.message });
  });
}

function writeSerial(buf) {
  if (serial && serial.writable) serial.write(buf);
}

function requestParamList() {
  paramStore.clear();
  paramCount = 0;
  broadcast({ type: 'params_reset' });
}

// ---- WebSocket ----
const wss = new WebSocketServer({ server, path: '/ws' });

function broadcast(obj) {
  const data = JSON.stringify(obj);
  wss.clients.forEach((c) => { if (c.readyState === 1) c.send(data); });
}

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({
    type: 'hello',
    link: linkUp ? 'connected' : (serial && serial.isOpen ? 'open' : 'closed'),
    total: paramCount,
    params: Array.from(paramStore.values()),
    serial: { port: SERIAL_PORT, baud: BAUD_RATE },
    ackTimeout: ACK_TIMEOUT_MS,
    maxRetries: MAX_RETRIES,
  }));

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch (_) { return; }
    if (!msg || typeof msg.action !== 'string') return;

    switch (msg.action) {
      case 'reconnect': {
        openSerial();
        break;
      }
      case 'reset_list': {
        requestParamList();
        break;
      }
      case 'set_param': {
        const { param_id, param_value, param_type } = msg;
        if (typeof param_id !== 'string' || !param_id) return;
        const prev = paramStore.get(param_id);
        const pType = Number(param_type) || (prev && prev.param_type) || 9;

        // Range validation
        const rangeErr = validateParamRange(param_id, Number(param_value));
        if (rangeErr) {
          sendToOne(ws, {
            type: 'set_invalid',
            param_id,
            requested: param_value,
            range: { min: rangeErr.min, max: rangeErr.max },
          });
          return;
        }

        // If there is already a pending request for this param, cancel its timer.
        const prevPending = pendingAcks.get(param_id);
        if (prevPending) clearTimeout(prevPending.timer);

        sendParamSet(param_id, param_value, pType);
        console.log(`[serial] PARAM_SET ${param_id}=${param_value} (type=${pType})`);
        sendToOne(ws, { type: 'set_pending', param_id, requested: param_value });
        scheduleSetRetry(param_id, param_value, pType, ws, MAX_RETRIES);
        break;
      }
      case 'get_serial_list': {
        SerialPort.list().then((ports) => {
          ws.send(JSON.stringify({ type: 'serial_list', ports: ports.map(p => ({ path: p.path, manufacturer: p.manufacturer })) }));
        }).catch((err) => {
          ws.send(JSON.stringify({ type: 'serial_list', error: err.message }));
        });
        break;
      }
      default: break;
    }
  });
});

openSerial();

process.on('SIGINT', () => {
  try { if (serial) serial.close(); } catch (_) {}
  process.exit(0);
});
