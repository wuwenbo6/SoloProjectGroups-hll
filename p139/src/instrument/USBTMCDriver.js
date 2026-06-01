class USBTMCDriver {
  constructor() {
    this.devices = new Map();
  }

  async listDevices() {
    const usbtmcDevices = [];

    usbtmcDevices.push({
      id: 'usbtmc:simulator',
      name: 'USBTMC Simulator (Demo) - Oscilloscope',
      vendorId: 0x0000,
      productId: 0x0001,
      manufacturer: 'Demo Instruments',
      product: 'Oscilloscope Sim'
    });

    usbtmcDevices.push({
      id: 'usbtmc:simulator2',
      name: 'USBTMC Simulator (Demo) - Power Supply',
      vendorId: 0x0000,
      productId: 0x0002,
      manufacturer: 'Demo Instruments',
      product: 'Power Supply Sim'
    });

    return usbtmcDevices;
  }

  async connect(deviceId) {
    return {
      type: 'simulator',
      id: deviceId,
      buffer: '',
      lastCommand: '',
      outputState: false,
      voltageSetting: 5.0,
      currentSetting: 1.0
    };
  }

  async disconnect(connection) {
    return Promise.resolve();
  }

  async send(connection, data) {
    connection.lastCommand = data.trim();
    
    const cmd = connection.lastCommand;
    if (cmd === 'OUTP ON') connection.outputState = true;
    if (cmd === 'OUTP OFF') connection.outputState = false;
    if (cmd.startsWith('VOLT ')) {
      connection.voltageSetting = parseFloat(cmd.split(' ')[1]) || 5.0;
    }
    if (cmd.startsWith('CURR ')) {
      connection.currentSetting = parseFloat(cmd.split(' ')[1]) || 1.0;
    }
    
    return Promise.resolve();
  }

  async read(connection) {
    return this._simulateResponse(connection.lastCommand, connection);
  }

  _simulateResponse(command, conn) {
    const responses = {
      '*IDN?': `Demo,${conn.id === 'usbtmc:simulator' ? 'Oscilloscope' : 'PowerSupply'},12345,01.00`,
      '*RST': '',
      '*CLS': '',
      '*OPC?': '1',
      'MEAS:VOLT?': `${(Math.random() * conn.voltageSetting + 0.01).toFixed(4)}`,
      'MEAS:CURR?': `${(Math.random() * conn.currentSetting + 0.001).toFixed(4)}`,
      'OUTP?': conn.outputState ? '1' : '0',
      'VOLT?': `${conn.voltageSetting.toFixed(2)}`,
      'CURR?': `${conn.currentSetting.toFixed(2)}`,
      'SYST:ERR?': '0,"No error"',
      'TRIG?': '1'
    };

    return responses[command] !== undefined ? responses[command] : '0';
  }
}

module.exports = USBTMCDriver;
