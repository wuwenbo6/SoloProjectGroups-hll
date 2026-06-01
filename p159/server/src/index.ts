import express from 'express';
import cors from 'cors';
import {
  connectDevice,
  disconnectDevice,
  getDeviceStatus,
  sendScpiCommand,
  sendBatchCommands,
  enqueueScpiCommand,
  getCommandStatus,
  getQueueStatus,
  clearQueue,
  parseWaveformData,
  exportWaveformCsv
} from './controllers/visa.controller';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.get('/api/device/status', getDeviceStatus);
app.post('/api/device/connect', connectDevice);
app.post('/api/device/disconnect', disconnectDevice);
app.post('/api/device/command', sendScpiCommand);
app.post('/api/device/commands', sendBatchCommands);

app.post('/api/queue/enqueue', enqueueScpiCommand);
app.get('/api/queue/status/:id', getCommandStatus);
app.get('/api/queue', getQueueStatus);
app.delete('/api/queue', clearQueue);

app.post('/api/waveform/parse', parseWaveformData);
app.post('/api/waveform/export-csv', exportWaveformCsv);

app.listen(PORT, () => {
  console.log(`VISA SCPI Gateway Server running on port ${PORT}`);
  console.log(`API Health Check: http://localhost:${PORT}/api/health`);
});
