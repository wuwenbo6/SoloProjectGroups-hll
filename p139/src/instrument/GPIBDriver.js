class GPIBDriver {
  constructor() {
    this.adapters = new Map();
  }

  async listDevices() {
    const gpibDevices = [];

    gpibDevices.push({
      id: 'gpib:simulator',
      name: 'GPIB Simulator (Demo) - Multimeter',
      vendorId: 0x0000,
      productId: 0x0003,
      manufacturer: 'Demo Instruments',
      product: 'Multimeter GPIB'
    });

    gpibDevices.push({
      id: 'gpib:simulator2',
      name: 'GPIB Simulator (Demo) - Function Generator',
      vendorId: 0x0000,
      productId: 0x0004,
      manufacturer: 'Demo Instruments',
      product: 'Function Gen GPIB'
    });

    return gpibDevices;
  }

  async connect(deviceId) {
    return {
      type: 'simulator',
      id: deviceId,
      gpibAddress: 10,
      lastCommand: '',
      frequency: 1000,
      amplitude: 1.0,
      outputEnabled: false
    };
  }

  async disconnect(connection) {
    return Promise.resolve();
  }

  async send(connection, data) {
    connection.lastCommand = data.trim();
    
    const cmd = connection.lastCommand;
    if (cmd.startsWith('FREQ ')) {
      connection.frequency = parseFloat(cmd.split(' ')[1]) || 1000;
    }
    if (cmd.startsWith('VOLT ')) {
      connection.amplitude = parseFloat(cmd.split(' ')[1]) || 1.0;
    }
    if (cmd === 'OUTP ON') connection.outputEnabled = true;
    if (cmd === 'OUTP OFF') connection.outputEnabled = false;
    
    return Promise.resolve();
  }

  async read(connection) {
    return this._simulateResponse(connection.lastCommand, connection);
  }

  _simulateResponse(command, conn) {
    const responses = {
      '*IDN?': `Demo,${conn.id === 'gpib:simulator' ? 'Multimeter' : 'FuncGen'},67890,02.00`,
      '*RST': '',
      '*CLS': '',
      '*OPC?': '1',
      'MEAS:VOLT:DC?': `${(Math.random() * 10 + 0.5).toFixed(4)}`,
      'MEAS:CURR:DC?': `${(Math.random() * 1 + 0.01).toFixed(4)}`,
      'FREQ?': `${conn.frequency}`,
      'VOLT?': `${conn.amplitude.toFixed(2)}`,
      'OUTP?': conn.outputEnabled ? '1' : '0',
      'SYST:ERR?': '0,"No error"',
      'TRIG?': '1'
    };

    return responses[command] !== undefined ? responses[command] : '0';
  }
}

module.exports = GPIBDriver;
