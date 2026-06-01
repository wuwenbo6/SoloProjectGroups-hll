import type { Transport } from './transports/types.js';
import type { TransportType, UartConfig, TelnetConfig } from '../shared/types.js';
import { UartTransport } from './transports/uart.js';
import { TelnetTransport } from './transports/telnet.js';
import { FileTransferService } from './file-transfer.js';

export class ReplBridge {
  private transport: Transport | null = null;
  private onOutput: (data: string) => void;
  private onStatus: (state: 'connecting' | 'connected' | 'disconnected' | 'error') => void;
  private onError: (message: string) => void;
  private onFileUploadProgress: (filename: string, percent: number) => void;
  private onFileUploadComplete: (filename: string) => void;
  private onFileUploadError: (filename: string, message: string) => void;
  private fileTransfer: FileTransferService;

  constructor(
    onOutput: (data: string) => void,
    onStatus: (state: 'connecting' | 'connected' | 'disconnected' | 'error') => void,
    onError: (message: string) => void,
    onFileUploadProgress?: (filename: string, percent: number) => void,
    onFileUploadComplete?: (filename: string) => void,
    onFileUploadError?: (filename: string, message: string) => void,
  ) {
    this.onOutput = onOutput;
    this.onStatus = onStatus;
    this.onError = onError;
    this.onFileUploadProgress = onFileUploadProgress || (() => {});
    this.onFileUploadComplete = onFileUploadComplete || (() => {});
    this.onFileUploadError = onFileUploadError || (() => {});
    this.fileTransfer = new FileTransferService();
  }

  async connect(transportType: TransportType, config: UartConfig | TelnetConfig): Promise<void> {
    if (this.transport?.isConnected()) {
      await this.disconnect();
    }

    this.onStatus('connecting');

    try {
      if (transportType === 'uart') {
        this.transport = new UartTransport(config as UartConfig);
      } else if (transportType === 'telnet') {
        this.transport = new TelnetTransport(config as TelnetConfig);
      } else {
        throw new Error(`Unknown transport type: ${transportType}`);
      }

      this.transport.onData((data: string) => {
        this.onOutput(data);
      });

      this.transport.onError((error: Error) => {
        this.onError(error.message);
        this.onStatus('error');
      });

      this.transport.onClose(() => {
        this.onStatus('disconnected');
        this.transport = null;
      });

      await this.transport.connect();
      this.fileTransfer.setTransport(this.transport);
      this.onStatus('connected');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.onError(message);
      this.onStatus('error');
      this.transport = null;
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    if (this.transport) {
      await this.transport.disconnect();
      this.transport = null;
    }
    this.onStatus('disconnected');
  }

  sendCommand(data: string): void {
    if (!this.transport?.isConnected()) {
      this.onError('Not connected to device');
      return;
    }
    this.transport.send(data);
  }

  interrupt(): void {
    if (!this.transport?.isConnected()) {
      this.onError('Not connected to device');
      return;
    }
    this.transport.send('\x03');
  }

  softReset(): void {
    if (!this.transport?.isConnected()) {
      this.onError('Not connected to device');
      return;
    }
    this.transport.send('\x04');
  }

  isConnected(): boolean {
    return this.transport?.isConnected() ?? false;
  }

  async destroy(): Promise<void> {
    await this.disconnect();
  }

  async uploadFile(filename: string, content: string): Promise<void> {
    if (!this.transport?.isConnected()) {
      const error = new Error('Not connected to device');
      this.onFileUploadError(filename, error.message);
      throw error;
    }

    try {
      await this.fileTransfer.uploadFile(filename, content, (percent) => {
        this.onFileUploadProgress(filename, percent);
      });
      this.onFileUploadComplete(filename);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.onFileUploadError(filename, message);
      throw err;
    }
  }
}
