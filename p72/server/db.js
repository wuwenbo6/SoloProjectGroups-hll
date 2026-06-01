const sqlite3 = require('sqlite3').verbose();
const config = require('../config');
const path = require('path');

class FirmwareDB {
  constructor() {
    this.db = new sqlite3.Database(config.dbPath);
    this.init();
  }

  init() {
    const sql = `
      CREATE TABLE IF NOT EXISTS devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT UNIQUE NOT NULL,
        name TEXT,
        current_version TEXT,
        previous_version TEXT,
        status TEXT DEFAULT 'offline',
        last_seen INTEGER,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      );

      CREATE TABLE IF NOT EXISTS firmware (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version TEXT NOT NULL,
        name TEXT NOT NULL,
        filename TEXT NOT NULL,
        size INTEGER NOT NULL,
        checksum TEXT NOT NULL,
        block_count INTEGER NOT NULL,
        description TEXT,
        is_delta INTEGER DEFAULT 0,
        base_firmware_id INTEGER,
        delta_checksum TEXT,
        delta_size INTEGER,
        delta_block_count INTEGER,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      );

      CREATE TABLE IF NOT EXISTS upgrade_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT NOT NULL,
        firmware_id INTEGER NOT NULL,
        status TEXT DEFAULT 'pending',
        current_block INTEGER DEFAULT 0,
        total_blocks INTEGER NOT NULL,
        started_at INTEGER,
        completed_at INTEGER,
        error_message TEXT,
        rollback_attempted INTEGER DEFAULT 0,
        previous_version TEXT,
        FOREIGN KEY (device_id) REFERENCES devices(device_id),
        FOREIGN KEY (firmware_id) REFERENCES firmware(id)
      );

      CREATE INDEX IF NOT EXISTS idx_device_id ON upgrade_records(device_id);
      CREATE INDEX IF NOT EXISTS idx_firmware_id ON upgrade_records(firmware_id);
    `;
    
    this.db.exec(sql);
  }

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async registerDevice(deviceId, name = '') {
    const now = Math.floor(Date.now() / 1000);
    const existing = await this.get('SELECT * FROM devices WHERE device_id = ?', [deviceId]);
    
    if (existing) {
      await this.run(
        'UPDATE devices SET name = ?, last_seen = ?, status = ? WHERE device_id = ?',
        [name || existing.name, now, 'online', deviceId]
      );
      return { lastID: existing.id };
    } else {
      return await this.run(
        'INSERT INTO devices (device_id, name, last_seen, status) VALUES (?, ?, ?, ?)',
        [deviceId, name, now, 'online']
      );
    }
  }

  async updateDeviceStatus(deviceId, status, version = null) {
    const now = Math.floor(Date.now() / 1000);
    if (version) {
      return await this.run(
        'UPDATE devices SET status = ?, last_seen = ?, current_version = ? WHERE device_id = ?',
        [status, now, version, deviceId]
      );
    } else {
      return await this.run(
        'UPDATE devices SET status = ?, last_seen = ? WHERE device_id = ?',
        [status, now, deviceId]
      );
    }
  }

  async getDevice(deviceId) {
    return await this.get('SELECT * FROM devices WHERE device_id = ?', [deviceId]);
  }

  async getAllDevices() {
    return await this.all('SELECT * FROM devices ORDER BY last_seen DESC');
  }

  async addFirmware(version, name, filename, size, checksum, blockCount, description = '') {
    return await this.run(
      'INSERT INTO firmware (version, name, filename, size, checksum, block_count, description) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [version, name, filename, size, checksum, blockCount, description]
    );
  }

  async getFirmware(id) {
    return await this.get('SELECT * FROM firmware WHERE id = ?', [id]);
  }

  async getLatestFirmware() {
    return await this.get('SELECT * FROM firmware ORDER BY created_at DESC LIMIT 1');
  }

  async getAllFirmware() {
    return await this.all('SELECT * FROM firmware ORDER BY created_at DESC');
  }

  async startUpgrade(deviceId, firmwareId, useDelta = false) {
    const firmware = await this.getFirmware(firmwareId);
    if (!firmware) return null;

    const device = await this.getDevice(deviceId);
    const previousVersion = device ? device.current_version : null;
    
    const totalBlocks = useDelta && firmware.is_delta 
      ? firmware.delta_block_count 
      : firmware.block_count;

    const now = Math.floor(Date.now() / 1000);
    const result = await this.run(
      'INSERT INTO upgrade_records (device_id, firmware_id, total_blocks, started_at, status, previous_version) VALUES (?, ?, ?, ?, ?, ?)',
      [deviceId, firmwareId, totalBlocks, now, 'in_progress', previousVersion]
    );
    
    return { 
      id: result.lastID, 
      totalBlocks,
      isDelta: useDelta && firmware.is_delta,
      previousVersion
    };
  }

  async recordRollback(recordId, success, errorMessage = null) {
    await this.run(
      'UPDATE upgrade_records SET rollback_attempted = 1, status = ? WHERE id = ?',
      [success ? 'rolled_back' : 'rollback_failed', recordId]
    );
    
    const record = await this.getUpgradeRecord(recordId);
    if (record && record.previous_version) {
      await this.run(
        'UPDATE devices SET current_version = ?, status = ? WHERE device_id = ?',
        [record.previous_version, success ? 'online' : 'error', record.device_id]
      );
    }
  }

  async updateUpgradeProgress(recordId, currentBlock) {
    return await this.run(
      'UPDATE upgrade_records SET current_block = ? WHERE id = ?',
      [currentBlock, recordId]
    );
  }

  async completeUpgrade(recordId, success, errorMessage = null) {
    const now = Math.floor(Date.now() / 1000);
    const status = success ? 'completed' : 'failed';
    return await this.run(
      'UPDATE upgrade_records SET status = ?, completed_at = ?, error_message = ? WHERE id = ?',
      [status, now, errorMessage, recordId]
    );
  }

  async getUpgradeRecord(recordId) {
    return await this.get('SELECT * FROM upgrade_records WHERE id = ?', [recordId]);
  }

  async getDeviceUpgradeHistory(deviceId) {
    return await this.all(`
      SELECT ur.*, f.version as firmware_version, f.name as firmware_name
      FROM upgrade_records ur
      JOIN firmware f ON ur.firmware_id = f.id
      WHERE ur.device_id = ?
      ORDER BY ur.started_at DESC
    `, [deviceId]);
  }

  async getActiveUpgrade(deviceId) {
    return await this.get(`
      SELECT * FROM upgrade_records 
      WHERE device_id = ? AND status = 'in_progress'
      ORDER BY started_at DESC LIMIT 1
    `, [deviceId]);
  }

  async getFirmwareByVersion(version) {
    return await this.get('SELECT * FROM firmware WHERE version = ?', [version]);
  }

  async addDeltaFirmware(baseFirmwareId, targetFirmwareId, deltaFilename, deltaSize, deltaChecksum, deltaBlockCount) {
    return await this.run(`
      UPDATE firmware 
      SET is_delta = 1, base_firmware_id = ?, delta_checksum = ?, delta_size = ?, delta_block_count = ?
      WHERE id = ?
    `, [baseFirmwareId, deltaChecksum, deltaSize, deltaBlockCount, targetFirmwareId]);
  }

  async getUpgradeStatistics() {
    const total = await this.get('SELECT COUNT(*) as count FROM upgrade_records');
    const completed = await this.get("SELECT COUNT(*) as count FROM upgrade_records WHERE status = 'completed'");
    const failed = await this.get("SELECT COUNT(*) as count FROM upgrade_records WHERE status = 'failed'");
    const rolledBack = await this.get("SELECT COUNT(*) as count FROM upgrade_records WHERE status = 'rolled_back'");
    const inProgress = await this.get("SELECT COUNT(*) as count FROM upgrade_records WHERE status = 'in_progress'");
    
    const avgTime = await this.get(`
      SELECT AVG(completed_at - started_at) as avg_time 
      FROM upgrade_records 
      WHERE status = 'completed' AND completed_at IS NOT NULL
    `);

    return {
      total: total.count,
      completed: completed.count,
      failed: failed.count,
      rolledBack: rolledBack.count,
      inProgress: inProgress.count,
      successRate: total.count > 0 ? Math.round((completed.count / total.count) * 100) : 0,
      avgDuration: avgTime.avg_time ? Math.round(avgTime.avg_time) : 0
    };
  }

  async getAllUpgradeRecords(limit = 1000) {
    return await this.all(`
      SELECT ur.*, f.version as firmware_version, f.name as firmware_name, d.name as device_name
      FROM upgrade_records ur
      JOIN firmware f ON ur.firmware_id = f.id
      LEFT JOIN devices d ON ur.device_id = d.device_id
      ORDER BY ur.started_at DESC
      LIMIT ?
    `, [limit]);
  }

  close() {
    this.db.close();
  }
}

module.exports = FirmwareDB;
