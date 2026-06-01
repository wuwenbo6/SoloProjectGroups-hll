const { EventEmitter } = require('events');
const { SpiceChannel } = require('./channel');
const { SpiceWire } = require('./wire');
const { SmartcardChannel } = require('./smartcard-channel');

const SPICE_CHANNEL_MAIN = 1;
const SPICE_CHANNEL_SMARTCARD = 12;

class SpiceClient extends EventEmitter {
  constructor(config) {
    super();
    this.host = config.host || '127.0.0.1';
    this.port = config.port || 5900;
    this.password = config.password || '';
    this.secure = config.secure || false;
    this.channels = new Map();
    this.mainChannel = null;
    this.smartcardChannel = null;
    this.connected = false;
    this.messageId = 0;
  }

  async connect() {
    const wire = new SpiceWire(this.host, this.port, this.secure);
    await wire.connect();

    this.mainChannel = new SpiceChannel(SPICE_CHANNEL_MAIN, 0, wire);
    this.mainChannel.on('ready', () => {
      this._onMainChannelReady();
    });
    this.mainChannel.on('error', (err) => {
      this.emit('error', err);
    });
    this.mainChannel.on('close', () => {
      this._onDisconnected();
    });

    await this.mainChannel.init(this.password);
    this.connected = true;
    this.emit('connected');
  }

  async _onMainChannelReady() {
    try {
      const scWire = new SpiceWire(this.host, this.port, this.secure);
      await scWire.connect();

      this.smartcardChannel = new SmartcardChannel(SPICE_CHANNEL_SMARTCARD, this.channels.size, scWire);
      this.smartcardChannel.on('message', (msg) => {
        this.emit('smartcard-message', msg);
      });
      this.smartcardChannel.on('error', (err) => {
        this.emit('error', err);
      });

      await this.smartcardChannel.init(this.mainChannel.sessionId);
      this.channels.set(SPICE_CHANNEL_SMARTCARD, this.smartcardChannel);
    } catch (err) {
      this.emit('error', new Error(`Failed to open smartcard channel: ${err.message}`));
    }
  }

  sendSmartCardResponse(response) {
    if (this.smartcardChannel) {
      this.smartcardChannel.sendResponse(response);
    }
  }

  disconnect() {
    for (const [, channel] of this.channels) {
      channel.close();
    }
    this.channels.clear();

    if (this.mainChannel) {
      this.mainChannel.close();
      this.mainChannel = null;
    }
    if (this.smartcardChannel) {
      this.smartcardChannel = null;
    }
    this._onDisconnected();
  }

  _onDisconnected() {
    this.connected = false;
    this.emit('disconnected');
  }

  nextMessageId() {
    return ++this.messageId;
  }
}

module.exports = { SpiceClient };
