import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import apiRoutes from './routes';
import { initDatabase } from './database';
import { setupSOAPServer } from './soap/OCPPSoapServer';
import { seedMockData } from './seedData';
import { messageQueue } from './services/queue/MessageQueue';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

initDatabase();
messageQueue.init();
seedMockData();

app.use(cors());
app.use(express.json());

app.use('/api', apiRoutes);

setupSOAPServer(app);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default app;
