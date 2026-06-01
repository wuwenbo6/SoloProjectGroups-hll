import { io, Socket } from 'socket.io-client';
import { PacketRecord, CrashRecord, RecoveryStatus } from '../types';

interface SocketEvents {
  'test:packet': (data: PacketRecord & { taskId: number }) => void;
  'test:status': (data: { taskId: number; status: string; packetCount?: number; crashCount?: number; recoveryCount?: number }) => void;
  'test:crash': (data: CrashRecord & { taskId: number }) => void;
  'test:progress': (data: { taskId: number; packetCount: number; crashCount: number; recoveryCount?: number; currentStrategy?: string }) => void;
  'test:recovery': (data: RecoveryStatus & { taskId: number }) => void;
  'error': (data: { message: string }) => void;
  'connect': () => void;
  'disconnect': () => void;
}

class WebSocketService {
  private socket: Socket | null = null;
  private listeners: Map<string, Set<Function>> = new Map();

  connect(): void {
    if (this.socket?.connected) return;

    this.socket = io({
      path: '/ws',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      console.log('WebSocket connected');
      this.emit('connect', undefined);
    });

    this.socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      this.emit('disconnect', undefined);
    });

    this.socket.on('test:packet', (data) => this.emit('test:packet', data));
    this.socket.on('test:status', (data) => this.emit('test:status', data));
    this.socket.on('test:crash', (data) => this.emit('test:crash', data));
    this.socket.on('test:progress', (data) => this.emit('test:progress', data));
    this.socket.on('test:recovery', (data) => this.emit('test:recovery', data));
    this.socket.on('error', (data) => this.emit('error', data));
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  on<K extends keyof SocketEvents>(event: K, callback: SocketEvents[K]): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  private emit(event: string, data: any): void {
    this.listeners.get(event)?.forEach((callback) => callback(data));
  }

  send(event: string, data: any): void {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
    }
  }

  testControl(taskId: number, action: 'start' | 'pause' | 'resume' | 'stop'): void {
    this.send('test_control', { task_id: taskId, action });
  }

  subscribeTask(taskId: number): void {
    this.send('subscribe_task', { task_id: taskId });
  }

  getTaskStatus(taskId: number): void {
    this.send('test_status', { task_id: taskId });
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
}

export const wsService = new WebSocketService();
