import { SerialPort } from 'serialport';
import type { Transport } from './types.js';
import type { UartConfig } from '../../shared/types.js';

export class UartTransport implements Transport {
  private port: SerialPort | null = null;
  private config: UartConfig;
  private dataCallback: ((data: string) => void) | null = null;
  private errorCallback: ((error: Error) => void) | null = null;
  private closeCallback: (() => void) | null = null;
  private connected = false;

  constructor(config: UartConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.port?.isOpen) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.port = new SerialPort({
        path: this.config.path,
        baudRate: this.config.baudRate,
        autoOpen: false,
      });

      this.port.on('data', (chunk: Buffer) => {
        if (this.dataCallback) {
          this.dataCallback(chunk.toString('utf-8'));
        }
      });

      this.port.on('error', (err: Error) => {
        this.connected = false;
        if (this.errorCallback) {
          this.errorCallback(err);
        }
      });

      this.port.on('close', () => {
        this.connected = false;
        if (this.closeCallback) {
          this.closeCallback();
        }
      });

      this.port.open((err) => {
        if (err) {
          this.connected = false;
          reject(new Error(`Failed to open serial port: ${err.message}`));
          return;
        }
        this.connected = true;
        this.enterRawRepl();
        resolve();
      });
    });
  }

  private enterRawRepl(): void {
    if (!this.port?.isOpen) return;
    this.port.write(Buffer.from([0x03, 0x02]));
  }

  async disconnect(): Promise<void> {
    if (!this.port?.isOpen) {
      this.connected = false;
      return;
    }

    return new Promise((resolve) => {
      this.port!.close(() => {
        this.connected = false;
        this.port = null;
        resolve();
      });
    });
  }

  send(data: string): void {
    if (!this.port?.isOpen) {
      if (this.errorCallback) {
        this.errorCallback(new Error('Serial port is not open'));
      }
      return;
    }
    this.port.write(data, (err) => {
      if (err && this.errorCallback) {
        this.errorCallback(err);
      }
    });
  }

  onData(callback: (data: string) => void): void {
    this.dataCallback = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallback = callback;
  }

  onClose(callback: () => void): void {
    this.closeCallback = callback;
  }

  isConnected(): boolean {
    return this.connected && (this.port?.isOpen ?? false);
  }
}
