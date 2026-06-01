import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import app from './app.js';
import { CoapServer } from './coap/server.js';
import { uploadStore } from './services/upload-store.js';

const PORT = process.env.PORT || 3001;
const COAP_PORT = 5683;

const server = createServer(app);

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws: WebSocket) => {
  console.log('[WS] Client connected');
  uploadStore.addWsClient(ws);
  ws.send(JSON.stringify({ type: 'connected', message: 'CoAP Upload WebSocket' }));
});

const coapServer = new CoapServer(COAP_PORT);
coapServer.setOnUploadComplete((fileName, filePath) => {
  console.log(`[Main] Upload complete: ${fileName} -> ${filePath}`);
});
coapServer.setOnBlockReceived((info) => {
  uploadStore.updateCoapBlockReceived(info);
});

export { coapServer };

async function bootstrap() {
  await coapServer.start();

  server.listen(PORT, () => {
    console.log(`[HTTP Server] Ready on port ${PORT}`);
    console.log(`[WebSocket] Available at ws://localhost:${PORT}/ws`);
    console.log(`[CoAP Server] Listening on UDP port ${COAP_PORT}`);
  });
}

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received');
  server.close(() => {
    coapServer.stop().then(() => {
      console.log('All servers closed');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received');
  server.close(() => {
    coapServer.stop().then(() => {
      console.log('All servers closed');
      process.exit(0);
    });
  });
});

bootstrap().catch((err) => {
  console.error('Failed to start servers:', err);
  process.exit(1);
});

export default app;
