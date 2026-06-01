import net from 'net';
import type { Transport } from './types.js';
import type { TelnetConfig } from '../../shared/types.js';

const IAC = 0xff;
const DO = 0xfd;
const DONT = 0xfe;
const WILL = 0xfb;
const WONT = 0xfc;
const ECHO = 1;
const SUPPRESS_GO_AHEAD = 3;
const TERMINAL_TYPE = 24;

export class TelnetTransport implements Transport {
  private socket: net.Socket | null = null;
  private config: TelnetConfig;
  private dataCallback: ((data: string) => void) | null = null;
  private errorCallback: ((error: Error) => void) | null = null;
  private closeCallback: (() => void) | null = null;
  private connected = false;
  private buffer = Buffer.alloc(0);

  constructor(config: TelnetConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.socket) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.socket = new net.Socket();

      this.socket.on('data', (chunk: Buffer) => {
        const filtered = this.processTelnetData(chunk);
        if (filtered.length > 0 && this.dataCallback) {
          this.dataCallback(filtered.toString('utf-8'));
        }
      });

      this.socket.on('error', (err: Error) => {
        this.connected = false;
        if (this.errorCallback) {
          this.errorCallback(err);
        }
      });

      this.socket.on('close', () => {
        this.connected = false;
        this.socket = null;
        if (this.closeCallback) {
          this.closeCallback();
        }
      });

      this.socket.connect(this.config.port, this.config.host, () => {
        this.connected = true;
        this.enterRawRepl();
        resolve();
      });

      this.socket.on('error', (err: Error) => {
        this.connected = false;
        reject(new Error(`Telnet connection failed: ${err.message}`));
      });
    });
  }

  private enterRawRepl(): void {
    if (!this.socket) return;
    this.socket.write(Buffer.from([0x03, 0x02]));
  }

  private processTelnetData(data: Buffer): Buffer {
    const output: number[] = [];
    let i = 0;

    while (i < data.length) {
      if (data[i] === IAC) {
        if (i + 1 < data.length) {
          const cmd = data[i + 1];
          if (cmd === IAC) {
            output.push(IAC);
            i += 2;
            continue;
          }
          if (cmd === DO || cmd === DONT || cmd === WILL || cmd === WONT) {
            if (i + 2 < data.length) {
              const option = data[i + 2];
              this.handleNegotiation(cmd, option);
              i += 3;
              continue;
            }
            i += 2;
            continue;
          }
          if (cmd === 0xfb || cmd === 0xfc || cmd === 0xfd || cmd === 0xfe) {
            i += 3;
            continue;
          }
          i += 2;
          continue;
        }
        i += 1;
        continue;
      }
      output.push(data[i]);
      i += 1;
    }

    return Buffer.from(output);
  }

  private handleNegotiation(cmd: number, option: number): void {
    if (!this.socket) return;

    if (cmd === DO) {
      if (option === SUPPRESS_GO_AHEAD) {
        this.socket.write(Buffer.from([IAC, WILL, SUPPRESS_GO_AHEAD]));
      } else if (option === TERMINAL_TYPE) {
        this.socket.write(Buffer.from([IAC, WILL, TERMINAL_TYPE]));
      } else {
        this.socket.write(Buffer.from([IAC, WONT, option]));
      }
    } else if (cmd === WILL) {
      if (option === ECHO) {
        this.socket.write(Buffer.from([IAC, DO, ECHO]));
      } else if (option === SUPPRESS_GO_AHEAD) {
        this.socket.write(Buffer.from([IAC, DO, SUPPRESS_GO_AHEAD]));
      } else {
        this.socket.write(Buffer.from([IAC, DONT, option]));
      }
    } else if (cmd === DONT) {
      this.socket.write(Buffer.from([IAC, WONT, option]));
    } else if (cmd === WONT) {
      this.socket.write(Buffer.from([IAC, DONT, option]));
    }
  }

  async disconnect(): Promise<void> {
    if (!this.socket) {
      this.connected = false;
      return;
    }

    return new Promise((resolve) => {
      this.socket!.destroy();
      this.socket = null;
      this.connected = false;
      resolve();
    });
  }

  send(data: string): void {
    if (!this.socket || !this.connected) {
      if (this.errorCallback) {
        this.errorCallback(new Error('Telnet socket is not connected'));
      }
      return;
    }
    this.socket.write(data, (err) => {
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
    return this.connected;
  }
}
