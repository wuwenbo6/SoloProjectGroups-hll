require('dotenv').config();

const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const directoryRoutes = require('./routes/directory');
const usersRoutes = require('./routes/users');
const ldifRoutes = require('./routes/ldif');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'ldap-admin-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax'
  }
}));

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/directory', directoryRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/ldif', ldifRoutes);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(function (err, req, res, next) {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: '服务器内部错误'
  });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: '接口不存在'
  });
});

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                          ║
║   OpenLDAP Web Admin Console                             ║
║                                                          ║
║   Server running at:  ║
║   http://localhost:${PORT}                              ║
║                                                          ║
╚════════════════════════════════════════════════════════════╝
  `);
});
