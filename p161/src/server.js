const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

const hkpRoutes = require('./routes/hkp');
const apiRoutes = require('./routes/api');
const webRoutes = require('./routes/web');
const wkdRoutes = require('./routes/wkd');

const app = express();
const PORT = process.env.PORT || 11371;

app.use((req, res, next) => {
  let data = [];
  req.on('data', chunk => data.push(chunk));
  req.on('end', () => {
    if (data.length > 0) {
      req.rawBody = Buffer.concat(data);
    }
    next();
  });
});

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(bodyParser.text({ type: 'text/plain', limit: '10mb' }));

app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

app.use('/pks', hkpRoutes);

app.use('/.well-known/openpgpkey', wkdRoutes);

app.use('/api/v1', apiRoutes);

app.use('/', webRoutes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

app.listen(PORT, () => {
  console.log(`HKP Server running on port ${PORT}`);
  console.log(`Web interface: http://localhost:${PORT}`);
  console.log(`HKP endpoints:`);
  console.log(`  - POST /pks/add - Upload public key`);
  console.log(`  - GET  /pks/lookup - Search and retrieve keys`);
  console.log(`WKD endpoints:`);
  console.log(`  - GET /.well-known/openpgpkey/:domain/hu/:hash - WKD advanced lookup`);
  console.log(`  - GET /.well-known/openpgpkey/hu/:hash - WKD direct lookup`);
});
