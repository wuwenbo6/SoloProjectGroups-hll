import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '../../data/robot-control.db');

class DatabaseService {
  private db: Database.Database;

  constructor() {
    this.db = new Database(DB_PATH);
    this.initTables();
  }

  private initTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'operator',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS operation_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id),
        action VARCHAR(100) NOT NULL,
        command_json TEXT,
        ip_address VARCHAR(45),
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS system_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        config_key VARCHAR(100) UNIQUE NOT NULL,
        config_value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS robots (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        type VARCHAR(20) NOT NULL,
        ip VARCHAR(45) NOT NULL,
        port INTEGER NOT NULL,
        status VARCHAR(20) DEFAULT 'offline',
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_connected DATETIME
      );

      CREATE TABLE IF NOT EXISTS macros (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        steps TEXT NOT NULL,
        total_duration INTEGER DEFAULT 0,
        robot_id VARCHAR(50),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON operation_logs(timestamp);
      CREATE INDEX IF NOT EXISTS idx_logs_user_id ON operation_logs(user_id);
    `);

    const adminCount = this.db.prepare('SELECT COUNT(*) as count FROM users WHERE username = ?').get('admin') as { count: number };
    if (adminCount.count === 0) {
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync('admin123', salt);
      this.db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run('admin', hash, 'admin');
    }

    const defaultConfigs = [
      { key: 'serial_port', value: '/dev/ttyUSB0' },
      { key: 'serial_baudrate', value: '115200' },
      { key: 'udp_host', value: '127.0.0.1' },
      { key: 'udp_port', value: '5000' },
      { key: 'communication_mode', value: 'udp' },
      { key: 'virtual_wall_distance', value: '50' },
      { key: 'force_feedback_enabled', value: 'true' },
    ];

    const insertConfig = this.db.prepare('INSERT OR IGNORE INTO system_config (config_key, config_value) VALUES (?, ?)');
    defaultConfigs.forEach(config => {
      insertConfig.run(config.key, config.value);
    });
  }

  verifyUser(username: string, password: string): { id: number; role: string } | null {
    const user = this.db.prepare('SELECT id, password_hash, role FROM users WHERE username = ?').get(username) as { id: number; password_hash: string; role: string } | undefined;
    if (user && bcrypt.compareSync(password, user.password_hash)) {
      return { id: user.id, role: user.role };
    }
    return null;
  }

  logOperation(userId: number, action: string, commandJson?: string, ipAddress?: string) {
    this.db.prepare('INSERT INTO operation_logs (user_id, action, command_json, ip_address) VALUES (?, ?, ?, ?)').run(userId, action, commandJson, ipAddress);
  }

  getLogs(page: number = 1, limit: number = 20, userId?: number, startDate?: string, endDate?: string) {
    let query = 'SELECT * FROM operation_logs WHERE 1=1';
    const params: (string | number)[] = [];

    if (userId) {
      query += ' AND user_id = ?';
      params.push(userId);
    }
    if (startDate) {
      query += ' AND timestamp >= ?';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND timestamp <= ?';
      params.push(endDate);
    }

    query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(limit, (page - 1) * limit);

    const data = this.db.prepare(query).all(...params);
    const totalResult = this.db.prepare('SELECT COUNT(*) as count FROM operation_logs WHERE 1=1').get() as { count: number };

    return {
      data,
      total: totalResult.count,
      page,
      limit
    };
  }

  getConfig(key: string): string | undefined {
    const result = this.db.prepare('SELECT config_value FROM system_config WHERE config_key = ?').get(key) as { config_value: string } | undefined;
    return result?.config_value;
  }

  setConfig(key: string, value: string) {
    this.db.prepare('INSERT INTO system_config (config_key, config_value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(config_key) DO UPDATE SET config_value = ?, updated_at = CURRENT_TIMESTAMP').run(key, value, value);
  }

  getAllConfigs() {
    return this.db.prepare('SELECT config_key, config_value FROM system_config').all();
  }

  close() {
    this.db.close();
  }
}

export const dbService = new DatabaseService();
