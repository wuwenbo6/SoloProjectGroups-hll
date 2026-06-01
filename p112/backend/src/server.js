const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const estimateRoutes = require('./routes/estimate');
const historyRoutes = require('./routes/history');
const reportRoutes = require('./routes/report');

const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

require('./db/sqlite');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api/estimate', estimateRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/report', reportRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'HLS资源估算服务运行正常' });
});

app.listen(PORT, () => {
  console.log(`HLS Estimator 后端服务运行在 http://localhost:${PORT}`);
});
