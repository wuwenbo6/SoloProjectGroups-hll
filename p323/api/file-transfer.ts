import type { Transport } from './transports/types.js';

const CHUNK_SIZE = 64;
const WAIT_TIMEOUT = 10000;

export class FileTransferService {
  private transport: Transport | null = null;

  setTransport(transport: Transport | null): void {
    this.transport = transport;
  }

  async uploadFile(
    filename: string,
    content: string,
    onProgress: (percent: number) => void
  ): Promise<void> {
    if (!this.transport?.isConnected()) {
      throw new Error('Not connected to device');
    }

    const transport = this.transport;

    let dataCallback: ((data: string) => void) | null = null;
    let errorCallback: ((error: Error) => void) | null = null;

    try {
      await this.enterRawRepl(transport);

      const totalChunks = Math.ceil(content.length / CHUNK_SIZE);

      const escapeString = (s: string): string => {
        return s
          .replace(/\\/g, '\\\\')
          .replace(/'/g, "\\'")
          .replace(/"/g, '\\"')
          .replace(/\r/g, '\\r')
          .replace(/\n/g, '\\n')
          .replace(/\t/g, '\\t');
      };

      const escapedFilename = escapeString(filename);
      const script = `f = open('${escapedFilename}', 'wb')\n`;
      await this.executeInRawRepl(transport, script);

      for (let i = 0; i < content.length; i += CHUNK_SIZE) {
        const chunk = content.slice(i, i + CHUNK_SIZE);
        const escapedChunk = escapeString(chunk);
        const writeCmd = `f.write(b'${escapedChunk}')\n`;
        await this.executeInRawRepl(transport, writeCmd);
        const percent = Math.min(100, Math.round(((i + CHUNK_SIZE) / content.length) * 100));
        onProgress(percent);
      }

      await this.executeInRawRepl(transport, 'f.close()\n');
      await this.exitRawRepl(transport);

    } catch (err) {
      try {
        if (this.transport?.isConnected()) {
          await this.exitRawRepl(this.transport);
        }
      } catch { /* ignore cleanup errors */ }
      throw err;
    } finally {
      if (dataCallback) {
        transport.onData(() => {});
      }
      if (errorCallback) {
        transport.onError(() => {});
      }
    }
  }

  private async enterRawRepl(transport: Transport): Promise<void> {
    transport.send('\x03\x01');
    await this.waitForPrompt(transport);
  }

  private async exitRawRepl(transport: Transport): Promise<void> {
    transport.send('\x02');
    await this.waitForPrompt(transport);
  }

  private async executeInRawRepl(transport: Transport, command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      let buffer = '';
      let timeoutId: NodeJS.Timeout | null = null;
      let done = false;

      const cleanup = () => {
        done = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      };

      const handleData = (data: string) => {
        if (done) return;
        buffer += data;

        if (buffer.includes('OK')) {
          const okIndex = buffer.indexOf('OK');
          const output = buffer.slice(0, okIndex).trim();
          cleanup();
          resolve(output);
        }

        if (buffer.includes('Traceback') || buffer.includes('Error:')) {
          cleanup();
          reject(new Error(buffer));
        }
      };

      const handleError = (err: Error) => {
        if (done) return;
        cleanup();
        reject(err);
      };

      transport.onData(handleData);
      transport.onError(handleError);

      transport.send(command);
      transport.send('\x04');

      timeoutId = setTimeout(() => {
        if (done) return;
        cleanup();
        reject(new Error('Command execution timeout'));
      }, WAIT_TIMEOUT);
    });
  }

  private waitForPrompt(transport: Transport): Promise<void> {
    return new Promise((resolve, reject) => {
      let buffer = '';
      let timeoutId: NodeJS.Timeout | null = null;
      let done = false;

      const cleanup = () => {
        done = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      };

      const handleData = (data: string) => {
        if (done) return;
        buffer += data;

        if (buffer.includes('>>>') || buffer.includes('===')) {
          cleanup();
          resolve();
        }
      };

      const handleError = (err: Error) => {
        if (done) return;
        cleanup();
        reject(err);
      };

      transport.onData(handleData);
      transport.onError(handleError);

      timeoutId = setTimeout(() => {
        if (done) return;
        cleanup();
        resolve();
      }, 2000);
    });
  }
}
