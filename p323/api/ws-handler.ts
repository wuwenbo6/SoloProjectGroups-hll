import type { WebSocket } from 'ws';
import { ReplBridge } from './repl-bridge.js';
import type { ClientMessage, ServerMessage } from '../shared/types.js';

export function handleWsConnection(ws: WebSocket): void {
  let bridge: ReplBridge | null = null;

  const sendMessage = (msg: ServerMessage): void => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  };

  bridge = new ReplBridge(
    (data: string) => {
      sendMessage({ type: 'output', data });
    },
    (state) => {
      sendMessage({ type: 'status', state });
      if (state === 'connected') {
        sendMessage({ type: 'connected' });
      } else if (state === 'disconnected') {
        sendMessage({ type: 'disconnected' });
      }
    },
    (message: string) => {
      sendMessage({ type: 'error', message });
    },
    (filename: string, percent: number) => {
      sendMessage({ type: 'file_upload_progress', filename, percent });
    },
    (filename: string) => {
      sendMessage({ type: 'file_upload_complete', filename });
    },
    (filename: string, message: string) => {
      sendMessage({ type: 'file_upload_error', filename, message });
    },
  );

  ws.on('message', async (raw: Buffer) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      sendMessage({ type: 'error', message: 'Invalid JSON message' });
      return;
    }

    switch (msg.type) {
      case 'connect':
        try {
          await bridge!.connect(msg.transport, msg.config);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          sendMessage({ type: 'error', message });
        }
        break;

      case 'disconnect':
        try {
          await bridge!.disconnect();
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          sendMessage({ type: 'error', message });
        }
        break;

      case 'command':
        bridge!.sendCommand(msg.data);
        break;

      case 'interrupt':
        bridge!.interrupt();
        break;

      case 'soft_reset':
        bridge!.softReset();
        break;

      case 'file_upload':
        try {
          await bridge!.uploadFile(msg.file.filename, msg.file.content);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          sendMessage({ type: 'file_upload_error', filename: msg.file.filename, message });
        }
        break;

      default:
        sendMessage({ type: 'error', message: `Unknown message type` });
    }
  });

  ws.on('close', async () => {
    if (bridge) {
      await bridge.destroy();
      bridge = null;
    }
  });

  ws.on('error', () => {
    if (bridge) {
      bridge.destroy();
      bridge = null;
    }
  });

  sendMessage({ type: 'status', state: 'disconnected' });
}
