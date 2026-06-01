// Minimal MAVLink v1 parser focused on PARAM_VALUE (#22), PARAM_SET (#23), and
// PARAM_ACK (#127). Works with both PX4 and ArduPilot (both speak MAVLink v1 by default).
//
// MAVLink v1 packet layout (https://mavlink.io/en/guide/serialization.html):
//   0xFE STX
//   payload_length (1 byte)
//   seq (1 byte)
//   sysid (1 byte)
//   compid (1 byte)
//   msgid (1 byte)
//   payload (N bytes)
//   crc_low (1 byte)
//   crc_high (1 byte)
//
// PARAM_VALUE (msgid=22):
//   wire order:
//     param_value (float, 4)
//     param_count (uint16, 2)
//     param_index (uint16, 2)
//     param_type  (uint8,  1)
//     param_id    (char[16],16)
//   total payload = 25
//
// PARAM_SET (msgid=23):
//   wire order:
//     param_value (float, 4)
//     target_system (uint8, 1)
//     target_component (uint8, 1)
//     param_id  (char[16], 16)
//     param_type (uint8, 1)
//   total payload = 23
//
// PARAM_ACK (msgid=127):
//   param_id    (char[16], 16)
//   param_result (MAV_PARAM_ACK_RESULT, uint8, 1)
//   total payload = 17

'use strict';

const MAVLINK_STX = 0xFE;

const MAV_TYPE = {
  UINT8:   1,
  UINT16:  3,
  UINT32:  4,
  UINT64:  5,
  INT8:    2,
  INT16:   6,
  INT32:   7,
  INT64:   8,
  FLOAT:   9,
  DOUBLE:  10,
};

const TYPE_NAMES = {
  1: 'uint8', 2: 'int8', 3: 'uint16', 4: 'uint32', 5: 'uint64',
  6: 'int16', 7: 'int32', 8: 'int64', 9: 'float', 10: 'double',
};

// CRC extra byte per message id (needed for final CRC).
// Only IDs we care about; others can still be detected but not validated.
const CRC_EXTRA = {
  22:  220, // PARAM_VALUE
  23:  168, // PARAM_SET
  0:    50, // HEARTBEAT
  127: 139, // PARAM_ACK
};

const MAV_PARAM_ACK_RESULT = {
  0: 'MAV_RESULT_ACCEPTED',
  1: 'MAV_RESULT_TEMPORARILY_REJECTED',
  2: 'MAV_RESULT_DENIED',
  3: 'MAV_RESULT_UNSUPPORTED',
  4: 'MAV_RESULT_FAILED',
  5: 'MAV_RESULT_IN_PROGRESS',
  6: 'MAV_RESULT_CANCELLED',
};

function crc16(buffer, start, end, crcInit = 0xFFFF) {
  let crc = crcInit;
  for (let i = start; i < end; i++) {
    let tmp = buffer[i] ^ (crc & 0xFF);
    tmp ^= (tmp << 4) & 0xFF;
    crc = ((crc >>> 8) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >>> 4)) & 0xFFFF;
  }
  return crc;
}

function readFloatLE(buf, offset) {
  return buf.readFloatLE(offset);
}
function readUInt16LE(buf, offset) {
  return buf.readUInt16LE(offset);
}
function readUInt8(buf, offset) {
  return buf.readUInt8(offset);
}
function readCString(buf, offset, maxLen) {
  let end = offset;
  while (end < offset + maxLen && buf[end] !== 0) end++;
  return buf.toString('ascii', offset, end);
}

// Streaming parser: feed bytes; yields parsed messages.
class MAVLinkParser {
  constructor() {
    this.buf = Buffer.alloc(0);
  }

  feed(bytes) {
    this.buf = Buffer.concat([this.buf, bytes]);
    const out = [];
    while (this.buf.length >= 8) {
      const stx = this.buf[0];
      if (stx !== MAVLINK_STX) {
        // resync
        const idx = this.buf.indexOf(MAVLINK_STX);
        if (idx === -1) { this.buf = Buffer.alloc(0); break; }
        this.buf = this.buf.slice(idx);
        continue;
      }
      const plen = this.buf[1];
      const total = 6 + plen + 2; // header + payload + crc
      if (this.buf.length < total) break;

      const seq    = this.buf[2];
      const sysid  = this.buf[3];
      const compid = this.buf[4];
      const msgid  = this.buf[5];

      // CRC covers header[1..6) + payload + CRC_EXTRA byte
      let crc = crc16(this.buf, 1, 6 + plen, 0xFFFF);
      const extra = CRC_EXTRA[msgid];
      if (extra !== undefined) {
        const tmp = extra ^ (crc & 0xFF);
        const t2 = tmp ^ ((tmp << 4) & 0xFF);
        crc = ((crc >>> 8) ^ (t2 << 8) ^ (t2 << 3) ^ (t2 >>> 4)) & 0xFFFF;
      }
      const crcLow  = this.buf[6 + plen];
      const crcHigh = this.buf[6 + plen + 1];
      const expected = (crcHigh << 8) | crcLow;
      const valid = (extra === undefined) ? true : (crc === expected);

      const payload = this.buf.slice(6, 6 + plen);
      const msg = { sysid, compid, seq, msgid, payload, valid };
      out.push(msg);

      this.buf = this.buf.slice(total);
    }
    return out;
  }
}

// Decode known messages into friendly objects.
function decodeParamValue(msg) {
  if (msg.msgid !== 22) return null;
  const p = msg.payload;
  if (p.length < 25) return null;
  const value = readFloatLE(p, 0);
  const paramCount = readUInt16LE(p, 4);
  const paramIndex = readUInt16LE(p, 6);
  const paramType  = readUInt8(p, 8);
  const paramId    = readCString(p, 9, 16);
  return {
    type: 'PARAM_VALUE',
    sysid: msg.sysid,
    compid: msg.compid,
    param_id: paramId,
    param_value: value,
    param_type: paramType,
    param_type_name: TYPE_NAMES[paramType] || 'unknown',
    param_count: paramCount,
    param_index: paramIndex,
  };
}

// Encode PARAM_SET message.
function encodeParamSet({
  targetSystem = 1,
  targetComponent = 1,
  paramId,
  paramValue,
  paramType = MAV_TYPE.FLOAT,
  seq = 0,
  sysid = 253,
  compid = 0,
}) {
  const payload = Buffer.alloc(23);
  payload.writeFloatLE(Number(paramValue), 0);
  payload.writeUInt8(targetSystem & 0xFF, 4);
  payload.writeUInt8(targetComponent & 0xFF, 5);
  const idBuf = Buffer.alloc(16);
  for (let i = 0; i < paramId.length && i < 15; i++) idBuf[i] = paramId.charCodeAt(i) & 0xFF;
  idBuf.copy(payload, 6, 0, 16);
  payload.writeUInt8(paramType & 0xFF, 22);

  const msgId = 23;
  const header = Buffer.alloc(6);
  header[0] = MAVLINK_STX;
  header[1] = 23;
  header[2] = seq & 0xFF;
  header[3] = sysid & 0xFF;
  header[4] = compid & 0xFF;
  header[5] = msgId;

  let crc = crc16(header, 1, 6, 0xFFFF);
  crc = crc16(payload, 0, payload.length, crc);
  const extra = CRC_EXTRA[msgId] || 0;
  const tmp = extra ^ (crc & 0xFF);
  const t2 = tmp ^ ((tmp << 4) & 0xFF);
  crc = ((crc >>> 8) ^ (t2 << 8) ^ (t2 << 3) ^ (t2 >>> 4)) & 0xFFFF;

  const crcBuf = Buffer.alloc(2);
  crcBuf.writeUInt16LE(crc, 0);
  return Buffer.concat([header, payload, crcBuf]);
}

// Decode PARAM_ACK (msgid=127).
// Wire order: param_id[16], param_result(uint8) — but due to MAVLink wire-format
// reordering the actual order depends on the dialect. For common.xml the fields
// are declared as: param_id (char[16]), param_result (uint8_t), so payload = 17.
function decodeParamAck(msg) {
  if (msg.msgid !== 127) return null;
  const p = msg.payload;
  if (p.length < 17) return null;
  const paramId = readCString(p, 0, 16);
  const result  = readUInt8(p, 16);
  return {
    type: 'PARAM_ACK',
    sysid: msg.sysid,
    compid: msg.compid,
    param_id: paramId,
    param_result: result,
    param_result_name: MAV_PARAM_ACK_RESULT[result] || 'UNKNOWN',
  };
}

module.exports = {
  MAV_TYPE,
  TYPE_NAMES,
  MAV_PARAM_ACK_RESULT,
  MAVLinkParser,
  decodeParamValue,
  decodeParamAck,
  encodeParamSet,
};
