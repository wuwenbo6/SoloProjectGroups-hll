import { Socket } from 'net';
import { DeviceConfig, DeviceStatus, ScpiCommandResponse, QueuedCommand, QueueStatus } from '../types';

const DEFAULT_TERMINATOR = '\r\n';
const DEFAULT_CHUNK_SIZE = 1024;
const DEFAULT_CHUNK_DELAY = 10;
const MAX_RECENT_COMMANDS = 50;

export class VisaDevice {
  private socket: Socket | null = null;
  private config: DeviceConfig | null = null;
  private isConnected = false;
  private lastCommand: string | undefined;
  private lastResponse: string | undefined;
  private lastError: string | undefined;
  private responseBuffer = '';
  private responseResolve: ((value: string) => void) | null = null;
  private responseTimeout: NodeJS.Timeout | null = null;

  private commandQueue: QueuedCommand[] = [];
  private isProcessing = false;
  private recentCommands: QueuedCommand[] = [];

  constructor() {}

  async connect(config: DeviceConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      this.disconnect();

      this.config = config;
      this.socket = new Socket();
      const timeout = config.timeout || 5000;
      const terminator = config.terminator || DEFAULT_TERMINATOR;

      this.socket.setTimeout(timeout);

      this.socket.on('connect', () => {
        this.isConnected = true;
        this.lastError = undefined;
        this.startQueueProcessor();
        resolve();
      });

      this.socket.on('data', (data) => {
        this.responseBuffer += data.toString();
        
        if (this.responseBuffer.includes(terminator)) {
          const parts = this.responseBuffer.split(terminator);
          this.responseBuffer = parts.slice(1).join(terminator);
          const response = parts[0].trim();
          
          if (this.responseResolve) {
            this.clearResponseTimeout();
            const resolve = this.responseResolve;
            this.responseResolve = null;
            resolve(response);
          }
        }
      });

      this.socket.on('timeout', () => {
        this.lastError = 'Connection timeout';
        this.socket?.destroy();
        reject(new Error('Connection timeout'));
      });

      this.socket.on('error', (err) => {
        this.lastError = err.message;
        this.isConnected = false;
        reject(err);
      });

      this.socket.on('close', () => {
        this.isConnected = false;
        this.isProcessing = false;
        if (this.responseResolve) {
          this.responseResolve('');
          this.responseResolve = null;
        }
      });

      this.socket.connect(config.port, config.host);
    });
  }

  disconnect(): void {
    this.clearResponseTimeout();
    this.isProcessing = false;
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.isConnected = false;
    this.responseBuffer = '';
    this.responseResolve = null;
  }

  enqueueCommand(command: string, isQuery = true, timeout = 5000): QueuedCommand {
    const queuedCommand: QueuedCommand = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      command,
      isQuery,
      timeout,
      timestamp: Date.now(),
      status: 'pending'
    };

    this.commandQueue.push(queuedCommand);
    this.startQueueProcessor();

    return queuedCommand;
  }

  private async startQueueProcessor(): Promise<void> {
    if (this.isProcessing || !this.isConnected) {
      return;
    }

    this.isProcessing = true;

    while (this.commandQueue.length > 0 && this.isConnected) {
      const cmd = this.commandQueue.shift()!;
      cmd.status = 'processing';

      try {
        const result = await this.sendCommandInternal(cmd.command, cmd.isQuery, cmd.timeout);
        cmd.status = result.success ? 'completed' : 'failed';
        cmd.response = result;
      } catch (err) {
        cmd.status = 'failed';
        cmd.response = {
          success: false,
          command: cmd.command,
          error: err instanceof Error ? err.message : 'Unknown error',
          timestamp: Date.now()
        };
      }

      this.addToRecent(cmd);
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    this.isProcessing = false;
  }

  private addToRecent(cmd: QueuedCommand): void {
    this.recentCommands.unshift(cmd);
    if (this.recentCommands.length > MAX_RECENT_COMMANDS) {
      this.recentCommands = this.recentCommands.slice(0, MAX_RECENT_COMMANDS);
    }
  }

  private async sendCommandInternal(command: string, isQuery = true, timeout = 5000): Promise<ScpiCommandResponse> {
    const timestamp = Date.now();
    this.lastCommand = command;

    if (!this.isConnected || !this.socket) {
      const error = 'Device not connected';
      this.lastError = error;
      return {
        success: false,
        command,
        error,
        timestamp
      };
    }

    try {
      const terminator = this.config?.terminator || DEFAULT_TERMINATOR;
      const fullCommand = command.trim() + terminator;

      await this.sendChunked(fullCommand);

      if (isQuery) {
        const response = await this.waitForResponse(timeout);
        this.lastResponse = response;
        return {
          success: true,
          command,
          response,
          timestamp
        };
      } else {
        await new Promise(resolve => setTimeout(resolve, 100));
        return {
          success: true,
          command,
          timestamp
        };
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      this.lastError = error;
      return {
        success: false,
        command,
        error,
        timestamp
      };
    }
  }

  private async sendChunked(data: string): Promise<void> {
    const chunkSize = this.config?.chunkSize || DEFAULT_CHUNK_SIZE;
    const chunkDelay = this.config?.chunkDelay || DEFAULT_CHUNK_DELAY;

    if (data.length <= chunkSize) {
      this.socket!.write(data);
      return;
    }

    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, i + chunkSize);
      this.socket!.write(chunk);
      if (i + chunkSize < data.length) {
        await new Promise(resolve => setTimeout(resolve, chunkDelay));
      }
    }
  }

  private waitForResponse(timeout: number): Promise<string> {
    return new Promise((resolve, reject) => {
      this.responseResolve = resolve;
      this.responseBuffer = '';

      this.responseTimeout = setTimeout(() => {
        this.responseResolve = null;
        reject(new Error('Response timeout'));
      }, timeout);
    });
  }

  private clearResponseTimeout(): void {
    if (this.responseTimeout) {
      clearTimeout(this.responseTimeout);
      this.responseTimeout = null;
    }
  }

  getStatus(): DeviceStatus {
    return {
      connected: this.isConnected,
      host: this.config?.host || '',
      port: this.config?.port || 0,
      lastCommand: this.lastCommand,
      lastResponse: this.lastResponse,
      error: this.lastError,
      queueLength: this.commandQueue.length,
      isProcessing: this.isProcessing
    };
  }

  getQueueStatus(): QueueStatus {
    return {
      length: this.commandQueue.length,
      isProcessing: this.isProcessing,
      pending: [...this.commandQueue],
      recent: [...this.recentCommands]
    };
  }

  getCommandById(id: string): QueuedCommand | undefined {
    const pending = this.commandQueue.find(c => c.id === id);
    if (pending) return pending;
    return this.recentCommands.find(c => c.id === id);
  }

  clearQueue(): void {
    this.commandQueue = [];
  }

  isDeviceConnected(): boolean {
    return this.isConnected;
  }
}

export const visaDevice = new VisaDevice();
