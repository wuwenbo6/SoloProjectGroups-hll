import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { WebSocket } from 'ws';
import { ServerMessage, FlashStatus, MCU_LIST, FuseBytes } from './types';

export class AvrdudeService {
  private currentProcess: ChildProcess | null = null;
  private ws: WebSocket;
  private uploadsDir: string;

  constructor(ws: WebSocket) {
    this.ws = ws;
    this.uploadsDir = path.join(__dirname, '..', 'uploads');
    this.ensureUploadsDir();
  }

  private ensureUploadsDir(): void {
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }
  }

  private sendMessage(type: ServerMessage['type'], payload: ServerMessage['payload']): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type,
        payload: {
          ...payload,
          timestamp: Date.now()
        }
      }));
    }
  }

  private parseProgress(line: string): number | null {
    const patterns = [
      /(\d+)%/,
      /(\d+)\s*%/,
      /#+\s*(\d+)%/,
      /Writing.*\|\s*(\d+)%/,
      /Reading.*\|\s*(\d+)%/,
    ];

    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        return parseInt(match[1], 10);
      }
    }
    return null;
  }

  private parseSignature(output: string): string | null {
    const signaturePatterns = [
      /signature\s*=\s*0x([0-9a-fA-F]+)/,
      /Device\s+signature\s*=\s*0x([0-9a-fA-F]+)/,
      /Reading\s+signature\s+bytes:\s*0x([0-9a-fA-F]+)/i,
    ];

    for (const pattern of signaturePatterns) {
      const match = output.match(pattern);
      if (match) {
        let sig = match[1].toLowerCase();
        if (sig.length === 6) {
          sig = '0x' + sig;
        }
        return sig;
      }
    }
    return null;
  }

  private determineStatus(line: string): FlashStatus | null {
    const lowerLine = line.toLowerCase();
    if (lowerLine.includes('writing') || lowerLine.includes('flash')) {
      return 'flashing';
    }
    if (lowerLine.includes('verifying') || lowerLine.includes('verify')) {
      return 'verifying';
    }
    if (lowerLine.includes('connected') || lowerLine.includes('found')) {
      return 'connecting';
    }
    return null;
  }

  private determineLogLevel(line: string): 'info' | 'warn' | 'error' | 'success' {
    const lowerLine = line.toLowerCase();
    if (lowerLine.includes('error') || lowerLine.includes('failed')) {
      return 'error';
    }
    if (lowerLine.includes('warning') || lowerLine.includes('warn')) {
      return 'warn';
    }
    if (lowerLine.includes('success') || lowerLine.includes('done') || lowerLine.includes('verified')) {
      return 'success';
    }
    return 'info';
  }

  private buildBaseArgs(programmer: string, mcu: string, port?: string, baudRate?: number, bitClock?: number): string[] {
    const args = ['-c', programmer, '-p', mcu, '-v'];

    if (port) {
      args.push('-P', port);
    }

    if (baudRate) {
      args.push('-b', baudRate.toString());
    }

    if (bitClock !== undefined) {
      args.push('-B', bitClock.toString());
    }

    return args;
  }

  public async readSignature(mcu: string, programmer: string, port?: string, baudRate?: number, bitClock?: number): Promise<string | null> {
    this.sendMessage('log', { message: 'Reading chip signature...', level: 'info' });

    const args = this.buildBaseArgs(programmer, mcu, port, baudRate, bitClock);
    args.push('-n');

    this.sendMessage('log', { message: `Executing: avrdude ${args.join(' ')}`, level: 'info' });

    return new Promise((resolve) => {
      let allOutput = '';
      const process = spawn('avrdude', args);

      process.stdout?.on('data', (data) => {
        const output = data.toString();
        allOutput += output;
        const lines = output.split('\n');
        lines.forEach((line: string) => {
          if (line.trim()) {
            this.processOutput(line);
          }
        });
      });

      process.stderr?.on('data', (data) => {
        const output = data.toString();
        allOutput += output;
        const lines = output.split('\n');
        lines.forEach((line: string) => {
          if (line.trim()) {
            this.processOutput(line);
          }
        });
      });

      process.on('close', (code) => {
        if (code === 0) {
          const signature = this.parseSignature(allOutput);
          if (signature) {
            this.sendMessage('log', { message: `Detected chip signature: ${signature}`, level: 'info' });
          }
          resolve(signature);
        } else {
          this.sendMessage('log', { message: `Failed to read signature, avrdude exited with code ${code}`, level: 'warn' });
          resolve(null);
        }
      });

      process.on('error', (err) => {
        this.sendMessage('log', { message: `Failed to start avrdude: ${err.message}`, level: 'error' });
        resolve(null);
      });
    });
  }

  public async verifySignature(mcuId: string, programmer: string, port?: string, baudRate?: number, bitClock?: number): Promise<boolean> {
    const expectedMcu = MCU_LIST.find(m => m.id === mcuId);
    if (!expectedMcu) {
      this.sendMessage('log', { message: `Unknown MCU ID: ${mcuId}`, level: 'warn' });
      return true;
    }

    const actualSignature = await this.readSignature(mcuId, programmer, port, baudRate, bitClock);
    
    if (!actualSignature) {
      this.sendMessage('log', { message: 'Could not read chip signature, proceeding without verification', level: 'warn' });
      return true;
    }

    const expectedSignature = expectedMcu.signature.toLowerCase();
    const actualSigNormalized = actualSignature.toLowerCase();

    if (actualSigNormalized === expectedSignature) {
      this.sendMessage('log', { 
        message: `Signature match: ${actualSignature} (${expectedMcu.name})`, 
        level: 'success' 
      });
      return true;
    } else {
      this.sendMessage('signature_warning', {
        message: `Chip signature mismatch! Expected ${expectedSignature} for ${expectedMcu.name}, but got ${actualSignature}`,
        expectedSignature: expectedSignature,
        actualSignature: actualSigNormalized,
        mcuName: expectedMcu.name,
        level: 'warn'
      });
      this.sendMessage('log', { 
        message: `WARNING: Signature mismatch! Expected ${expectedSignature}, got ${actualSignature}`, 
        level: 'warn' 
      });
      return false;
    }
  }

  public async flash(
    hexFile: string, 
    mcu: string, 
    programmer: string, 
    port?: string, 
    baudRate?: number, 
    bitClock?: number,
    verifySignature: boolean = false
  ): Promise<void> {
    const hexFilePath = path.join(this.uploadsDir, hexFile);
    
    if (!fs.existsSync(hexFilePath)) {
      this.sendMessage('error', { message: `HEX file not found: ${hexFile}`, level: 'error' });
      return;
    }

    if (verifySignature) {
      const signatureValid = await this.verifySignature(mcu, programmer, port, baudRate, bitClock);
      if (!signatureValid) {
        this.sendMessage('error', { 
          message: 'Aborted due to chip signature mismatch. Please verify the selected chip matches the connected hardware.', 
          level: 'error' 
        });
        this.sendMessage('status', { status: 'error' });
        return;
      }
    }

    const args = this.buildBaseArgs(programmer, mcu, port, baudRate, bitClock);
    args.push('-U', `flash:w:${hexFilePath}:i`);

    this.sendMessage('log', { message: `Executing: avrdude ${args.join(' ')}`, level: 'info' });
    this.sendMessage('status', { status: 'connecting' });

    return new Promise((resolve) => {
      this.currentProcess = spawn('avrdude', args);

      this.currentProcess.stdout?.on('data', (data) => {
        const lines = data.toString().split('\n');
        lines.forEach((line: string) => {
          if (line.trim()) {
            this.processOutput(line);
          }
        });
      });

      this.currentProcess.stderr?.on('data', (data) => {
        const lines = data.toString().split('\n');
        lines.forEach((line: string) => {
          if (line.trim()) {
            this.processOutput(line);
          }
        });
      });

      this.currentProcess.on('close', (code) => {
        if (code === 0) {
          this.sendMessage('status', { status: 'complete' });
          this.sendMessage('complete', { message: 'Flash completed successfully!', level: 'success' });
        } else {
          this.sendMessage('status', { status: 'error' });
          this.sendMessage('error', { message: `avrdude exited with code ${code}`, level: 'error' });
        }
        this.currentProcess = null;
        resolve();
      });

      this.currentProcess.on('error', (err) => {
        this.sendMessage('error', { message: `Failed to start avrdude: ${err.message}`, level: 'error' });
        this.sendMessage('status', { status: 'error' });
        this.currentProcess = null;
        resolve();
      });
    });
  }

  public async erase(
    mcu: string, 
    programmer: string, 
    port?: string, 
    bitClock?: number
  ): Promise<void> {
    const args = this.buildBaseArgs(programmer, mcu, port, undefined, bitClock);
    args.push('-e');

    this.sendMessage('log', { message: `Executing: avrdude ${args.join(' ')}`, level: 'info' });
    this.sendMessage('status', { status: 'connecting' });

    return new Promise((resolve) => {
      this.currentProcess = spawn('avrdude', args);

      this.currentProcess.stdout?.on('data', (data) => {
        const lines = data.toString().split('\n');
        lines.forEach((line: string) => {
          if (line.trim()) {
            this.processOutput(line);
          }
        });
      });

      this.currentProcess.stderr?.on('data', (data) => {
        const lines = data.toString().split('\n');
        lines.forEach((line: string) => {
          if (line.trim()) {
            this.processOutput(line);
          }
        });
      });

      this.currentProcess.on('close', (code) => {
        if (code === 0) {
          this.sendMessage('status', { status: 'complete' });
          this.sendMessage('complete', { message: 'Chip erased successfully!', level: 'success' });
        } else {
          this.sendMessage('status', { status: 'error' });
          this.sendMessage('error', { message: `avrdude exited with code ${code}`, level: 'error' });
        }
        this.currentProcess = null;
        resolve();
      });

      this.currentProcess.on('error', (err) => {
        this.sendMessage('error', { message: `Failed to start avrdude: ${err.message}`, level: 'error' });
        this.sendMessage('status', { status: 'error' });
        this.currentProcess = null;
        resolve();
      });
    });
  }

  public stop(): void {
    if (this.currentProcess) {
      this.currentProcess.kill('SIGTERM');
      this.sendMessage('log', { message: 'Process terminated by user', level: 'warn' });
      this.sendMessage('status', { status: 'idle' });
      this.currentProcess = null;
    }
  }

  private processOutput(line: string): void {
    const level = this.determineLogLevel(line);
    const status = this.determineStatus(line);
    const progress = this.parseProgress(line);

    this.sendMessage('log', { message: line, level });

    if (status) {
      this.sendMessage('status', { status });
    }

    if (progress !== null) {
      this.sendMessage('progress', { progress });
    }
  }

  private parseFuses(output: string): FuseBytes | null {
    const fuses: FuseBytes = {
      low: '',
      high: ''
    };

    const lowMatch = output.match(/l?fuse?\s*=\s*0x([0-9a-fA-F]+)/i);
    const highMatch = output.match(/h?fuse?\s*=\s*0x([0-9a-fA-F]+)/i);
    const extMatch = output.match(/efuse?\s*=\s*0x([0-9a-fA-F]+)/i);

    if (lowMatch) {
      fuses.low = '0x' + lowMatch[1].padStart(2, '0').toLowerCase();
    }
    if (highMatch) {
      fuses.high = '0x' + highMatch[1].padStart(2, '0').toLowerCase();
    }
    if (extMatch) {
      fuses.extended = '0x' + extMatch[1].padStart(2, '0').toLowerCase();
    }

    return fuses.low && fuses.high ? fuses : null;
  }

  public async readFuses(
    mcu: string,
    programmer: string,
    port?: string,
    baudRate?: number,
    bitClock?: number
  ): Promise<void> {
    const args = this.buildBaseArgs(programmer, mcu, port, baudRate, bitClock);
    args.push('-U', 'lfuse:r:-:h', '-U', 'hfuse:r:-:h', '-U', 'efuse:r:-:h');

    this.sendMessage('log', { message: `Executing: avrdude ${args.join(' ')}`, level: 'info' });
    this.sendMessage('status', { status: 'reading_fuses' });

    return new Promise((resolve) => {
      let allOutput = '';
      this.currentProcess = spawn('avrdude', args);

      this.currentProcess.stdout?.on('data', (data) => {
        allOutput += data.toString();
        const lines = data.toString().split('\n');
        lines.forEach((line: string) => {
          if (line.trim()) {
            this.processOutput(line);
          }
        });
      });

      this.currentProcess.stderr?.on('data', (data) => {
        allOutput += data.toString();
        const lines = data.toString().split('\n');
        lines.forEach((line: string) => {
          if (line.trim()) {
            this.processOutput(line);
          }
        });
      });

      this.currentProcess.on('close', (code) => {
        if (code === 0) {
          const fuses = this.parseFuses(allOutput);
          if (fuses) {
            this.sendMessage('fuses_data', { fuses });
            this.sendMessage('status', { status: 'complete' });
            this.sendMessage('complete', { message: 'Fuses read successfully!', level: 'success' });
          } else {
            this.sendMessage('log', { message: 'Warning: Could not parse fuse values from output', level: 'warn' });
            this.sendMessage('status', { status: 'complete' });
          }
        } else {
          this.sendMessage('status', { status: 'error' });
          this.sendMessage('error', { message: `avrdude exited with code ${code}`, level: 'error' });
        }
        this.currentProcess = null;
        resolve();
      });

      this.currentProcess.on('error', (err) => {
        this.sendMessage('error', { message: `Failed to start avrdude: ${err.message}`, level: 'error' });
        this.sendMessage('status', { status: 'error' });
        this.currentProcess = null;
        resolve();
      });
    });
  }

  public async writeFuses(
    fuses: FuseBytes,
    mcu: string,
    programmer: string,
    port?: string,
    baudRate?: number,
    bitClock?: number
  ): Promise<void> {
    const args = this.buildBaseArgs(programmer, mcu, port, baudRate, bitClock);

    if (fuses.low) {
      args.push('-U', `lfuse:w:${fuses.low}:m`);
    }
    if (fuses.high) {
      args.push('-U', `hfuse:w:${fuses.high}:m`);
    }
    if (fuses.extended) {
      args.push('-U', `efuse:w:${fuses.extended}:m`);
    }

    this.sendMessage('log', { message: `Executing: avrdude ${args.join(' ')}`, level: 'info' });
    this.sendMessage('log', { 
      message: `WARNING: Writing fuses - Low: ${fuses.low}, High: ${fuses.high}, Extended: ${fuses.extended || 'N/A'}`,
      level: 'warn' 
    });
    this.sendMessage('status', { status: 'writing_fuses' });

    return new Promise((resolve) => {
      this.currentProcess = spawn('avrdude', args);

      this.currentProcess.stdout?.on('data', (data) => {
        const lines = data.toString().split('\n');
        lines.forEach((line: string) => {
          if (line.trim()) {
            this.processOutput(line);
          }
        });
      });

      this.currentProcess.stderr?.on('data', (data) => {
        const lines = data.toString().split('\n');
        lines.forEach((line: string) => {
          if (line.trim()) {
            this.processOutput(line);
          }
        });
      });

      this.currentProcess.on('close', (code) => {
        if (code === 0) {
          this.sendMessage('status', { status: 'complete' });
          this.sendMessage('complete', { message: 'Fuses written successfully!', level: 'success' });
        } else {
          this.sendMessage('status', { status: 'error' });
          this.sendMessage('error', { message: `avrdude exited with code ${code}`, level: 'error' });
        }
        this.currentProcess = null;
        resolve();
      });

      this.currentProcess.on('error', (err) => {
        this.sendMessage('error', { message: `Failed to start avrdude: ${err.message}`, level: 'error' });
        this.sendMessage('status', { status: 'error' });
        this.currentProcess = null;
        resolve();
      });
    });
  }

  public async readEeprom(
    mcu: string,
    programmer: string,
    port?: string,
    baudRate?: number,
    bitClock?: number
  ): Promise<void> {
    const mcuConfig = MCU_LIST.find(m => m.id === mcu);
    const eepromSize = mcuConfig?.eepromSize || 1024;
    const outputFile = path.join(this.uploadsDir, `eeprom_${Date.now()}.hex`);

    const args = this.buildBaseArgs(programmer, mcu, port, baudRate, bitClock);
    args.push('-U', `eeprom:r:${outputFile}:i`);

    this.sendMessage('log', { message: `Executing: avrdude ${args.join(' ')}`, level: 'info' });
    this.sendMessage('status', { status: 'reading_eeprom' });

    return new Promise((resolve) => {
      this.currentProcess = spawn('avrdude', args);

      this.currentProcess.stdout?.on('data', (data) => {
        const lines = data.toString().split('\n');
        lines.forEach((line: string) => {
          if (line.trim()) {
            this.processOutput(line);
          }
        });
      });

      this.currentProcess.stderr?.on('data', (data) => {
        const lines = data.toString().split('\n');
        lines.forEach((line: string) => {
          if (line.trim()) {
            this.processOutput(line);
          }
        });
      });

      this.currentProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const eepromData = fs.readFileSync(outputFile, 'base64');
            this.sendMessage('eeprom_data', { 
              eepromData,
              eepromSize
            });
            this.sendMessage('status', { status: 'complete' });
            this.sendMessage('complete', { message: 'EEPROM read successfully!', level: 'success' });
            fs.unlinkSync(outputFile);
          } catch (err) {
            this.sendMessage('error', { message: 'Failed to read EEPROM file', level: 'error' });
            this.sendMessage('status', { status: 'error' });
          }
        } else {
          this.sendMessage('status', { status: 'error' });
          this.sendMessage('error', { message: `avrdude exited with code ${code}`, level: 'error' });
        }
        this.currentProcess = null;
        resolve();
      });

      this.currentProcess.on('error', (err) => {
        this.sendMessage('error', { message: `Failed to start avrdude: ${err.message}`, level: 'error' });
        this.sendMessage('status', { status: 'error' });
        this.currentProcess = null;
        resolve();
      });
    });
  }

  public async writeEeprom(
    eepromFile: string,
    mcu: string,
    programmer: string,
    port?: string,
    baudRate?: number,
    bitClock?: number
  ): Promise<void> {
    const eepromFilePath = path.join(this.uploadsDir, eepromFile);
    
    if (!fs.existsSync(eepromFilePath)) {
      this.sendMessage('error', { message: `EEPROM file not found: ${eepromFile}`, level: 'error' });
      return;
    }

    const args = this.buildBaseArgs(programmer, mcu, port, baudRate, bitClock);
    args.push('-U', `eeprom:w:${eepromFilePath}:i`);

    this.sendMessage('log', { message: `Executing: avrdude ${args.join(' ')}`, level: 'info' });
    this.sendMessage('status', { status: 'writing_eeprom' });

    return new Promise((resolve) => {
      this.currentProcess = spawn('avrdude', args);

      this.currentProcess.stdout?.on('data', (data) => {
        const lines = data.toString().split('\n');
        lines.forEach((line: string) => {
          if (line.trim()) {
            this.processOutput(line);
          }
        });
      });

      this.currentProcess.stderr?.on('data', (data) => {
        const lines = data.toString().split('\n');
        lines.forEach((line: string) => {
          if (line.trim()) {
            this.processOutput(line);
          }
        });
      });

      this.currentProcess.on('close', (code) => {
        if (code === 0) {
          this.sendMessage('status', { status: 'complete' });
          this.sendMessage('complete', { message: 'EEPROM written successfully!', level: 'success' });
        } else {
          this.sendMessage('status', { status: 'error' });
          this.sendMessage('error', { message: `avrdude exited with code ${code}`, level: 'error' });
        }
        this.currentProcess = null;
        resolve();
      });

      this.currentProcess.on('error', (err) => {
        this.sendMessage('error', { message: `Failed to start avrdude: ${err.message}`, level: 'error' });
        this.sendMessage('status', { status: 'error' });
        this.currentProcess = null;
        resolve();
      });
    });
  }

  public cleanup(): void {
    this.stop();
  }
}
