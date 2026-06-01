import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'data', 'ocpp.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS charge_points (
      id TEXT PRIMARY KEY,
      charge_point_vendor TEXT NOT NULL,
      charge_point_model TEXT NOT NULL,
      charge_point_serial_number TEXT,
      firmware_version TEXT,
      status TEXT NOT NULL DEFAULT 'offline',
      last_heartbeat DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      charge_point_id TEXT NOT NULL,
      connector_id INTEGER NOT NULL,
      id_tag TEXT NOT NULL,
      start_time DATETIME NOT NULL,
      stop_time DATETIME,
      start_meter_value INTEGER NOT NULL,
      stop_meter_value INTEGER,
      energy_consumed INTEGER,
      duration INTEGER,
      status TEXT NOT NULL DEFAULT 'active',
      FOREIGN KEY (charge_point_id) REFERENCES charge_points(id)
    );

    CREATE TABLE IF NOT EXISTS billing_details (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL UNIQUE,
      energy_consumed INTEGER NOT NULL,
      duration_minutes INTEGER NOT NULL,
      energy_price REAL NOT NULL,
      service_price REAL NOT NULL,
      energy_cost REAL NOT NULL,
      service_cost REAL NOT NULL,
      total_cost REAL NOT NULL,
      pricing_rule_id INTEGER,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (transaction_id) REFERENCES transactions(id),
      FOREIGN KEY (pricing_rule_id) REFERENCES pricing_rules(id)
    );

    CREATE TABLE IF NOT EXISTS pricing_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      energy_rate REAL NOT NULL,
      service_rate REAL NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_charge_point ON transactions(charge_point_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
    CREATE INDEX IF NOT EXISTS idx_billing_transaction ON billing_details(transaction_id);
  `);

  const ruleCount = db.prepare('SELECT COUNT(*) as count FROM pricing_rules').get() as { count: number };
  if (ruleCount.count === 0) {
    const insert = db.prepare(`
      INSERT INTO pricing_rules (name, start_time, end_time, energy_rate, service_rate, is_active)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insert.run('峰时电价', '07:00', '23:00', 1.2, 0.6, 1);
    insert.run('谷时电价', '23:00', '07:00', 0.6, 0.3, 1);
  }
}

export default db;
