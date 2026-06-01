import app from './app.js';
import {
  setupWebSocketServer,
  createArtNetSenderFromConfig,
} from './services/websocketServer.js';
import type { ArtNetSender } from './services/artnetSender.js';

const PORT = process.env.PORT || 3001;

let artNetSender: ArtNetSender | null = null;

async function startServer() {
  try {
    artNetSender = await createArtNetSenderFromConfig();
    console.log('Art-Net sender initialized');
  } catch (err) {
    console.error('Failed to initialize Art-Net sender:', err);
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    console.log(`Server ready on port ${PORT}`);
  });

  setupWebSocketServer(server, artNetSender);
  console.log('WebSocket server ready on /ws');

  process.on('SIGTERM', () => {
    console.log('SIGTERM signal received');
    server.close(() => {
      if (artNetSender) {
        artNetSender.destroy();
      }
      console.log('Server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.log('SIGINT signal received');
    server.close(() => {
      if (artNetSender) {
        artNetSender.destroy();
      }
      console.log('Server closed');
      process.exit(0);
    });
  });
}

startServer();

export default app;
