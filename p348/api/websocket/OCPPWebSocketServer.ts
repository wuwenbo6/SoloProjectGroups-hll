import { WebSocketServer, WebSocket } from 'ws';
import { Server as HttpServer } from 'http';
import { ocppHandler } from '../services/ocpp/OCPPHandler';
import { messageQueue } from '../services/queue/MessageQueue';
import { OCPPAction } from '../../shared/types';

interface OCPPConnection {
  chargePointId: string;
  ws: WebSocket;
}

const connections = new Map<string, OCPPConnection>();

const pendingCallbacks = new Map<string, {
  resolve: (payload: Record<string, unknown>) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  chargePointId: string;
  messageId: number;
}>();

export function createOCPPWebSocketServer(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ocpp' });

  wss.on('connection', (ws: WebSocket, req) => {
    const url = req.url || '';
    const chargePointId = url.split('/').pop() || '';

    if (!chargePointId) {
      ws.close(1008, 'ChargePoint ID required');
      return;
    }

    console.log(`[WebSocket] ChargePoint ${chargePointId} connected`);

    connections.set(chargePointId, { chargePointId, ws });

    flushPendingMessages(chargePointId, ws);

    ws.on('message', async (data: string) => {
      try {
        const message = JSON.parse(data.toString());
        await handleOCPPMessage(chargePointId, message, ws);
      } catch (error) {
        console.error('[WebSocket] Error handling message:', error);
        sendError(ws, 'InternalError', 'An internal error occurred');
      }
    });

    ws.on('close', () => {
      console.log(`[WebSocket] ChargePoint ${chargePointId} disconnected`);
      connections.delete(chargePointId);
    });

    ws.on('error', (error) => {
      console.error(`[WebSocket] Error for ${chargePointId}:`, error);
    });
  });

  console.log('[WebSocket] OCPP WebSocket server started on /ocpp');
  return wss;
}

async function flushPendingMessages(chargePointId: string, ws: WebSocket): Promise<void> {
  const pending = messageQueue.getPendingForChargePoint(chargePointId);
  if (pending.length === 0) return;

  console.log(`[WebSocket] Flushing ${pending.length} queued messages for ${chargePointId}`);

  for (const msg of pending) {
    if (ws.readyState !== WebSocket.OPEN) {
      console.warn(`[WebSocket] Connection closed during flush, stopping at message ${msg.id}`);
      break;
    }

    try {
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(msg.payload);
      } catch {
        payload = {};
      }

      const uniqueId = generateUniqueId();
      const rawMessage = [2, uniqueId, msg.action, payload];
      ws.send(JSON.stringify(rawMessage));

      messageQueue.markDelivered(msg.id);
      console.log(`[WebSocket] Delivered queued ${msg.action} (id=${msg.id}) to ${chargePointId}`);

      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`[WebSocket] Failed to deliver queued message ${msg.id}:`, error);
      messageQueue.markFailed(msg.id);
    }
  }
}

async function handleOCPPMessage(chargePointId: string, message: any[], ws: WebSocket): Promise<void> {
  if (!Array.isArray(message) || message.length < 2) {
    sendError(ws, 'FormationViolation', 'Invalid message format');
    return;
  }

  const messageTypeId = message[0];
  const uniqueId = message[1];

  if (messageTypeId === 2) {
    const action = message[2] as OCPPAction;
    const payload = message[3] || {};

    try {
      const response = await ocppHandler.handleMessage(chargePointId, action, payload);
      sendResponse(ws, uniqueId, response);
    } catch (error: any) {
      sendError(ws, uniqueId, error.message || 'Internal error');
    }
  } else if (messageTypeId === 3) {
    const cb = pendingCallbacks.get(String(uniqueId));
    if (cb) {
      clearTimeout(cb.timer);
      pendingCallbacks.delete(String(uniqueId));
      cb.resolve(message[2] || {});
    } else {
      console.log(`[WebSocket] Received response from ${chargePointId}:`, message[2]);
    }
  } else if (messageTypeId === 4) {
    const cb = pendingCallbacks.get(String(uniqueId));
    if (cb) {
      clearTimeout(cb.timer);
      pendingCallbacks.delete(String(uniqueId));
      cb.reject(new Error(`OCPP error: ${message[2]} - ${message[3]}`));
    } else {
      console.error(`[WebSocket] Error from ${chargePointId}:`, message[2], message[3]);
    }
  } else {
    sendError(ws, 'FormationViolation', 'Invalid message type');
  }
}

function sendResponse(ws: WebSocket, uniqueId: string, payload: Record<string, unknown>): void {
  const message = [3, uniqueId, payload];
  ws.send(JSON.stringify(message));
}

function sendError(ws: WebSocket, uniqueId: string, errorCode: string, errorDescription?: string): void {
  const message = [4, uniqueId, errorCode, errorDescription || '', {}];
  ws.send(JSON.stringify(message));
}

function generateUniqueId(): string {
  return `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function sendCommandToChargePoint(
  chargePointId: string,
  action: string,
  payload: Record<string, unknown>,
  options?: { timeoutMs?: number; enqueueIfOffline?: boolean }
): Promise<Record<string, unknown>> {
  const timeoutMs = options?.timeoutMs ?? 10000;
  const enqueueIfOffline = options?.enqueueIfOffline ?? true;

  const connection = connections.get(chargePointId);

  if (!connection || connection.ws.readyState !== WebSocket.OPEN) {
    if (enqueueIfOffline) {
      messageQueue.enqueue(chargePointId, action, payload);
      return Promise.resolve({ queued: true, reason: 'ChargePoint offline, message enqueued' });
    }
    return Promise.reject(new Error(`ChargePoint ${chargePointId} is not connected`));
  }

  const uniqueId = generateUniqueId();
  const rawMessage = [2, uniqueId, action, payload];
  connection.ws.send(JSON.stringify(rawMessage));

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingCallbacks.delete(uniqueId);
      reject(new Error(`Timeout waiting for response to ${action} from ${chargePointId}`));
    }, timeoutMs);

    pendingCallbacks.set(uniqueId, {
      resolve,
      reject,
      timer,
      chargePointId,
      messageId: 0
    });
  });
}

export function getConnectedChargePoints(): string[] {
  return Array.from(connections.keys());
}

export function isChargePointConnected(chargePointId: string): boolean {
  const conn = connections.get(chargePointId);
  return !!conn && conn.ws.readyState === WebSocket.OPEN;
}
