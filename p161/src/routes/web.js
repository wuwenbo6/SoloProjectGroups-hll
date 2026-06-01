const express = require('express');
const router = express.Router();
const path = require('path');

router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

router.get('/key/:fingerprint', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/key.html'));
});

router.get('/add', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/add.html'));
});

module.exports = router;
