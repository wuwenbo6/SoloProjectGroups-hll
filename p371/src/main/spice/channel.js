const { EventEmitter } = require('events');
const { SpiceWire } = require('./wire');

class SpiceChannel extends EventEmitter {
  constructor(channelType, channelId, wire) {
    super();
    this.channelType = channelType;
    this.channelId = channelId;
    this.wire = wire;
    this.sessionId = 0;
    this.ready = false;

    this._messageHandler = (msg) => this._onMessage(msg);
    this.wire.on('message', this._messageHandler);
  }

  async init(password, sessionId) {
    this.sessionId = sessionId ?? 0;

    const handshake = SpiceWire.buildHandshake(
      2, 2, this.channelType, this.sessionId
    );
    await this.wire.send(handshake);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Channel init timeout'));
      }, 10000);

      const onReady = () => {
        clearTimeout(timeout);
        this.ready = true;
        resolve();
      };

      this.once('ready', onReady);
    });
  }

  send(msgType, payload) {
    const msg = SpiceWire.buildSpiceMessage(msgType, this.channelId, payload);
    return this.wire.send(msg);
  }

  close() {
    this.wire.off('message', this._messageHandler);
    this.wire.close();
    this.ready = false;
  }

  _onMessage(msg) {
    this.emit('channel-message', msg);
  }
}

module.exports = { SpiceChannel };
