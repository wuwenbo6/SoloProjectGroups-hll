import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { ArtNetSender } from './artnetSender.js';
import type { WebSocketMessage } from '../../shared/types.js';
import { CHANNEL_COUNT } from '../../shared/types.js';
import { getConfig, updateConfig } from './configService.js';
import { SimulatedMtcGenerator } from '../lib/midiTimecode.js';

let mtcGenerator: SimulatedMtcGenerator | null = null;
let mtcInterval: NodeJS.Timeout | null = null;

export function setupWebSocketServer(
  server: Server,
  artNetSender: ArtNetSender
): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' });

  if (!mtcGenerator) {
    mtcGenerator = new SimulatedMtcGenerator();
    mtcGenerator.setRate('25');
  }

  if (!mtcInterval) {
    mtcInterval = setInterval(() => {
      if (!mtcGenerator) return;
      const timecode = mtcGenerator.getTime();
      const msg = JSON.stringify({
        type: 'midi-timecode',
        timecode,
      });

      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(msg);
        }
      });
    }, 40);
  }

  wss.on('connection', (ws: WebSocket) => {
    console.log('WebSocket client connected');

    ws.send(
      JSON.stringify({
        type: 'connection',
        status: 'connected',
      })
    );

    ws.send(
      JSON.stringify({
        type: 'full-frame',
        data: artNetSender.getChannels(),
      })
    );

    if (mtcGenerator) {
      ws.send(
        JSON.stringify({
          type: 'midi-status',
          connected: true,
          deviceName: 'Simulated MTC',
        })
      );

      ws.send(
        JSON.stringify({
          type: 'midi-timecode',
          timecode: mtcGenerator.getTime(),
        })
      );
    }

    ws.on('message', async (message: Buffer) => {
      try {
        const data: WebSocketMessage = JSON.parse(message.toString());

        switch (data.type) {
          case 'channel-update':
            artNetSender.setChannels(data.channels);
            broadcast(wss, message, ws);
            break;

          case 'full-frame':
            artNetSender.setFullFrame(data.data);
            broadcast(wss, message, ws);
            break;

          case 'grand-master':
            artNetSender.setGrandMaster(data.value);
            broadcast(wss, message, ws);
            break;

          case 'blackout':
            artNetSender.setBlackout(data.active);
            broadcast(wss, message, ws);
            break;

          case 'artnet-config':
            const newConfig = {
              targetIp: data.ip,
              targetPort: data.port,
              net: data.net,
              switch_: data.switch_,
              universe: data.universe,
            };
            await updateConfig(newConfig);
            artNetSender.setConfig(newConfig);
            broadcast(wss, message, ws);
            break;
        }
      } catch (err) {
        console.error('WebSocket message error:', err);
      }
    });

    ws.on('close', () => {
      console.log('WebSocket client disconnected');
    });

    ws.on('error', (err) => {
      console.error('WebSocket error:', err);
    });
  });

  return wss;
}

function broadcast(
  wss: WebSocketServer,
  message: Buffer,
  sender?: WebSocket
): void {
  wss.clients.forEach((client) => {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

export async function createArtNetSenderFromConfig(): Promise<ArtNetSender> {
  const config = await getConfig();
  const { ArtNetSender } = await import('./artnetSender.js');
  return new ArtNetSender(config);
}

export function getMtcGenerator(): SimulatedMtcGenerator | null {
  return mtcGenerator;
}

export function cleanupMtc(): void {
  if (mtcInterval) {
    clearInterval(mtcInterval);
    mtcInterval = null;
  }
  mtcGenerator = null;
}
