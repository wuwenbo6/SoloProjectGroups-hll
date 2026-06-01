const net = require('net');
const dgram = require('dgram');
const os = require('os');
const fs = require('fs');
const path = require('path');

const VXI11_CORE_PROG = 0x0607B0;
const VXI11_CORE_VERS = 1;

const VXI11_CREATE_LINK = 10;
const VXI11_DEVICE_WRITE = 11;
const VXI11_DEVICE_READ = 12;
const VXI11_DESTROY_LINK = 23;

const RPC_VERSION = 2;
const RPC_MSG_CALL = 0;
const RPC_MSG_REPLY = 1;

const PORTMAPPER_PROG = 100000;
const PORTMAPPER_VERS = 2;
const PORTMAPPER_GETPORT = 3;
const PORTMAPPER_PORT = 111;

const VXI11_WRITE_END = 0x08;

const DEFAULT_CHUNK_SIZE = 4096;
const PORTMAP_MAX_RETRIES = 3;
const PORTMAP_RETRY_DELAY = 500;
const PORTMAP_UDP_TIMEOUT = 2000;

const DISCOVERY_TIMEOUT = 3000;
const DISCOVERY_BROADCAST_ADDR = '255.255.255.255';

const SNAPSHOT_COMMANDS = [
  { name: 'identity', cmd: '*IDN?', isQuery: true },
  { name: 'options', cmd: '*OPT?', isQuery: true },
  { name: 'errorQueue', cmd: 'SYST:ERR?', isQuery: true },
  { name: 'statusByte', cmd: '*STB?', isQuery: true },
  { name: 'eventStatus', cmd: '*ESR?', isQuery: true },
  { name: 'operationComplete', cmd: '*OPC?', isQuery: true },
  { name: 'frequencyCenter', cmd: 'FREQ:CENT?', isQuery: true },
  { name: 'frequencyStart', cmd: 'FREQ:STAR?', isQuery: true },
  { name: 'frequencyStop', cmd: 'FREQ:STOP?', isQuery: true },
  { name: 'frequencySpan', cmd: 'FREQ:SPAN?', isQuery: true },
  { name: 'referenceLevel', cmd: 'DISP:WIND:TRAC:Y:RLEV?', isQuery: true },
  { name: 'attenuation', cmd: 'INP:ATT?', isQuery: true },
  { name: 'bandwidthResolution', cmd: 'BAND?', isQuery: true },
  { name: 'sweepPoints', cmd: 'SWE:POIN?', isQuery: true },
  { name: 'sweepTime', cmd: 'SWE:TIME?', isQuery: true },
  { name: 'sweepCount', cmd: 'SWE:COUN?', isQuery: true },
  { name: 'traceType', cmd: 'TRAC:TYPE?', isQuery: true },
  { name: 'displayFormat', cmd: 'DISP:WIND:TRAC:Y:SPAC?', isQuery: true }
];

class Vxi11Client {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.linkId = 0;
    this.xid = 0;
    this.timeout = 5000;
    this.maxRecvSize = 4096;
    this.chunkSize = DEFAULT_CHUNK_SIZE;
  }

  async connect(host, device = 'inst0') {
    try {
      const port = await this._getPort(host);
      this.socket = new net.Socket();

      await new Promise((resolve, reject) => {
        this.socket.setTimeout(this.timeout);
        this.socket.connect(port, host, () => {
          this.connected = true;
          resolve();
        });
        this.socket.on('error', (err) => reject(err));
        this.socket.on('timeout', () => reject(new Error('Connection timeout')));
      });

      this.socket.removeAllListeners('error');
      this.socket.removeAllListeners('timeout');

      this.socket.on('error', (err) => {
        this.connected = false;
        this.linkId = 0;
      });

      this._currentHost = host;
      this._currentDevice = device;

      await this._createLink(device);
      return true;
    } catch (error) {
      this.connected = false;
      throw new Error(`Connection failed: ${error.message}`);
    }
  }

  disconnect() {
    if (this.connected && this.linkId) {
      this._destroyLink().catch(() => {});
    }
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.connected = false;
    this.linkId = 0;
  }

  isConnected() {
    return this.connected && this.socket && !this.socket.destroyed;
  }

  async sendCommand(command) {
    if (!this.isConnected()) {
      throw new Error('Not connected to device');
    }
    await this._deviceWriteChunked(command + '\n');
    return 'OK';
  }

  async query(command) {
    if (!this.isConnected()) {
      throw new Error('Not connected to device');
    }
    await this._deviceWriteChunked(command + '\n');
    const response = await this._deviceRead();
    return response.trim();
  }

  async _getPort(host) {
    for (let attempt = 1; attempt <= PORTMAP_MAX_RETRIES; attempt++) {
      try {
        const port = await this._getPortUdp(host, attempt);
        return port;
      } catch (error) {
        if (attempt === PORTMAP_MAX_RETRIES) {
          throw new Error(
            `Portmapper GETPORT failed after ${PORTMAP_MAX_RETRIES} retries: ${error.message}`
          );
        }
        await this._sleep(PORTMAP_RETRY_DELAY);
      }
    }
  }

  _getPortUdp(host, attempt) {
    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket('udp4');
      let resolved = false;

      const xid = this._nextXid();
      const rpcCall = this._buildRpcCall(xid, PORTMAPPER_PROG, PORTMAPPER_VERS, PORTMAPPER_GETPORT);

      const mapping = Buffer.alloc(20);
      mapping.writeUInt32BE(VXI11_CORE_PROG, 0);
      mapping.writeUInt32BE(VXI11_CORE_VERS, 4);
      mapping.writeUInt32BE(6, 8);
      mapping.writeUInt32BE(0, 12);
      mapping.writeUInt32BE(0, 16);

      const message = Buffer.concat([rpcCall, mapping]);

      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          socket.close();
          reject(new Error(`UDP portmapper timeout (attempt ${attempt}/${PORTMAP_MAX_RETRIES})`));
        }
      }, PORTMAP_UDP_TIMEOUT);

      socket.on('message', (msg, rinfo) => {
        if (resolved) return;

        try {
          if (msg.length < 28) {
            return;
          }

          const replyXid = msg.readUInt32BE(0);
          const replyType = msg.readUInt32BE(4);
          const replyStatus = msg.readUInt32BE(8);

          if (replyType !== RPC_MSG_REPLY) return;
          if (replyStatus !== 0) return;

          const port = msg.readUInt32BE(msg.length - 4);

          resolved = true;
          clearTimeout(timeoutId);
          socket.close();
          resolve(port);
        } catch (parseError) {
          reject(new Error(`Portmapper response parse error: ${parseError.message}`));
        }
      });

      socket.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          socket.close();
          reject(err);
        }
      });

      socket.send(message, PORTMAPPER_PORT, host, (err) => {
        if (err) {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeoutId);
            socket.close();
            reject(err);
          }
        }
      });
    });
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  _nextXid() {
    this.xid = (this.xid + 1) & 0xFFFFFFFF;
    return this.xid;
  }

  _buildRpcCall(xid, prog, vers, proc) {
    const buf = Buffer.alloc(40);
    buf.writeUInt32BE(xid, 0);
    buf.writeUInt32BE(RPC_MSG_CALL, 4);
    buf.writeUInt32BE(RPC_VERSION, 8);
    buf.writeUInt32BE(prog, 12);
    buf.writeUInt32BE(vers, 16);
    buf.writeUInt32BE(proc, 20);
    buf.writeUInt32BE(0, 24);
    buf.writeUInt32BE(0, 28);
    buf.writeUInt32BE(0, 32);
    buf.writeUInt32BE(0, 36);
    return buf;
  }

  _buildRecord(data) {
    const record = Buffer.alloc(4 + data.length);
    record.writeUInt32BE(0x80000000 | data.length, 0);
    data.copy(record, 4);
    return record;
  }

  async _sendAndReceive(callBuf) {
    return new Promise((resolve, reject) => {
      const record = this._buildRecord(callBuf);
      this.socket.write(record);

      let data = Buffer.alloc(0);
      let timeoutId;

      const onData = (chunk) => {
        data = Buffer.concat([data, chunk]);
        if (data.length >= 8) {
          const fragmentHeader = data.readUInt32BE(0);
          const fragLen = fragmentHeader & 0x7FFFFFFF;

          if (data.length >= 4 + fragLen) {
            clearTimeout(timeoutId);
            this.socket.removeListener('data', onData);
            const reply = data.slice(4, 4 + fragLen);

            const replyXid = reply.readUInt32BE(0);
            const replyType = reply.readUInt32BE(4);
            const replyStatus = reply.readUInt32BE(8);

            if (replyType !== RPC_MSG_REPLY) {
              reject(new Error('Invalid RPC reply type'));
              return;
            }
            if (replyStatus !== 0) {
              reject(new Error(`RPC call rejected, status: ${replyStatus}`));
              return;
            }

            resolve(reply);
          }
        }
      };

      timeoutId = setTimeout(() => {
        this.socket.removeListener('data', onData);
        reject(new Error('RPC timeout'));
      }, this.timeout);

      this.socket.on('data', onData);
    });
  }

  async _createLink(device) {
    const xid = this._nextXid();
    const rpcHeader = this._buildRpcCall(xid, VXI11_CORE_PROG, VXI11_CORE_VERS, VXI11_CREATE_LINK);

    const deviceBuf = Buffer.from(device, 'ascii');
    const padLen = (4 - (deviceBuf.length % 4)) % 4;
    const paddedDevice = Buffer.concat([deviceBuf, Buffer.alloc(padLen)]);

    const params = Buffer.alloc(16 + paddedDevice.length);
    params.writeUInt32BE(0, 0);
    params.writeUInt32BE(0, 4);
    params.writeUInt32BE(deviceBuf.length, 8);
    params.writeUInt32BE(0, 12);
    paddedDevice.copy(params, 16);

    const reply = await this._sendAndReceive(Buffer.concat([rpcHeader, params]));

    const errorCode = reply.readUInt32BE(24);
    if (errorCode !== 0) {
      throw new Error(`Create link failed, error: ${errorCode}`);
    }

    this.linkId = reply.readUInt32BE(28);
    this.maxRecvSize = reply.readUInt32BE(32) || 4096;
  }

  async _destroyLink() {
    if (!this.linkId) return;

    const xid = this._nextXid();
    const rpcHeader = this._buildRpcCall(xid, VXI11_CORE_PROG, VXI11_CORE_VERS, VXI11_DESTROY_LINK);

    const params = Buffer.alloc(4);
    params.writeUInt32BE(this.linkId, 0);

    try {
      await this._sendAndReceive(Buffer.concat([rpcHeader, params]));
    } catch (e) {
    }
    this.linkId = 0;
  }

  async _deviceWriteChunked(data) {
    const dataBuf = Buffer.from(data, 'ascii');
    const totalLen = dataBuf.length;

    if (totalLen <= this.chunkSize) {
      await this._deviceWrite(dataBuf, 0, totalLen, VXI11_WRITE_END);
      return;
    }

    let offset = 0;
    while (offset < totalLen) {
      const remaining = totalLen - offset;
      const chunkLen = Math.min(remaining, this.chunkSize);
      const isLast = (offset + chunkLen >= totalLen);
      const flags = isLast ? VXI11_WRITE_END : 0;

      await this._deviceWrite(dataBuf, offset, chunkLen, flags);
      offset += chunkLen;
    }
  }

  async _deviceWrite(dataBuf, offset, length, flags) {
    const xid = this._nextXid();
    const rpcHeader = this._buildRpcCall(xid, VXI11_CORE_PROG, VXI11_CORE_VERS, VXI11_DEVICE_WRITE);

    const chunkBuf = dataBuf.slice(offset, offset + length);
    const padLen = (4 - (chunkBuf.length % 4)) % 4;
    const paddedData = Buffer.concat([chunkBuf, Buffer.alloc(padLen)]);

    const params = Buffer.alloc(24 + paddedData.length);
    params.writeUInt32BE(this.linkId, 0);
    params.writeUInt32BE(length, 4);
    params.writeUInt32BE(flags, 8);
    params.writeUInt32BE(this.timeout, 12);
    params.writeUInt32BE(0, 16);
    params.writeUInt32BE(length, 20);
    paddedData.copy(params, 24);

    const reply = await this._sendAndReceive(Buffer.concat([rpcHeader, params]));

    const errorCode = reply.readUInt32BE(24);
    if (errorCode !== 0) {
      throw new Error(`Device write failed (offset=${offset}, len=${length}, flags=0x${flags.toString(16)}), error: ${errorCode}`);
    }
  }

  async _deviceRead() {
    let fullData = Buffer.alloc(0);
    let reason = 0;

    do {
      const chunk = await this._deviceReadOnce();
      fullData = Buffer.concat([fullData, chunk.data]);
      reason = chunk.reason;
    } while (reason === 0 && fullData.length < this.maxRecvSize);

    return fullData.toString('ascii');
  }

  async _deviceReadOnce() {
    const xid = this._nextXid();
    const rpcHeader = this._buildRpcCall(xid, VXI11_CORE_PROG, VXI11_CORE_VERS, VXI11_DEVICE_READ);

    const params = Buffer.alloc(20);
    params.writeUInt32BE(this.linkId, 0);
    params.writeUInt32BE(this.maxRecvSize, 4);
    params.writeUInt32BE(0, 8);
    params.writeUInt32BE(this.timeout, 12);
    params.writeUInt32BE(0, 16);

    const reply = await this._sendAndReceive(Buffer.concat([rpcHeader, params]));

    const errorCode = reply.readUInt32BE(24);
    if (errorCode !== 0) {
      throw new Error(`Device read failed, error: ${errorCode}`);
    }

    const dataLen = reply.readUInt32BE(28);
    const reason = reply.readUInt32BE(32);
    const data = reply.slice(36, 36 + dataLen);

    return { data, reason };
  }

  async discoverDevices() {
    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket('udp4');
      const devices = [];
      const seenHosts = new Set();
      let finished = false;

      socket.on('error', (err) => {
        if (!finished) {
          finished = true;
          try { socket.close(); } catch (e) {}
          reject(err);
        }
      });

      socket.on('message', (msg, rinfo) => {
        if (finished) return;

        try {
          if (msg.length < 28) return;

          const replyType = msg.readUInt32BE(4);
          const replyStatus = msg.readUInt32BE(8);

          if (replyType !== RPC_MSG_REPLY) return;
          if (replyStatus !== 0) return;

          const port = msg.readUInt32BE(msg.length - 4);

          if (port > 0 && !seenHosts.has(rinfo.address)) {
            seenHosts.add(rinfo.address);
            devices.push({
              host: rinfo.address,
              port: port,
              detectedAt: new Date().toISOString()
            });
          }
        } catch (parseError) {
        }
      });

      socket.bind(0, () => {
        socket.setBroadcast(true);

        const xid = this._nextXid();
        const rpcCall = this._buildRpcCall(xid, PORTMAPPER_PROG, PORTMAPPER_VERS, PORTMAPPER_GETPORT);

        const mapping = Buffer.alloc(20);
        mapping.writeUInt32BE(VXI11_CORE_PROG, 0);
        mapping.writeUInt32BE(VXI11_CORE_VERS, 4);
        mapping.writeUInt32BE(6, 8);
        mapping.writeUInt32BE(0, 12);
        mapping.writeUInt32BE(0, 16);

        const message = Buffer.concat([rpcCall, mapping]);

        const broadcastAddresses = this._getBroadcastAddresses();
        broadcastAddresses.forEach(addr => {
          socket.send(message, PORTMAPPER_PORT, addr, (err) => {
          });
        });

        socket.send(message, PORTMAPPER_PORT, DISCOVERY_BROADCAST_ADDR, (err) => {
        });

        setTimeout(() => {
          if (!finished) {
            finished = true;
            try { socket.close(); } catch (e) {}
            resolve(devices);
          }
        }, DISCOVERY_TIMEOUT);
      });
    });
  }

  _getBroadcastAddresses() {
    const interfaces = os.networkInterfaces();
    const addresses = [];

    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          const ipParts = iface.address.split('.');
          const maskParts = iface.netmask.split('.');
          const broadcast = [];

          for (let i = 0; i < 4; i++) {
            broadcast.push((parseInt(ipParts[i]) | ~parseInt(maskParts[i])) & 0xFF);
          }

          const broadcastAddr = broadcast.join('.');
          if (broadcastAddr !== '255.255.255.255' && !addresses.includes(broadcastAddr)) {
            addresses.push(broadcastAddr);
          }
        }
      }
    }

    return addresses;
  }

  async takeSnapshot() {
    if (!this.isConnected()) {
      throw new Error('Not connected to device');
    }

    const snapshot = {
      version: '1.0',
      host: this._currentHost || 'unknown',
      device: this._currentDevice || 'inst0',
      createdAt: new Date().toISOString(),
      settings: {}
    };

    for (const item of SNAPSHOT_COMMANDS) {
      try {
        const response = await this.query(item.cmd);
        snapshot.settings[item.name] = {
          command: item.cmd,
          value: response,
          timestamp: new Date().toISOString(),
          isQuery: item.isQuery
        };
      } catch (error) {
        snapshot.settings[item.name] = {
          command: item.cmd,
          error: error.message,
          timestamp: new Date().toISOString(),
          isQuery: item.isQuery
        };
      }
    }

    return snapshot;
  }

  async saveSnapshot(filePath) {
    const snapshot = await this.takeSnapshot();
    const data = JSON.stringify(snapshot, null, 2);
    fs.writeFileSync(filePath, data, 'utf8');
    return snapshot;
  }

  async loadSnapshot(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Snapshot file not found: ${filePath}`);
    }

    const data = fs.readFileSync(filePath, 'utf8');
    const snapshot = JSON.parse(data);
    return snapshot;
  }

  async restoreSnapshot(snapshot) {
    if (!this.isConnected()) {
      throw new Error('Not connected to device');
    }

    const results = [];
    const writableCommands = [
      { name: 'frequencyCenter', setCmd: 'FREQ:CENT' },
      { name: 'frequencyStart', setCmd: 'FREQ:STAR' },
      { name: 'frequencyStop', setCmd: 'FREQ:STOP' },
      { name: 'frequencySpan', setCmd: 'FREQ:SPAN' },
      { name: 'referenceLevel', setCmd: 'DISP:WIND:TRAC:Y:RLEV' },
      { name: 'attenuation', setCmd: 'INP:ATT' },
      { name: 'bandwidthResolution', setCmd: 'BAND' },
      { name: 'sweepPoints', setCmd: 'SWE:POIN' },
      { name: 'sweepTime', setCmd: 'SWE:TIME' },
      { name: 'sweepCount', setCmd: 'SWE:COUN' },
      { name: 'traceType', setCmd: 'TRAC:TYPE' },
      { name: 'displayFormat', setCmd: 'DISP:WIND:TRAC:Y:SPAC' }
    ];

    for (const item of writableCommands) {
      const setting = snapshot.settings[item.name];
      if (setting && setting.value && !setting.error) {
        try {
          const command = `${item.setCmd} ${setting.value}`;
          const result = await this.sendCommand(command);
          results.push({
            name: item.name,
            command: command,
            success: true,
            result: result
          });
        } catch (error) {
          results.push({
            name: item.name,
            command: item.setCmd,
            success: false,
            error: error.message
          });
        }
      }
    }

    return results;
  }

  async listSnapshots(directory) {
    const snapDir = directory || this._getSnapshotDirectory();
    if (!fs.existsSync(snapDir)) {
      return [];
    }

    const files = fs.readdirSync(snapDir);
    const snapshots = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(snapDir, file);
        try {
          const data = fs.readFileSync(filePath, 'utf8');
          const snapshot = JSON.parse(data);
          snapshots.push({
            file: file,
            path: filePath,
            host: snapshot.host,
            device: snapshot.device,
            createdAt: snapshot.createdAt,
            identity: snapshot.settings.identity?.value || 'Unknown'
          });
        } catch (e) {
        }
      }
    }

    return snapshots.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  _getSnapshotDirectory() {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '.';
    const snapDir = path.join(homeDir, '.vxi-scpi-controller', 'snapshots');
    if (!fs.existsSync(snapDir)) {
      fs.mkdirSync(snapDir, { recursive: true });
    }
    return snapDir;
  }

  generateSnapshotFilename() {
    const now = new Date();
    const timestamp = now.toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '_')
      .substring(0, 19);
    return `snapshot_${timestamp}.json`;
  }
}

module.exports = Vxi11Client;
