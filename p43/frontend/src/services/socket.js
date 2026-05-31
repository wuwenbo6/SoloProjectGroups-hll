import { io } from 'socket.io-client';

class SocketService {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
    
    this.pendingUpdates = new Map();
    this.batchTimer = null;
    this.batchInterval = 100;
  }

  connect() {
    if (this.socket && this.socket.connected) {
      return;
    }

    this.socket = io(window.location.origin, {
      transports: ['websocket', 'polling'],
    });

    this.socket.on('connect', () => {
      console.log('Socket connected');
    });

    this.socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    this.socket.on('deviceStatus', (data) => {
      this.queueUpdate(data);
    });

    this.socket.on('deviceStatusBatch', (data) => {
      if (Array.isArray(data)) {
        data.forEach(device => this.queueUpdate(device));
      }
    });

    this.socket.on('deviceList', (data) => {
      this.emit('deviceList', data);
    });

    return this.socket;
  }

  queueUpdate(device) {
    this.pendingUpdates.set(device.id, device);

    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.flushBatch();
      }, this.batchInterval);
    }
  }

  flushBatch() {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    if (this.pendingUpdates.size === 0) {
      return;
    }

    const updates = Array.from(this.pendingUpdates.values());
    this.emit('deviceStatusBatch', updates);
    this.pendingUpdates.clear();
  }

  disconnect() {
    this.flushBatch();
    
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (!this.listeners.has(event)) {
      return;
    }
    const callbacks = this.listeners.get(event);
    const index = callbacks.indexOf(callback);
    if (index !== -1) {
      callbacks.splice(index, 1);
    }
  }

  emit(event, data) {
    if (!this.listeners.has(event)) {
      return;
    }
    this.listeners.get(event).forEach((callback) => {
      try {
        callback(data);
      } catch (e) {
        console.error(`Error in ${event} listener:`, e);
      }
    });
  }

  send(event, data) {
    if (this.socket && this.socket.connected) {
      this.socket.emit(event, data);
    }
  }

  isConnected() {
    return this.socket && this.socket.connected;
  }
}

export default new SocketService();
