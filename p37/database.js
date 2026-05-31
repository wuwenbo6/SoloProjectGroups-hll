const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database', 'svc.db');
const db = new sqlite3.Database(dbPath);

class Database {
  constructor() {
    this.initTables();
  }

  initTables() {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run(`
          CREATE TABLE IF NOT EXISTS videos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            original_name TEXT NOT NULL,
            file_path TEXT NOT NULL,
            duration REAL,
            width INTEGER,
            height INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS encoding_params (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            video_id INTEGER,
            layer_type TEXT NOT NULL,
            layer_index INTEGER NOT NULL,
            bitrate INTEGER NOT NULL,
            width INTEGER,
            height INTEGER,
            fps INTEGER,
            codec TEXT DEFAULT 'h264',
            file_path TEXT NOT NULL,
            format TEXT DEFAULT 'mp4',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (video_id) REFERENCES videos(id)
          )
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS bandwidth_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            bandwidth_bps REAL NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  }

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
}

module.exports = new Database();
