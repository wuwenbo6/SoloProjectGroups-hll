const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || './database/produce.db';
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath);

function initDatabase() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS produce_images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        produce_id TEXT NOT NULL,
        image_url TEXT NOT NULL,
        image_type TEXT,
        uploaded_by TEXT,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS report_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_id TEXT NOT NULL,
        produce_id TEXT NOT NULL,
        file_url TEXT NOT NULL,
        file_name TEXT,
        uploaded_by TEXT,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS certificates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        certificate_id TEXT NOT NULL,
        produce_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        generated_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS alert_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        produce_id TEXT NOT NULL,
        alert_type TEXT NOT NULL,
        temperature REAL,
        location TEXT,
        description TEXT,
        acknowledged BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const bcrypt = require('bcryptjs');
    const defaultUsers = [
      { username: 'farm_admin', password: 'farm123', role: 'farm', name: '农场管理员' },
      { username: 'factory_admin', password: 'factory123', role: 'factory', name: '加工厂管理员' },
      { username: 'logistics_admin', password: 'logistics123', role: 'logistics', name: '物流管理员' },
      { username: 'inspector', password: 'inspector123', role: 'inspector', name: '质检员' },
    ];

    defaultUsers.forEach(user => {
      db.get('SELECT id FROM users WHERE username = ?', [user.username], (err, row) => {
        if (!row) {
          const hashedPassword = bcrypt.hashSync(user.password, 10);
          db.run(
            'INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)',
            [user.username, hashedPassword, user.role, user.name]
          );
        }
      });
    });
  });
}

function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function runInsert(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this.lastID);
    });
  });
}

module.exports = {
  initDatabase,
  runQuery,
  runInsert,
  db
};
