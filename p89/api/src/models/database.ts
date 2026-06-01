import Database from 'better-sqlite3';
import { config } from '../config/index.js';
import fs from 'fs';
import path from 'path';

const dbDir = path.dirname(config.database.path);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(config.database.path);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const initTables = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS operation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      user VARCHAR(100) NOT NULL,
      action VARCHAR(50) NOT NULL,
      resource VARCHAR(50) NOT NULL,
      resource_id VARCHAR(100),
      status VARCHAR(20) NOT NULL,
      message TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON operation_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_logs_action ON operation_logs(action);
    CREATE INDEX IF NOT EXISTS idx_logs_user ON operation_logs(user);

    CREATE TABLE IF NOT EXISTS config (
      key VARCHAR(100) PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const insertConfig = db.prepare(`
    INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)
  `);

  const defaultConfigs = [
    ['proxmox_host', 'https://localhost:8006'],
    ['proxmox_user', 'root@pam'],
  ];

  defaultConfigs.forEach(([key, value]) => {
    insertConfig.run(key, value);
  });
};

initTables();

export default db;
