require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const tokenRoutes = require('./routes/token');
const hookRoutes = require('./routes/hooks');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.static('public'));

app.use('/api/token', tokenRoutes);
app.use('/api/hooks', hookRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`RTMP Auth Service running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Token API: http://localhost:${PORT}/api/token`);
  console.log(`Hooks API: http://localhost:${PORT}/api/hooks`);
});
