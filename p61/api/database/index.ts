import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '../../data/database.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database');
  }
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS test_cases (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      url TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS action_steps (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      type TEXT NOT NULL,
      selector TEXT NOT NULL,
      selector_type TEXT NOT NULL,
      value TEXT,
      element_description TEXT,
      FOREIGN KEY (case_id) REFERENCES test_cases(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.get('SELECT value FROM settings WHERE key = ?', ['selector_priority'], (err, row) => {
    if (err) {
      console.error('Error checking settings:', err);
      return;
    }
    if (!row) {
      db.run(
        'INSERT INTO settings (id, key, value) VALUES (?, ?, ?)',
        ['1', 'selector_priority', JSON.stringify(['id', 'name', 'css', 'xpath'])],
        (err) => {
          if (err) {
            console.error('Error inserting default setting:', err);
          }
        }
      );
    }
  });
});

export default db;
