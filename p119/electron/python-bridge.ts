import { ChildProcess, spawn } from 'child_process';
import * as path from 'path';
import * as net from 'net';
import { app } from 'electron';

export class PythonBridge {
  private pythonProcess: ChildProcess | null = null;
  private port: number = 0;
  private isReady: boolean = false;
  private onReadyCallbacks: (() => void)[] = [];
  private onErrorCallbacks: ((error: string) => void)[] = [];

  async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.findAvailablePort().then((port) => {
        this.port = port;
        
        const pythonPath = this.getPythonPath();
        const scriptPath = path.join(app.getAppPath(), 'python', 'app.py');
        
        const env = {
          ...process.env,
          FLASK_PORT: port.toString(),
          PYTHONUNBUFFERED: '1',
        };

        console.log(`Starting Python backend on port ${port}...`);
        console.log(`Python path: ${pythonPath}`);
        console.log(`Script path: ${scriptPath}`);

        this.pythonProcess = spawn(pythonPath, [scriptPath], {
          env,
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        this.pythonProcess.stdout?.on('data', (data) => {
          const output = data.toString();
          console.log(`[Python] ${output}`);
          
          if (output.includes('Running on') && !this.isReady) {
            this.isReady = true;
            this.onReadyCallbacks.forEach((cb) => cb());
            resolve(port);
          }
        });

        this.pythonProcess.stderr?.on('data', (data) => {
          const error = data.toString();
          console.error(`[Python Error] ${error}`);
          this.onErrorCallbacks.forEach((cb) => cb(error));
        });

        this.pythonProcess.on('error', (err) => {
          console.error('Failed to start Python process:', err);
          reject(err);
        });

        this.pythonProcess.on('exit', (code) => {
          console.log(`Python process exited with code ${code}`);
          this.isReady = false;
        });
      }).catch(reject);
    });
  }

  stop(): void {
    if (this.pythonProcess) {
      this.pythonProcess.kill('SIGTERM');
      this.pythonProcess = null;
    }
    this.isReady = false;
  }

  getPort(): number {
    return this.port;
  }

  ready(): boolean {
    return this.isReady;
  }

  onReady(callback: () => void): void {
    if (this.isReady) {
      callback();
    } else {
      this.onReadyCallbacks.push(callback);
    }
  }

  onError(callback: (error: string) => void): void {
    this.onErrorCallbacks.push(callback);
  }

  private getPythonPath(): string {
    if (process.platform === 'win32') {
      return 'python';
    }
    return 'python3';
  }

  private findAvailablePort(): Promise<number> {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.unref();
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        const port = typeof address === 'string' ? 5000 : address?.port || 5000;
        server.close(() => resolve(port));
      });
    });
  }
}

export const pythonBridge = new PythonBridge();
