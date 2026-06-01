const net = require('net');
const tls = require('tls');
const { EventEmitter } = require('events');
const { Buffer } = require('buffer');

const SPICE_MAGIC = 0x52454451;
const SPICE_VERSION_MAJOR = 2;
const SPICE_VERSION_MINOR = 2;

class SpiceWire extends EventEmitter {
  constructor(host, port, secure = false) {
    super();
    this.host = host;
    this.port = port;
    this.secure = secure;
    this.socket = null;
    this.connected = false;
    this._buffer = Buffer.alloc(0);
  }

  connect() {
    return new Promise((resolve, reject) => {
      const socketFactory = this.secure ? tls : net;

      this.socket = socketFactory.connect({
        host: this.host,
        port: this.port,
        rejectUnauthorized: false,
      });

      this.socket.on('data', (data) => {
        this._onData(data);
      });

      this.socket.on('error', (err) => {
        if (!this.connected) {
          reject(err);
        } else {
          this.emit('error', err);
        }
      });

      this.socket.on('close', () => {
        this.connected = false;
        this.emit('close');
      });

      this.socket.on('connect', () => {
        this.connected = true;
        resolve();
      });
    });
  }

  send(data) {
    if (!this.socket || !this.connected) {
      throw new Error('Wire not connected');
    }
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    return new Promise((resolve, reject) => {
      this.socket.write(buf, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  close() {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
      this.connected = false;
    }
  }

  _onData(data) {
    this._buffer = Buffer.concat([this._buffer, data]);
    this.emit('raw-data', this._buffer);
    this._tryParse();
  }

  _tryParse() {
    while (this._buffer.length >= 6) {
      const msgType = this._buffer.readUInt16LE(0);
      const msgSize = this._buffer.readUInt32LE(2);

      if (this._buffer.length < msgSize) break;

      const msgData = this._buffer.subarray(0, msgSize);
      this._buffer = this._buffer.subarray(msgSize);

      this.emit('message', {
        type: msgType,
        size: msgSize,
        data: msgData,
      });
    }
  }

  static buildHandshake(majorVersion, minorVersion, channelId, sessionId) {
    const buf = Buffer.alloc(18);
    buf.writeUInt32LE(SPICE_MAGIC, 0);
    buf.writeUInt32LE(majorVersion, 4);
    buf.writeUInt32LE(minorVersion, 8);
    buf.writeUInt32LE(channelId, 12);
    buf.writeUInt32LE(sessionId ?? 0, 14);
    return buf;
  }

  static buildSpiceMessage(msgType, channelId, payload) {
    const headerSize = 16;
    const payloadBuf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
    const totalSize = headerSize + payloadBuf.length;

    const buf = Buffer.alloc(totalSize);
    buf.writeUInt32LE(totalSize, 0);
    buf.writeUInt16LE(msgType, 4);
    buf.writeUInt16LE(channelId, 6);
    buf.writeUInt32LE(0, 8);
    buf.writeUInt32LE(0, 12);
    payloadBuf.copy(buf, headerSize);

    return buf;
  }
}

module.exports = { SpiceWire, SPICE_MAGIC, SPICE_VERSION_MAJOR, SPICE_VERSION_MINOR };
