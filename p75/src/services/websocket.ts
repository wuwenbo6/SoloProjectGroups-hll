import { io, Socket } from 'socket.io-client';
import { SensorData, PlcStatus, DownloadStatus } from '../types';

class WebSocketService {
  private socket: Socket | null = null;
  private dataListeners: ((data: SensorData) => void)[] = [];
  private statusListeners: ((status: PlcStatus) => void)[] = [];
  private downloadListeners: ((status: DownloadStatus) => void)[] = [];

  connect() {
    if (this.socket?.connected) return;

    this.socket = io('http://localhost:3001', {
      transports: ['websocket', 'polling'],
    });

    this.socket.on('connect', () => {
      console.log('WebSocket connected');
    });

    this.socket.on('data:update', (data: SensorData) => {
      this.dataListeners.forEach((cb) => cb(data));
    });

    this.socket.on('plc:status', (status: PlcStatus) => {
      this.statusListeners.forEach((cb) => cb(status));
    });

    this.socket.on('download:progress', (status: DownloadStatus) => {
      this.downloadListeners.forEach((cb) => cb(status));
    });

    this.socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  onDataUpdate(callback: (data: SensorData) => void) {
    this.dataListeners.push(callback);
    return () => {
      this.dataListeners = this.dataListeners.filter((cb) => cb !== callback);
    };
  }

  onPlcStatus(callback: (status: PlcStatus) => void) {
    this.statusListeners.push(callback);
    return () => {
      this.statusListeners = this.statusListeners.filter((cb) => cb !== callback);
    };
  }

  onDownloadProgress(callback: (status: DownloadStatus) => void) {
    this.downloadListeners.push(callback);
    return () => {
      this.downloadListeners = this.downloadListeners.filter((cb) => cb !== callback);
    };
  }
}

export const wsService = new WebSocketService();
