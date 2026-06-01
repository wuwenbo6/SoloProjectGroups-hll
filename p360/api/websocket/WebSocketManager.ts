import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type {
  ClientMessage,
  ServerMessage,
  ConnectMessage,
  SetFilterMessage,
  ResumeTokenError,
  ChangeEvent,
  MatchFilter,
} from '../../shared/types.js';
import { isResumeTokenError } from '../../shared/types.js';
import { changeStreams } from '../services/ChangeStreamsService.js';
import { collection } from '../services/CollectionService.js';

interface ClientConnection {
  ws: WebSocket;
  isAlive: boolean;
  resumeToken: string | null;
  filter: MatchFilter | null;
}

export class WebSocketManager {
  private wss: WebSocketServer;
  private clients: Map<WebSocket, ClientConnection> = new Map();
  private unsubscribe: (() => void) | null = null;

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.setup();
  }

  private setup(): void {
    this.wss.on('connection', (ws) => {
      const client: ClientConnection = {
        ws,
        isAlive: true,
        resumeToken: null,
        filter: null,
      };
      this.clients.set(ws, client);

      ws.on('message', (data) => {
        this.handleMessage(ws, data.toString());
      });

      ws.on('pong', () => {
        const c = this.clients.get(ws);
        if (c) c.isAlive = true;
      });

      ws.on('close', () => {
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.clients.delete(ws);
      });
    });

    this.unsubscribe = collection.subscribe((event: ChangeEvent) => {
      this.broadcast(event, false);
    });

    const interval = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        const client = this.clients.get(ws);
        if (client && !client.isAlive) {
          return ws.terminate();
        }
        if (client) {
          client.isAlive = false;
          ws.ping();
        }
      });
    }, 30000);

    this.wss.on('close', () => {
      clearInterval(interval);
      if (this.unsubscribe) {
        this.unsubscribe();
      }
    });
  }

  private handleMessage(ws: WebSocket, data: string): void {
    try {
      const message: ClientMessage = JSON.parse(data);

      if (message.type === 'connect') {
        this.handleConnect(ws, message);
      } else if (message.type === 'setFilter') {
        this.handleSetFilter(ws, message);
      }
    } catch (error) {
      console.error('Invalid message:', error);
      this.send(ws, {
        type: 'connected',
        currentTerm: changeStreams.getTerm(),
      });
    }
  }

  private handleSetFilter(ws: WebSocket, message: SetFilterMessage): void {
    const client = this.clients.get(ws);
    if (!client) return;

    client.filter = message.filter;

    const allEvents = changeStreams.getAllEvents();
    const matchedCount = allEvents.filter((e) => changeStreams.matchEvent(e, message.filter)).length;

    this.send(ws, {
      type: 'filterUpdated',
      filter: message.filter,
      matchedCount,
    });
  }

  private handleConnect(ws: WebSocket, message: ConnectMessage): void {
    const client = this.clients.get(ws);
    if (!client) return;

    const resumeAfter = message.resumeAfter;
    if (message.filter !== undefined) {
      client.filter = message.filter;
    }

    const allEvents = changeStreams.getAllEvents();
    const matchedCount = allEvents.filter((e) => changeStreams.matchEvent(e, client.filter)).length;

    if (!resumeAfter) {
      client.resumeToken = null;
      this.send(ws, {
        type: 'connected',
        startingToken: changeStreams.getLastToken() || undefined,
        missedEventCount: 0,
        currentTerm: changeStreams.getTerm(),
        currentOptime: changeStreams.getCurrentOptime() || undefined,
      });
      if (client.filter) {
        this.send(ws, {
          type: 'filterUpdated',
          filter: client.filter,
          matchedCount,
        });
      }
      return;
    }

    const validationError = changeStreams.validateResumeToken(resumeAfter);
    if (validationError) {
      this.send(ws, {
        type: 'tokenError',
        error: validationError,
      });

      client.resumeToken = null;
      this.send(ws, {
        type: 'connected',
        startingToken: changeStreams.getLastToken() || undefined,
        missedEventCount: 0,
        error: validationError,
        currentTerm: changeStreams.getTerm(),
        currentOptime: changeStreams.getCurrentOptime() || undefined,
      });
      if (client.filter) {
        this.send(ws, {
          type: 'filterUpdated',
          filter: client.filter,
          matchedCount,
        });
      }
      return;
    }

    const result = changeStreams.getFilteredEvents(client.filter, resumeAfter);
    if (isResumeTokenError(result)) {
      this.send(ws, {
        type: 'tokenError',
        error: result,
      });
      this.send(ws, {
        type: 'connected',
        startingToken: changeStreams.getLastToken() || undefined,
        missedEventCount: 0,
        error: result,
        currentTerm: changeStreams.getTerm(),
        currentOptime: changeStreams.getCurrentOptime() || undefined,
      });
      return;
    }

    const missedEvents = result;
    client.resumeToken = resumeAfter;

    this.send(ws, {
      type: 'connected',
      startingToken: changeStreams.getLastToken() || undefined,
      missedEventCount: missedEvents.length,
      currentTerm: changeStreams.getTerm(),
      currentOptime: changeStreams.getCurrentOptime() || undefined,
    });

    if (client.filter) {
      this.send(ws, {
        type: 'filterUpdated',
        filter: client.filter,
        matchedCount,
      });
    }

    missedEvents.forEach((event, index) => {
      setTimeout(() => {
        this.send(ws, {
          type: 'change',
          event,
          isResumed: true,
        });
        client.resumeToken = event._id._data;
        if (index === missedEvents.length - 1) {
          this.send(ws, {
            type: 'resumeComplete',
            totalResumed: missedEvents.length,
          });
        }
      }, index * 50);
    });
  }

  private broadcast(event: ChangeEvent, isResumed: boolean): void {
    this.wss.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          const client = this.clients.get(ws);
          if (client && !changeStreams.matchEvent(event, client.filter)) {
            return;
          }

          const message: ServerMessage = {
            type: 'change',
            event,
            isResumed,
          };

          this.send(ws, message);
          if (client) {
            client.resumeToken = event._id._data;
          }
        } catch (e) {
          console.error('Broadcast error:', e);
        }
      }
    });
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  public getClientCount(): number {
    return this.clients.size;
  }

  public close(): void {
    this.wss.close();
    this.unsubscribe?.();
  }
}
