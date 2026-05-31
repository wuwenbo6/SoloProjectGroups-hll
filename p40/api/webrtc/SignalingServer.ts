import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { dbService } from '../services/DatabaseService';
import { serialService } from '../services/SerialService';
import { udpService } from '../services/UDPService';

interface Peer {
  id: string;
  ws: WebSocket;
  userId?: number;
  lastCommandSequence: number;
  lastSensorSequence: number;
}

interface CommandStats {
  received: number;
  dropped: number;
  outOfOrder: number;
  expired: number;
}

const MAX_COMMAND_AGE_MS = 80;
const MAX_SEQUENCE_GAP = 100;

class SignalingServer {
  private wss: WebSocketServer;
  private peers: Map<string, Peer> = new Map();
  private stats: CommandStats = { received: 0, dropped: 0, outOfOrder: 0, expired: 0 };

  start(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws, req) => {
      const peerId = this.generatePeerId();
      const ip = req.socket.remoteAddress;
      
      console.log('New peer connected:', peerId);
      this.peers.set(peerId, { 
        id: peerId, 
        ws, 
        lastCommandSequence: 0,
        lastSensorSequence: 0 
      });

      ws.send(JSON.stringify({ type: 'connected', peerId }));

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(peerId, message, ip);
        } catch (err) {
          console.error('Failed to parse message:', err);
        }
      });

      ws.on('close', () => {
        console.log('Peer disconnected:', peerId);
        this.peers.delete(peerId);
      });

      ws.on('error', (err) => {
        console.error('WebSocket error:', err);
      });
    });

    const mode = dbService.getConfig('communication_mode') || 'udp';
    if (mode === 'udp') {
      udpService.connect();
      udpService.onData((data) => this.handleSensorData(data));
    }

    setInterval(() => {
      if (this.stats.received > 0) {
        console.log(`Command stats: received=${this.stats.received}, dropped=${this.stats.dropped}, outOfOrder=${this.stats.outOfOrder}, expired=${this.stats.expired}`);
      }
    }, 10000);

    console.log('Signaling server started');
  }

  private validateCommand(command: any, peer: Peer): { valid: boolean; reason?: string } {
    if (!command || typeof command !== 'object') {
      return { valid: false, reason: 'invalid_format' };
    }

    if (command.timestamp) {
      const age = Date.now() - command.timestamp;
      if (age > MAX_COMMAND_AGE_MS) {
        this.stats.expired++;
        return { valid: false, reason: `expired_${age}ms` };
      }
    }

    if (command.sequence !== undefined) {
      const seqDiff = command.sequence - peer.lastCommandSequence;
      
      if (seqDiff <= -MAX_SEQUENCE_GAP) {
        this.stats.outOfOrder++;
        return { valid: false, reason: 'out_of_order' };
      }
      
      if (seqDiff <= 0 && Math.abs(seqDiff) > 5) {
        this.stats.outOfOrder++;
        return { valid: false, reason: 'late_packet' };
      }

      peer.lastCommandSequence = Math.max(peer.lastCommandSequence, command.sequence);
    }

    return { valid: true };
  }

  private handleMessage(peerId: string, message: any, ip?: string) {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    switch (message.type) {
      case 'offer':
      case 'answer':
      case 'candidate':
        this.relayMessage(peerId, message);
        break;
      
      case 'command':
        this.stats.received++;
        const validation = this.validateCommand(message.command, peer);
        if (validation.valid) {
          this.forwardCommand(message.command, peer.userId, ip);
        } else {
          this.stats.dropped++;
          console.debug(`Dropped command: ${validation.reason}`);
        }
        break;
      
      case 'auth':
        this.authenticate(peerId, message.username, message.password);
        break;
      
      case 'sensor_data':
        this.handleSensorData(JSON.stringify(message.data));
        break;
    }
  }

  private handleSensorData(data: string) {
    try {
      const parsed = JSON.parse(data);
      const now = Date.now();
      
      if (!parsed.timestamp) {
        parsed.timestamp = now;
      }
      
      if (!parsed.sequence) {
        parsed.sequence = now;
      }

      this.broadcastSensorData(parsed);
    } catch (err) {
      console.error('Failed to parse sensor data:', err);
      this.broadcastSensorDataRaw(data);
    }
  }

  private authenticate(peerId: string, username: string, password: string) {
    const user = dbService.verifyUser(username, password);
    const peer = this.peers.get(peerId);
    
    if (peer && user) {
      peer.userId = user.id;
      peer.ws.send(JSON.stringify({
        type: 'auth_success',
        role: user.role
      }));
      dbService.logOperation(user.id, 'login', undefined, peer.ws._socket?.remoteAddress);
    } else {
      peer?.ws.send(JSON.stringify({ type: 'auth_failed' }));
    }
  }

  private relayMessage(fromPeerId: string, message: any) {
    this.peers.forEach((peer, id) => {
      if (id !== fromPeerId && peer.ws.readyState === WebSocket.OPEN) {
        peer.ws.send(JSON.stringify({ ...message, from: fromPeerId }));
      }
    });
  }

  private forwardCommand(command: any, userId?: number, ip?: string) {
    const mode = dbService.getConfig('communication_mode') || 'udp';
    
    if (mode === 'serial' && serialService.isPortOpen()) {
      serialService.sendCommand(command);
    } else if (mode === 'udp' && udpService.isSocketOpen()) {
      udpService.sendCommand(command);
    }

    if (userId) {
      dbService.logOperation(userId, 'command', JSON.stringify(command), ip);
    }
  }

  private broadcastSensorData(data: any) {
    const message = JSON.stringify({ type: 'sensor', data });
    this.peers.forEach((peer) => {
      if (peer.ws.readyState === WebSocket.OPEN) {
        peer.ws.send(message);
      }
    });
  }

  private broadcastSensorDataRaw(data: string) {
    const message = JSON.stringify({ type: 'sensor', data: JSON.parse(data) });
    this.peers.forEach((peer) => {
      if (peer.ws.readyState === WebSocket.OPEN) {
        peer.ws.send(message);
      }
    });
  }

  private generatePeerId(): string {
    return Math.random().toString(36).substring(2, 10);
  }

  getPeerCount(): number {
    return this.peers.size;
  }
}

export const signalingServer = new SignalingServer();
