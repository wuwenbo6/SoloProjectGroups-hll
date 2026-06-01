import app from './app.js';
import { startUdpServer } from './services/UdpServer.js';

const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
  console.log(`HTTP server ready on port ${PORT}`);
});

startUdpServer();

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
