import dgram from 'dgram';
import { dbService } from './DatabaseService';

class UDPService {
  private socket: dgram.Socket | null = null;
  private isConnected: boolean = false;
  private targetHost: string = '127.0.0.1';
  private targetPort: number = 5000;

  connect(): void {
    this.targetHost = dbService.getConfig('udp_host') || '127.0.0.1';
    this.targetPort = parseInt(dbService.getConfig('udp_port') || '5000');

    this.socket = dgram.createSocket('udp4');
    
    this.socket.on('error', (err) => {
      console.error('UDP socket error:', err);
      this.isConnected = false;
    });

    this.socket.on('listening', () => {
      this.isConnected = true;
      const address = this.socket?.address();
      console.log(`UDP socket listening on ${address?.address}:${address?.port}`);
    });

    this.socket.bind(0);
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
      this.isConnected = false;
    }
  }

  sendCommand(command: object): void {
    if (!this.socket || !this.isConnected) {
      console.warn('UDP socket not connected');
      return;
    }

    const data = Buffer.from(JSON.stringify(command));
    this.socket.send(data, this.targetPort, this.targetHost, (err) => {
      if (err) {
        console.error('Failed to send UDP command:', err);
      }
    });
  }

  onData(callback: (data: string) => void): void {
    if (!this.socket) return;

    this.socket.on('message', (msg: Buffer) => {
      callback(msg.toString());
    });
  }

  isSocketOpen(): boolean {
    return this.isConnected;
  }

  setTarget(host: string, port: number): void {
    this.targetHost = host;
    this.targetPort = port;
  }
}

export const udpService = new UDPService();
