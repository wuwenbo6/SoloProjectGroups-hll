/**
 * local server entry file, for local development
 */
import app from './app.js';
import { initializeConstellation, advanceSimulationTime, getConfig } from './services/topologyService.js';

initializeConstellation();

const TICK_INTERVAL_MS = 100;
const tickSecondsPerTick = () => (getConfig().timeSpeed * TICK_INTERVAL_MS) / 1000;

const interval = setInterval(() => {
  advanceSimulationTime(tickSecondsPerTick());
}, TICK_INTERVAL_MS);

if (interval.unref) {
  interval.unref();
}

/**
 * start server with port
 */
const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
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