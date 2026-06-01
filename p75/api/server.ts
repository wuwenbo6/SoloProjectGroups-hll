/**
 * local server entry file, for local development
 */
import app from './app.js';
import { createServer } from 'http';
import { initWebSocket } from './websocket/index.js';
import { initDatabase } from './database/index.js';
import { startOpcUaServer } from './opcua/server.js';
import { connectOpcUaClient } from './opcua/client.js';

/**
 * start server with port
 */
const PORT = process.env.PORT || 3001;

const server = createServer(app);

initWebSocket(server);

async function startServices() {
  try {
    initDatabase();
    await startOpcUaServer();
    setTimeout(async () => {
      await connectOpcUaClient();
    }, 2000);
  } catch (error) {
    console.error('Error starting services:', error);
  }
}

startServices();

server.listen(PORT, () => {
  console.log(`Server ready on port ${PORT}`);
});

/**
 * close server
 */
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;