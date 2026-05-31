import { SerialPort } from 'serialport';
import { dbService } from './DatabaseService';

class SerialService {
  private port: SerialPort | null = null;
  private isConnected: boolean = false;

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const portName = dbService.getConfig('serial_port') || '/dev/ttyUSB0';
      const baudRate = parseInt(dbService.getConfig('serial_baudrate') || '115200');

      this.port = new SerialPort({
        path: portName,
        baudRate: baudRate,
        autoOpen: false
      });

      this.port.open((err) => {
        if (err) {
          console.error('Failed to open serial port:', err);
          reject(err);
        } else {
          this.isConnected = true;
          console.log('Serial port connected:', portName);
          resolve();
        }
      });

      this.port.on('error', (err) => {
        console.error('Serial port error:', err);
        this.isConnected = false;
      });

      this.port.on('close', () => {
        console.log('Serial port closed');
        this.isConnected = false;
      });
    });
  }

  disconnect(): void {
    if (this.port) {
      this.port.close();
      this.port = null;
      this.isConnected = false;
    }
  }

  sendCommand(command: object): void {
    if (!this.port || !this.isConnected) {
      console.warn('Serial port not connected');
      return;
    }

    const data = JSON.stringify(command) + '\n';
    this.port.write(data, (err) => {
      if (err) {
        console.error('Failed to send serial command:', err);
      }
    });
  }

  onData(callback: (data: string) => void): void {
    if (!this.port) return;
    
    let buffer = '';
    this.port.on('data', (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      lines.forEach(line => {
        if (line.trim()) {
          callback(line.trim());
        }
      });
    });
  }

  isPortOpen(): boolean {
    return this.isConnected;
  }

  static async listPorts(): Promise<string[]> {
    try {
      const ports = await SerialPort.list();
      return ports.map(p => p.path);
    } catch (err) {
      console.error('Failed to list serial ports:', err);
      return [];
    }
  }
}

export const serialService = new SerialService();
