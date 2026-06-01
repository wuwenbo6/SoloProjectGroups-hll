const { EventEmitter } = require('events');
const { SpiceChannel } = require('./channel');

const SPICE_SMARTCARD_MSG_TYPE = {
  CLIENT_TOKEN: 1,
  DATA: 2,
  ERROR: 3,
};

const VSC_MSG_TYPE = {
  SERVER_ERROR: 0x01,
  SERVER_INIT: 0x02,
  SERVER_READER_ADD: 0x03,
  SERVER_READER_REMOVE: 0x04,
  SERVER_SET_OPTIONS: 0x05,
  SERVER_APDU_REQUEST: 0x06,
  SERVER_ATR_REQUEST: 0x07,
  SERVER_CLOSE: 0x08,

  CLIENT_INIT: 0x81,
  CLIENT_READER_ADD_RESPONSE: 0x82,
  CLIENT_READER_REMOVE_RESPONSE: 0x83,
  CLIENT_APDU_RESPONSE: 0x84,
  CLIENT_ATR_RESPONSE: 0x85,
  CLIENT_ERROR: 0x86,
};

class SmartcardChannel extends SpiceChannel {
  constructor(channelType, channelId, wire) {
    super(channelType, channelId, wire);
    this.readers = new Map();
    this._slotMapping = new Map();
    this._nextReaderId = 1;

    this.on('channel-message', (msg) => this._handleMessage(msg));
  }

  addVirtualReader(readerName, slotId = 0) {
    const readerId = this._nextReaderId++;
    this.readers.set(readerId, { id: readerId, name: readerName, slotId });
    this._slotMapping.set(slotId, readerId);
    return readerId;
  }

  removeVirtualReader(readerId) {
    const reader = this.readers.get(readerId);
    if (reader) {
      this._slotMapping.delete(reader.slotId);
      this.readers.delete(readerId);
    }
  }

  getReadersList() {
    return Array.from(this.readers.values());
  }

  getReaderIdBySlot(slotId) {
    return this._slotMapping.get(slotId);
  }

  getSlotByReaderId(readerId) {
    const reader = this.readers.get(readerId);
    return reader ? reader.slotId : null;
  }

  getSlotCount() {
    return this.readers.size;
  }

  _handleMessage(msg) {
    if (msg.data.length < 4) return;

    const vscType = msg.data.readUInt8(4);

    switch (vscType) {
      case VSC_MSG_TYPE.SERVER_INIT: {
        this._onServerInit(msg.data);
        break;
      }
      case VSC_MSG_TYPE.SERVER_READER_ADD: {
        this._onReaderAdd(msg.data);
        break;
      }
      case VSC_MSG_TYPE.SERVER_READER_REMOVE: {
        this._onReaderRemove(msg.data);
        break;
      }
      case VSC_MSG_TYPE.SERVER_APDU_REQUEST: {
        this._onApduRequest(msg.data);
        break;
      }
      case VSC_MSG_TYPE.SERVER_ATR_REQUEST: {
        this._onAtrRequest(msg.data);
        break;
      }
      case VSC_MSG_TYPE.SERVER_ERROR: {
        this._onServerError(msg.data);
        break;
      }
      case VSC_MSG_TYPE.SERVER_CLOSE: {
        this._onServerClose();
        break;
      }
      default: {
        this.emit('message', {
          type: 'UNKNOWN',
          vscType,
          data: msg.data,
        });
      }
    }
  }

  _onServerInit(data) {
    const readerId = data.length > 8 ? data.readUInt32LE(8) : 0;
    this.emit('message', {
      type: 'VSC_INIT',
      readerId,
      raw: data,
    });

    this._sendVscMessage(VSC_MSG_TYPE.CLIENT_INIT, Buffer.alloc(0));
    this.emit('ready');
  }

  _onReaderAdd(data) {
    if (data.length < 12) return;

    const readerId = data.readUInt32LE(8);
    const nameLen = data.length > 12 ? data.readUInt32LE(12) : 0;
    let name = '';
    if (nameLen > 0 && data.length >= 20 + nameLen) {
      name = data.subarray(20, 20 + nameLen).toString('utf8');
    }

    if (!this.readers.has(readerId)) {
      const slotId = this._findAvailableSlot();
      this.readers.set(readerId, { id: readerId, name, slotId });
      this._slotMapping.set(slotId, readerId);
    } else {
      const existing = this.readers.get(readerId);
      existing.name = name;
    }

    this.emit('message', {
      type: 'VSC_READER_ADD',
      readerId,
      name,
      slotId: this.readers.get(readerId)?.slotId,
    });
  }

  _findAvailableSlot() {
    let slotId = 0;
    while (this._slotMapping.has(slotId)) {
      slotId++;
    }
    return slotId;
  }

  _onReaderRemove(data) {
    if (data.length < 12) return;

    const readerId = data.readUInt32LE(8);
    const reader = this.readers.get(readerId);
    if (reader) {
      this._slotMapping.delete(reader.slotId);
      this.readers.delete(readerId);
    }

    this.emit('message', {
      type: 'VSC_READER_REMOVE',
      readerId,
      slotId: reader?.slotId,
    });
  }

  _onApduRequest(data) {
    if (data.length < 16) return;

    const readerId = data.readUInt32LE(8);
    const apduLen = data.readUInt32LE(12);
    const apdu = data.length >= 16 + apduLen ? data.subarray(16, 16 + apduLen) : Buffer.alloc(0);
    const reader = this.readers.get(readerId);

    this.emit('message', {
      type: 'PCSC_APDU_REQUEST',
      reader: this._resolveReaderName(readerId),
      readerId,
      slotId: reader?.slotId,
      apdu: apdu,
      apduHex: apdu.toString('hex'),
    });
  }

  _onAtrRequest(data) {
    if (data.length < 12) return;

    const readerId = data.readUInt32LE(8);
    const reader = this.readers.get(readerId);

    this.emit('message', {
      type: 'PCSC_ATR_REQUEST',
      reader: this._resolveReaderName(readerId),
      readerId,
      slotId: reader?.slotId,
    });
  }

  _onServerError(data) {
    let errorCode = 0;
    if (data.length >= 12) {
      errorCode = data.readUInt32LE(8);
    }
    this.emit('message', {
      type: 'VSC_ERROR',
      errorCode,
    });
  }

  _onServerClose() {
    this.emit('message', {
      type: 'VSC_CLOSE',
    });
  }

  sendResponse(response) {
    switch (response.type) {
      case 'PCSC_APDU_RESPONSE': {
        this._sendApduResponse(response);
        break;
      }
      case 'PCSC_ATR_RESPONSE': {
        this._sendAtrResponse(response);
        break;
      }
      case 'PCSC_CONNECT_RESPONSE': {
        const atrBuf = response.atr ? Buffer.from(response.atr, 'hex') : Buffer.alloc(0);
        this._sendVscMessage(VSC_MSG_TYPE.CLIENT_READER_ADD_RESPONSE, atrBuf);
        break;
      }
      case 'PCSC_DISCONNECT_RESPONSE': {
        this._sendVscMessage(VSC_MSG_TYPE.CLIENT_READER_REMOVE_RESPONSE, Buffer.alloc(0));
        break;
      }
      default: {
        if (response.error) {
          const errBuf = Buffer.alloc(4);
          errBuf.writeUInt32LE(1, 0);
          this._sendVscMessage(VSC_MSG_TYPE.CLIENT_ERROR, errBuf);
        }
      }
    }
  }

  _sendApduResponse(response) {
    const apduData = response.data ? Buffer.from(response.data, 'hex') : Buffer.alloc(0);
    const swData = response.sw ? Buffer.from(response.sw, 'hex') : Buffer.alloc(0);
    const payload = Buffer.concat([apduData, swData]);
    this._sendVscMessage(VSC_MSG_TYPE.CLIENT_APDU_RESPONSE, payload);
  }

  _sendAtrResponse(response) {
    const atrData = response.atr ? Buffer.from(response.atr, 'hex') : Buffer.alloc(0);
    this._sendVscMessage(VSC_MSG_TYPE.CLIENT_ATR_RESPONSE, atrData);
  }

  _sendVscMessage(vscType, payload) {
    const headerSize = 8;
    const payloadBuf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
    const buf = Buffer.alloc(headerSize + payloadBuf.length);

    buf.writeUInt32LE(payloadBuf.length + 4, 0);
    buf.writeUInt8(vscType, 4);
    buf.writeUInt8(0, 5);
    buf.writeUInt8(0, 6);
    buf.writeUInt8(0, 7);
    payloadBuf.copy(buf, headerSize);

    this.send(SPICE_SMARTCARD_MSG_TYPE.DATA, buf);
  }

  _resolveReaderName(readerId) {
    const reader = this.readers.get(readerId);
    return reader ? reader.name : `reader-${readerId}`;
  }
}

module.exports = { SmartcardChannel, VSC_MSG_TYPE };
