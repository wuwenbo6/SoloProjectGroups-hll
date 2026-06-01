/**
 * local server entry file, for local development
 */
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import app from './app.js';
import { setupWebSocket } from './routes/twt.js';

/**
 * start server with port
 */
const PORT = process.env.PORT || 3001;

const server = createServer(app);

const wss = new WebSocketServer({ server, path: '/ws' });

setupWebSocket(wss);

server.listen(PORT, () => {
  console.log(`Server ready on port ${PORT}`);
  console.log(`WebSocket available at ws://localhost:${PORT}/ws`);
});

/**
 * close server
 */
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received');
  wss.close();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received');
  wss.close();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;
