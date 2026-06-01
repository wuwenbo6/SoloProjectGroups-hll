import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../../data.db');

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sensor_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      temperature REAL NOT NULL,
      pressure REAL NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_sensor_data_timestamp ON sensor_data(timestamp);

    CREATE TABLE IF NOT EXISTS program_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename VARCHAR(255) NOT NULL,
      version VARCHAR(50) NOT NULL,
      filepath VARCHAR(500) NOT NULL,
      size INTEGER NOT NULL,
      upload_time DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS download_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      program_id INTEGER NOT NULL,
      status VARCHAR(20) DEFAULT 'pending',
      progress INTEGER DEFAULT 0,
      start_time DATETIME,
      end_time DATETIME,
      FOREIGN KEY (program_id) REFERENCES program_files(id)
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username VARCHAR(50) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'viewer',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name VARCHAR(100) NOT NULL,
      description TEXT,
      parameters TEXT NOT NULL,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS alarm_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type VARCHAR(50) NOT NULL,
      message TEXT NOT NULL,
      severity VARCHAR(20) NOT NULL,
      temperature REAL,
      pressure REAL,
      acknowledged BOOLEAN DEFAULT 0,
      acknowledged_by INTEGER,
      acknowledged_at DATETIME,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (acknowledged_by) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_alarm_logs_timestamp ON alarm_logs(timestamp);
  `);

  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  if (userCount.count === 0) {
    const salt = bcrypt.genSaltSync(10);
    const adminHash = bcrypt.hashSync('admin123', salt);
    const userHash = bcrypt.hashSync('user123', salt);
    
    db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run('admin', adminHash, 'admin');
    db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run('user', userHash, 'viewer');
    console.log('Default users created: admin/admin123, user/user123');
  }

  console.log('Database initialized');
}

export function insertSensorData(temperature: number, pressure: number) {
  const stmt = db.prepare('INSERT INTO sensor_data (temperature, pressure) VALUES (?, ?)');
  return stmt.run(temperature, pressure);
}

export function getSensorDataByTimeRange(startTime: string, endTime: string) {
  const stmt = db.prepare(`
    SELECT temperature, pressure, timestamp 
    FROM sensor_data 
    WHERE timestamp BETWEEN ? AND ? 
    ORDER BY timestamp ASC
    LIMIT 1000
  `);
  return stmt.all(startTime, endTime);
}

export function getRecentSensorData(limit: number = 100) {
  const stmt = db.prepare(`
    SELECT temperature, pressure, timestamp 
    FROM sensor_data 
    ORDER BY timestamp DESC 
    LIMIT ?
  `);
  return stmt.all(limit).reverse();
}

export function insertProgramFile(filename: string, version: string, filepath: string, size: number) {
  const stmt = db.prepare('INSERT INTO program_files (filename, version, filepath, size) VALUES (?, ?, ?, ?)');
  return stmt.run(filename, version, filepath, size);
}

export function getAllProgramFiles() {
  const stmt = db.prepare('SELECT * FROM program_files ORDER BY upload_time DESC');
  return stmt.all();
}

export function getProgramFileById(id: number) {
  const stmt = db.prepare('SELECT * FROM program_files WHERE id = ?');
  return stmt.get(id);
}

export function createDownloadLog(programId: number) {
  const stmt = db.prepare('INSERT INTO download_logs (program_id, status, start_time) VALUES (?, ?, CURRENT_TIMESTAMP)');
  return stmt.run(programId, 'downloading');
}

export function updateDownloadProgress(id: number, progress: number, status: string = 'downloading') {
  const stmt = db.prepare('UPDATE download_logs SET progress = ?, status = ? WHERE id = ?');
  return stmt.run(progress, status, id);
}

export function getDownloadStatus(id: number) {
  const stmt = db.prepare('SELECT * FROM download_logs WHERE id = ?');
  return stmt.get(id);
}

export function getUserByUsername(username: string) {
  const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
  return stmt.get(username);
}

export function getUserById(id: number) {
  const stmt = db.prepare('SELECT id, username, role, created_at FROM users WHERE id = ?');
  return stmt.get(id);
}

export function getAllUsers() {
  const stmt = db.prepare('SELECT id, username, role, created_at FROM users ORDER BY username');
  return stmt.all();
}

export function createUser(username: string, password: string, role: string) {
  const bcrypt = require('bcryptjs');
  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync(password, salt);
  const stmt = db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)');
  return stmt.run(username, hash, role);
}

export function updateUserRole(id: number, role: string) {
  const stmt = db.prepare('UPDATE users SET role = ? WHERE id = ?');
  return stmt.run(role, id);
}

export function deleteUser(id: number) {
  const stmt = db.prepare('DELETE FROM users WHERE id = ?');
  return stmt.run(id);
}

export function getAllRecipes() {
  const stmt = db.prepare(`
    SELECT r.*, u.username as creator_name 
    FROM recipes r 
    LEFT JOIN users u ON r.created_by = u.id 
    ORDER BY r.updated_at DESC
  `);
  return stmt.all();
}

export function getRecipeById(id: number) {
  const stmt = db.prepare(`
    SELECT r.*, u.username as creator_name 
    FROM recipes r 
    LEFT JOIN users u ON r.created_by = u.id 
    WHERE r.id = ?
  `);
  return stmt.get(id);
}

export function createRecipe(name: string, description: string, parameters: any, createdBy: number | null) {
  const stmt = db.prepare(`
    INSERT INTO recipes (name, description, parameters, created_by) 
    VALUES (?, ?, ?, ?)
  `);
  return stmt.run(name, description, JSON.stringify(parameters), createdBy);
}

export function updateRecipe(id: number, name: string, description: string, parameters: any) {
  const stmt = db.prepare(`
    UPDATE recipes 
    SET name = ?, description = ?, parameters = ?, updated_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `);
  return stmt.run(name, description, JSON.stringify(parameters), id);
}

export function deleteRecipe(id: number) {
  const stmt = db.prepare('DELETE FROM recipes WHERE id = ?');
  return stmt.run(id);
}

export function insertAlarmLog(type: string, message: string, severity: string, temperature?: number, pressure?: number) {
  const stmt = db.prepare(`
    INSERT INTO alarm_logs (type, message, severity, temperature, pressure) 
    VALUES (?, ?, ?, ?, ?)
  `);
  return stmt.run(type, message, severity, temperature, pressure);
}

export function getAlarmLogs(startTime?: string, endTime?: string, limit: number = 1000) {
  let query = `
    SELECT a.*, u.username as acknowledged_by_name 
    FROM alarm_logs a 
    LEFT JOIN users u ON a.acknowledged_by = u.id 
  `;
  
  const params: any[] = [];
  
  if (startTime && endTime) {
    query += ' WHERE a.timestamp BETWEEN ? AND ?';
    params.push(startTime, endTime);
  }
  
  query += ' ORDER BY a.timestamp DESC LIMIT ?';
  params.push(limit);
  
  const stmt = db.prepare(query);
  return stmt.all(...params);
}

export function acknowledgeAlarm(id: number, userId: number) {
  const stmt = db.prepare(`
    UPDATE alarm_logs 
    SET acknowledged = 1, acknowledged_by = ?, acknowledged_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `);
  return stmt.run(userId, id);
}

export function acknowledgeAllAlarms(userId: number) {
  const stmt = db.prepare(`
    UPDATE alarm_logs 
    SET acknowledged = 1, acknowledged_by = ?, acknowledged_at = CURRENT_TIMESTAMP 
    WHERE acknowledged = 0
  `);
  return stmt.run(userId);
}

export function getUnacknowledgedAlarmCount() {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM alarm_logs WHERE acknowledged = 0');
  return stmt.get() as { count: number };
}

export default db;
