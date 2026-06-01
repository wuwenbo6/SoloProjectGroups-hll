import { ChipInfo, JTAGChain, BoundaryScanTestResult, PinState } from '../types';

interface SimulatedDevice {
  chip: ChipInfo;
  bypassRegister: '0' | '1';
  instructionRegister: string;
  boundaryRegister: string[];
  pinStates: Map<string, '0' | '1' | 'Z'>;
}

class BoundaryScanSimulator {
  private devices: SimulatedDevice[] = [];
  private currentInstruction: string = 'BYPASS';
  private tmsSequence: string[] = [];
  private tapState: string = 'RESET';
  private shiftRegister: string[] = [];

  init(chain: JTAGChain): void {
    this.devices = chain.devices.map(chip => ({
      chip,
      bypassRegister: '0',
      instructionRegister: '1'.repeat(chip.irLength),
      boundaryRegister: chip.boundaryCells.map(c => c.safeBit || '0'),
      pinStates: new Map(chip.pins.map(p => [p.name, this.getDefaultPinValue(p.type)]))
    }));
    this.tapState = 'RESET';
    this.currentInstruction = 'BYPASS';
  }

  private getDefaultPinValue(type: string): '0' | '1' | 'Z' {
    if (type === 'power') return '1';
    if (type === 'ground') return '0';
    if (type === 'input') return 'Z';
    return '0';
  }

  reset(): void {
    this.tapState = 'RESET';
    this.currentInstruction = 'BYPASS';
    this.devices.forEach(device => {
      device.bypassRegister = '0';
      device.instructionRegister = '1'.repeat(device.chip.irLength);
      device.boundaryRegister = device.chip.boundaryCells.map(c => c.safeBit || '0');
    });
  }

  shiftIR(data: string): string {
    const result: string[] = [];
    const bits = data.split('');
    
    this.devices.forEach(device => {
      const irBits = bits.splice(0, device.chip.irLength);
      const oldIR = device.instructionRegister;
      device.instructionRegister = irBits.join('');
      result.push(...oldIR.split(''));
    });

    this.updateInstruction();
    return result.join('');
  }

  shiftDR(data: string): string {
    const result: string[] = [];
    const bits = data.split('');

    if (this.currentInstruction === 'BYPASS') {
      this.devices.forEach(device => {
        const inBit = bits.shift() || '0';
        result.push(device.bypassRegister);
        device.bypassRegister = inBit as '0' | '1';
      });
    } else if (this.currentInstruction === 'SAMPLE' || this.currentInstruction === 'PRELOAD') {
      this.devices.forEach(device => {
        const drBits = bits.splice(0, device.chip.boundaryCells.length);
        const oldDR = [...device.boundaryRegister];
        
        if (this.currentInstruction === 'PRELOAD') {
          device.boundaryRegister = drBits;
          this.updateOutputPins(device);
        } else {
          this.sampleInputPins(device);
        }
        
        result.push(...oldDR);
      });
    } else if (this.currentInstruction === 'EXTEST') {
      this.devices.forEach(device => {
        const drBits = bits.splice(0, device.chip.boundaryCells.length);
        const oldDR = [...device.boundaryRegister];
        device.boundaryRegister = drBits;
        this.updateOutputPins(device);
        result.push(...oldDR);
      });
    } else if (this.currentInstruction === 'IDCODE') {
      this.devices.forEach(device => {
        const idcode = device.chip.idcode || '00000000';
        const idcodeBits = this.hexToBin(idcode);
        bits.splice(0, 32);
        result.push(...idcodeBits.split(''));
      });
    } else {
      this.devices.forEach(device => {
        bits.shift();
        result.push(device.bypassRegister);
      });
    }

    return result.join('');
  }

  private updateInstruction(): void {
    const instructions: Record<string, string> = {
      '0000': 'EXTEST',
      '0001': 'SAMPLE',
      '0010': 'IDCODE',
      '0011': 'USERCODE',
      '0100': 'CLAMP',
      '0101': 'HIGHZ',
      '0110': 'INTEST',
      '0111': 'RUNBIST',
      '1111': 'BYPASS'
    };

    const firstDeviceIR = this.devices[0]?.instructionRegister || '';
    this.currentInstruction = instructions[firstDeviceIR] || 'BYPASS';
  }

  private sampleInputPins(device: SimulatedDevice): void {
    device.chip.boundaryCells.forEach((cell, index) => {
      if (cell.function === 'INPUT' || cell.function === 'OBSERVE_ONLY') {
        const pinValue = device.pinStates.get(cell.port) || '0';
        if (pinValue !== 'Z') {
          device.boundaryRegister[index] = pinValue;
        }
      }
    });
  }

  private updateOutputPins(device: SimulatedDevice): void {
    device.chip.boundaryCells.forEach((cell, index) => {
      if (cell.function === 'OUTPUT' || cell.function === 'OUTPUT2' || cell.function === 'BIDI') {
        const value = device.boundaryRegister[index] as '0' | '1';
        device.pinStates.set(cell.port, value);
      }
    });
  }

  private hexToBin(hex: string): string {
    return hex.split('').map(c => {
      const bin = parseInt(c, 16).toString(2);
      return '0'.repeat(4 - bin.length) + bin;
    }).join('');
  }

  private binToHex(bits: string): string {
    let paddedBits = '0'.repeat(Math.ceil(bits.length / 4) * 4 - bits.length) + bits;
    let hex = '';
    for (let i = 0; i < paddedBits.length; i += 4) {
      hex += parseInt(paddedBits.substr(i, 4), 2).toString(16);
    }
    return hex.toUpperCase();
  }

  runBYPASSTest(deviceIndex: number): BoundaryScanTestResult {
    const startTime = Date.now();
    const device = this.devices[deviceIndex];
    
    if (!device) {
      return {
        testType: 'BYPASS',
        deviceIndex,
        deviceName: 'Unknown',
        success: false,
        dataIn: '',
        dataOut: '',
        timestamp: new Date(),
        duration: 0,
        error: 'Device not found'
      };
    }

    this.reset();
    
    const testData = '1';
    const dataIn = '0'.repeat(deviceIndex) + testData + '0'.repeat(Math.max(0, this.devices.length - deviceIndex - 1));
    const dataOut = this.shiftDR(dataIn);
    const expectedOut = '0'.repeat(deviceIndex) + '0' + '0'.repeat(Math.max(0, this.devices.length - deviceIndex - 1));
    
    const success = dataOut === expectedOut || dataOut.includes(testData);

    return {
      testType: 'BYPASS',
      deviceIndex,
      deviceName: device.chip.name,
      success,
      dataIn: this.binToHex(dataIn),
      dataOut: this.binToHex(dataOut),
      expectedData: this.binToHex(expectedOut),
      timestamp: new Date(),
      duration: Date.now() - startTime
    };
  }

  runSAMPLETest(deviceIndex: number): BoundaryScanTestResult {
    const startTime = Date.now();
    const device = this.devices[deviceIndex];
    
    if (!device) {
      return {
        testType: 'SAMPLE',
        deviceIndex,
        deviceName: 'Unknown',
        success: false,
        dataIn: '',
        dataOut: '',
        timestamp: new Date(),
        duration: 0,
        error: 'Device not found'
      };
    }

    this.reset();
    
    this.shiftIR('0001');
    
    const bsrLength = device.chip.boundaryCells.length;
    const dataIn = '0'.repeat(deviceIndex) + '0'.repeat(bsrLength) + '0'.repeat(Math.max(0, this.devices.length - deviceIndex - 1));
    const dataOut = this.shiftDR(dataIn);
    
    const deviceData = dataOut.substr(deviceIndex, bsrLength);

    return {
      testType: 'SAMPLE',
      deviceIndex,
      deviceName: device.chip.name,
      success: deviceData.length === bsrLength,
      dataIn: this.binToHex(dataIn),
      dataOut: this.binToHex(deviceData),
      timestamp: new Date(),
      duration: Date.now() - startTime
    };
  }

  runPRELOADTest(deviceIndex: number, preloadData?: string): BoundaryScanTestResult {
    const startTime = Date.now();
    const device = this.devices[deviceIndex];
    
    if (!device) {
      return {
        testType: 'PRELOAD',
        deviceIndex,
        deviceName: 'Unknown',
        success: false,
        dataIn: '',
        dataOut: '',
        timestamp: new Date(),
        duration: 0,
        error: 'Device not found'
      };
    }

    this.reset();
    
    this.shiftIR('0001');
    
    const bsrLength = device.chip.boundaryCells.length;
    const preloadBits = preloadData || device.chip.boundaryCells.map(c => c.safeBit || '0').join('');
    const paddedData = preloadBits.padStart(bsrLength, '0').slice(0, bsrLength);
    
    const dataIn = '0'.repeat(deviceIndex) + paddedData + '0'.repeat(Math.max(0, this.devices.length - deviceIndex - 1));
    const dataOut = this.shiftDR(dataIn);
    
    const deviceData = dataOut.substr(deviceIndex, bsrLength);

    return {
      testType: 'PRELOAD',
      deviceIndex,
      deviceName: device.chip.name,
      success: deviceData.length === bsrLength,
      dataIn: this.binToHex(paddedData),
      dataOut: this.binToHex(deviceData),
      timestamp: new Date(),
      duration: Date.now() - startTime
    };
  }

  runEXTESTTest(deviceIndex: number, testData: string): BoundaryScanTestResult {
    const startTime = Date.now();
    const device = this.devices[deviceIndex];
    
    if (!device) {
      return {
        testType: 'EXTEST',
        deviceIndex,
        deviceName: 'Unknown',
        success: false,
        dataIn: '',
        dataOut: '',
        timestamp: new Date(),
        duration: 0,
        error: 'Device not found'
      };
    }

    this.reset();
    
    this.shiftIR('0001');
    const bsrLength = device.chip.boundaryCells.length;
    const paddedData = testData.padStart(bsrLength, '0').slice(0, bsrLength);
    const preloadIn = '0'.repeat(deviceIndex) + paddedData + '0'.repeat(Math.max(0, this.devices.length - deviceIndex - 1));
    this.shiftDR(preloadIn);
    
    this.shiftIR('0000');
    
    const dataIn = '0'.repeat(deviceIndex) + paddedData + '0'.repeat(Math.max(0, this.devices.length - deviceIndex - 1));
    const dataOut = this.shiftDR(dataIn);
    
    const deviceData = dataOut.substr(deviceIndex, bsrLength);

    return {
      testType: 'EXTEST',
      deviceIndex,
      deviceName: device.chip.name,
      success: deviceData.length === bsrLength,
      dataIn: this.binToHex(paddedData),
      dataOut: this.binToHex(deviceData),
      timestamp: new Date(),
      duration: Date.now() - startTime
    };
  }

  getPinStates(deviceIndex: number): PinState[] {
    const device = this.devices[deviceIndex];
    if (!device) return [];

    return device.chip.pins.map(pin => {
      const cell = device.chip.boundaryCells.find(c => c.port === pin.name);
      return {
        name: pin.name,
        cellNumber: cell?.cellNumber ?? -1,
        direction: pin.type as 'input' | 'output' | 'inout',
        value: device.pinStates.get(pin.name) || 'Z',
        safeValue: (cell?.safeBit || '0') as '0' | '1'
      };
    });
  }

  setPinValue(deviceIndex: number, pinName: string, value: '0' | '1' | 'Z'): void {
    const device = this.devices[deviceIndex];
    if (device) {
      device.pinStates.set(pinName, value);
    }
  }

  getBoundaryRegister(deviceIndex: number): string {
    const device = this.devices[deviceIndex];
    if (!device) return '';
    return device.boundaryRegister.join('');
  }

  getCurrentInstruction(): string {
    return this.currentInstruction;
  }

  getDevices(): SimulatedDevice[] {
    return this.devices;
  }
}

export const boundaryScanSimulator = new BoundaryScanSimulator();

export function exportChainConfig(chain: JTAGChain): string {
  const config = {
    version: '1.0',
    createdAt: new Date().toISOString(),
    devices: chain.devices.map(chip => ({
      name: chip.name,
      irLength: chip.irLength,
      idcode: chip.idcode,
      manufacturer: chip.manufacturer,
      partNumber: chip.partNumber,
      package: chip.package,
      boundaryCells: chip.boundaryCells.length,
      pins: chip.pins.map(pin => ({
        name: pin.name,
        type: pin.type,
        cell: pin.cell
      }))
    }))
  };
  
  return JSON.stringify(config, null, 2);
}

export function importChainConfig(json: string): {
  valid: boolean;
  errors: string[];
  deviceNames: string[];
} {
  try {
    const config = JSON.parse(json);
    const errors: string[] = [];
    
    if (!config.version) {
      errors.push('Missing version field');
    }
    
    if (!config.devices || !Array.isArray(config.devices)) {
      errors.push('Missing or invalid devices array');
    } else {
      config.devices.forEach((device: any, index: number) => {
        if (!device.name) {
          errors.push(`Device ${index}: missing name`);
        }
        if (!device.irLength || typeof device.irLength !== 'number') {
          errors.push(`Device ${index}: missing or invalid irLength`);
        }
      });
    }
    
    return {
      valid: errors.length === 0,
      errors,
      deviceNames: config.devices?.map((d: any) => d.name) || []
    };
  } catch (e) {
    return {
      valid: false,
      errors: ['Invalid JSON format'],
      deviceNames: []
    };
  }
}

export function downloadChainConfig(chain: JTAGChain, filename: string): void {
  const content = exportChainConfig(chain);
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.json') ? filename : `${filename}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
