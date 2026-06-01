const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const routes = require('./routes');
const scheduler = require('./scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

const BACKUP_DIR = path.join(__dirname, '../backups');
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api', routes);

app.use('/backups', express.static(BACKUP_DIR));

app.use(express.static(path.join(__dirname, '../../frontend/dist')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
});

const server = app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
  console.log(`API文档: http://localhost:${PORT}/api`);
  
  setTimeout(() => {
    scheduler.start();
  }, 1000);
});

process.on('SIGTERM', () => {
  console.log('收到SIGTERM信号，正在关闭...');
  scheduler.stop();
  server.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('收到SIGINT信号，正在关闭...');
  scheduler.stop();
  server.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});
