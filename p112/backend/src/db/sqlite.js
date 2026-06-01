const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'estimations.db');
const db = new sqlite3.Database(dbPath);

db.run(`
  CREATE TABLE IF NOT EXISTS estimations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code_name VARCHAR(255),
    code_content TEXT,
    lut INTEGER,
    dsp INTEGER,
    bram INTEGER,
    optimization_tips TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

module.exports = db;
