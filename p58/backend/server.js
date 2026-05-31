const express = require('express');
const cors = require('cors');
require('dotenv').config();

const cameraRoutes = require('./routes/cameras');
const ptzRoutes = require('./routes/ptz');
const recordingRoutes = require('./routes/recording');
const eventRoutes = require('./routes/events');
const analyticsRoutes = require('./routes/analytics');
const configRoutes = require('./routes/config');

const RecordingScheduler = require('./services/RecordingScheduler');
const EventSubscriptionService = require('./services/EventSubscriptionService');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api/cameras', cameraRoutes);
app.use('/api/ptz', ptzRoutes);
app.use('/api/recording', recordingRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/config', configRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const recordingScheduler = new RecordingScheduler();
recordingScheduler.start();

EventSubscriptionService.init();

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API: http://localhost:${PORT}/api`);
});
