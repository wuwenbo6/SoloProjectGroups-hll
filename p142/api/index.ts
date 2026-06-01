/**
 * Vercel deploy entry handler, for serverless deployment, please don't modify this file
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import app from './app.js';
import { advanceSimulationTime, getConfig, initializeConstellation } from './services/topologyService.js';

initializeConstellation();

const TICK_INTERVAL_MS = 100;
const tickSecondsPerTick = (getConfig().timeSpeed * TICK_INTERVAL_MS) / 1000;

const interval = setInterval(() => {
  advanceSimulationTime(tickSecondsPerTick);
}, TICK_INTERVAL_MS);

if (interval.unref) {
  interval.unref();
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  return app(req, res);
}
