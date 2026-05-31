require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const authRoutes = require('./routes/auth');
const produceRoutes = require('./routes/produce');
const uploadRoutes = require('./routes/upload');
const qrRoutes = require('./routes/qrcode');
const certificateRoutes = require('./routes/certificate');
const temperatureRoutes = require('./routes/temperature');
const priceRoutes = require('./routes/price');
const db = require('./database/db');

const app = express();
const PORT = process.env.PORT || 3000;

const uploadDir = process.env.UPLOAD_PATH || './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

db.initDatabase();

app.use('/api/auth', authRoutes);
app.use('/api/produce', produceRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/qr', qrRoutes);
app.use('/api/certificate', certificateRoutes);
app.use('/api/temperature', temperatureRoutes);
app.use('/api/price', priceRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: '农产品溯源系统后端运行正常' });
});

app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});
