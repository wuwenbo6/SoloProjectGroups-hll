import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import app from './app';
import { createOCPPWebSocketServer } from './websocket/OCPPWebSocketServer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

const server = http.createServer(app);

createOCPPWebSocketServer(server);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║           OCPP Central System Server                        ║
╠══════════════════════════════════════════════════════════════╣
║  HTTP Server:    http://localhost:${PORT}                        ║
║  WebSocket:      ws://localhost:${PORT}/ocpp/{chargePointId}    ║
║  SOAP Service:   http://localhost:${PORT}/ocpp/soap              ║
║  API Base:       http://localhost:${PORT}/api                   ║
║  Health Check:   http://localhost:${PORT}/health                ║
╚══════════════════════════════════════════════════════════════╝
  `);
});
