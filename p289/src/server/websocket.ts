import { WebSocketServer, WebSocket } from 'ws';
import { Server as HttpServer } from 'http';

export interface WsMessage {
  type: string;
  data?: any;
  id?: string;
}

export interface WsClient {
  id: string;
  ws: WebSocket;
  sessionId?: string;
}

export class WebSocketService {
  private wss: WebSocketServer;
  private clients: Map<string, WsClient> = new Map();
  private clientIdCounter: number = 0;

  constructor(httpServer: HttpServer) {
    this.wss = new WebSocketServer({ server: httpServer, path: '/ws' });
    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.wss.on('connection', (ws) => {
      const clientId = `client_${++this.clientIdCounter}`;
      const client: WsClient = { id: clientId, ws };
      this.clients.set(clientId, client);

      console.log(`[WS] Client connected: ${clientId}`);

      this.sendToClient(clientId, {
        type: 'connected',
        data: { clientId }
      });

      ws.on('message', (message) => {
        try {
          const parsed: WsMessage = JSON.parse(message.toString());
          this.handleMessage(clientId, parsed);
        } catch (e) {
          console.error('[WS] Failed to parse message:', e);
        }
      });

      ws.on('close', () => {
        this.clients.delete(clientId);
        console.log(`[WS] Client disconnected: ${clientId}`);
      });

      ws.on('error', (error) => {
        console.error(`[WS] Client error ${clientId}:`, error);
      });
    });
  }

  private handleMessage(clientId: string, message: WsMessage): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    switch (message.type) {
      case 'ping':
        this.sendToClient(clientId, { type: 'pong', data: Date.now() });
        break;
      case 'subscribe':
        client.sessionId = message.data?.sessionId;
        this.sendToClient(clientId, {
          type: 'subscribed',
          data: { sessionId: message.data?.sessionId }
        });
        break;
      case 'unsubscribe':
        client.sessionId = undefined;
        this.sendToClient(clientId, { type: 'unsubscribed' });
        break;
      default:
        console.log(`[WS] Unknown message type from ${clientId}:`, message.type);
    }
  }

  sendToClient(clientId: string, message: WsMessage): void {
    const client = this.clients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }

  broadcast(message: WsMessage, sessionId?: string): void {
    this.clients.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        if (!sessionId || client.sessionId === sessionId) {
          client.ws.send(JSON.stringify(message));
        }
      }
    });
  }

  broadcastProgress(sessionId: string, progress: number, message?: string): void {
    this.broadcast({
      type: 'execution:progress',
      data: { progress, message, sessionId }
    }, sessionId);
  }

  broadcastResult(sessionId: string, result: any): void {
    this.broadcast({
      type: 'execution:result',
      data: { result, sessionId }
    }, sessionId);
  }

  broadcastError(sessionId: string, error: string): void {
    this.broadcast({
      type: 'execution:error',
      data: { error, sessionId }
    }, sessionId);
  }

  broadcastStats(sessionId: string, stats: Record<string, number>): void {
    this.broadcast({
      type: 'stats:update',
      data: { stats, sessionId }
    }, sessionId);
  }

  getClientCount(): number {
    return this.clients.size;
  }

  close(): void {
    this.wss.close();
  }
}
