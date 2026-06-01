const { SerialPort } = require('serialport');

class UartTransport {
  constructor() {
    this.port = null;
    this.simulated = true;
    this.simulatedBuffer = [];
    this.onData = null;
    this.onError = null;
    this.isOpen = false;
  }

  async listPorts() {
    try {
      const ports = await SerialPort.list();
      return ports.map(p => ({
        path: p.path,
        manufacturer: p.manufacturer,
        serialNumber: p.serialNumber,
        pnpId: p.pnpId,
      }));
    } catch (err) {
      return [];
    }
  }

  async open(portPath, baudRate) {
    if (!portPath) {
      this.simulated = true;
      this.isOpen = true;
      return { simulated: true, baudRate };
    }

    try {
      this.port = new SerialPort({
        path: portPath,
        baudRate: baudRate || 4800,
        dataBits: 8,
        parity: 'even',
        stopBits: 1,
      });

      await new Promise((resolve, reject) => {
        this.port.on('open', resolve);
        this.port.on('error', reject);
      });

      this.port.on('data', (data) => {
        if (this.onData) this.onData(data);
      });

      this.port.on('error', (err) => {
        if (this.onError) this.onError(err);
      });

      this.simulated = false;
      this.isOpen = true;
      return { simulated: false, baudRate, path: portPath };
    } catch (err) {
      this.simulated = true;
      this.isOpen = true;
      return { simulated: true, baudRate, error: err.message };
    }
  }

  async close() {
    if (this.port && this.port.isOpen) {
      await new Promise(resolve => this.port.close(resolve));
    }
    this.port = null;
    this.simulated = true;
    this.simulatedBuffer = [];
    this.isOpen = false;
  }

  async write(data) {
    if (this.simulated) {
      this.simulatedBuffer.push(Buffer.from(data));
      return data.length;
    }

    if (!this.port || !this.port.isOpen) {
      throw new Error('Port is not open');
    }

    return new Promise((resolve, reject) => {
      this.port.write(data, (err) => {
        if (err) reject(err);
        else resolve(data.length);
      });
    });
  }

  getSimulatedBuffer() {
    const buf = this.simulatedBuffer.slice();
    this.simulatedBuffer = [];
    return buf;
  }
}

module.exports = UartTransport;
