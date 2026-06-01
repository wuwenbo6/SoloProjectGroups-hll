const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

class GNSSDatabase {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = new Database(dbPath);
    this.initTables();
  }

  initTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS satellites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        prn INTEGER UNIQUE NOT NULL,
        system TEXT NOT NULL,
        azimuth REAL,
        elevation REAL,
        snr REAL,
        pseudorange REAL,
        carrier_frequency REAL,
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'active'
      );

      CREATE TABLE IF NOT EXISTS ephemeris (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        satellite_prn INTEGER NOT NULL,
        toe REAL,
        sqrt_a REAL,
        e REAL,
        i0 REAL,
        omega0 REAL,
        omega REAL,
        m0 REAL,
        delta_n REAL,
        i_dot REAL,
        omega_dot REAL,
        cuc REAL,
        cus REAL,
        crc REAL,
        crs REAL,
        cic REAL,
        cis REAL,
        week INTEGER,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (satellite_prn) REFERENCES satellites(prn) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS signal_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        satellite_prn INTEGER NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        snr REAL,
        pseudorange REAL,
        pseudorange_rate REAL,
        cn0 REAL,
        lock_time REAL,
        FOREIGN KEY (satellite_prn) REFERENCES satellites(prn) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS anomalies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        type TEXT NOT NULL,
        severity TEXT NOT NULL,
        satellite_prn INTEGER,
        description TEXT NOT NULL,
        value_before REAL,
        value_after REAL,
        threshold REAL,
        acknowledged BOOLEAN DEFAULT 0,
        acknowledged_at TIMESTAMP,
        FOREIGN KEY (satellite_prn) REFERENCES satellites(prn) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS system_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        level TEXT NOT NULL,
        module TEXT NOT NULL,
        message TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_signal_history_timestamp ON signal_history(timestamp);
      CREATE INDEX IF NOT EXISTS idx_anomalies_timestamp ON anomalies(timestamp);
      CREATE INDEX IF NOT EXISTS idx_anomalies_acknowledged ON anomalies(acknowledged);
    `);
  }

  insertSatellite(data) {
    const stmt = this.db.prepare(`
      INSERT INTO satellites (prn, system, azimuth, elevation, snr, pseudorange, carrier_frequency, last_seen, status)
      VALUES (@prn, @system, @azimuth, @elevation, @snr, @pseudorange, @carrier_frequency, CURRENT_TIMESTAMP, 'active')
      ON CONFLICT(prn) DO UPDATE SET
        azimuth = excluded.azimuth,
        elevation = excluded.elevation,
        snr = excluded.snr,
        pseudorange = excluded.pseudorange,
        carrier_frequency = excluded.carrier_frequency,
        last_seen = CURRENT_TIMESTAMP,
        status = 'active'
    `);
    return stmt.run(data);
  }

  insertSignalHistory(data) {
    const stmt = this.db.prepare(`
      INSERT INTO signal_history (satellite_prn, snr, pseudorange, pseudorange_rate, cn0, lock_time)
      VALUES (@satellite_prn, @snr, @pseudorange, @pseudorange_rate, @cn0, @lock_time)
    `);
    return stmt.run(data);
  }

  insertEphemeris(data) {
    const stmt = this.db.prepare(`
      INSERT INTO ephemeris (
        satellite_prn, toe, sqrt_a, e, i0, omega0, omega, m0, delta_n,
        i_dot, omega_dot, cuc, cus, crc, crs, cic, cis, week
      ) VALUES (
        @satellite_prn, @toe, @sqrt_a, @e, @i0, @omega0, @omega, @m0, @delta_n,
        @i_dot, @omega_dot, @cuc, @cus, @crc, @crs, @cic, @cis, @week
      )
    `);
    return stmt.run(data);
  }

  insertAnomaly(data) {
    const stmt = this.db.prepare(`
      INSERT INTO anomalies (type, severity, satellite_prn, description, value_before, value_after, threshold)
      VALUES (@type, @severity, @satellite_prn, @description, @value_before, @value_after, @threshold)
    `);
    const result = stmt.run(data);
    this.log('warning', 'detection', `Anomaly detected: ${data.type} - ${data.description}`);
    return result;
  }

  getSatellites() {
    return this.db.prepare(`
      SELECT * FROM satellites ORDER BY prn
    `).all();
  }

  getAnomalies(filter = {}) {
    let query = 'SELECT * FROM anomalies';
    const params = [];
    const conditions = [];

    if (filter.startTime) {
      conditions.push('timestamp >= ?');
      params.push(filter.startTime);
    }
    if (filter.endTime) {
      conditions.push('timestamp <= ?');
      params.push(filter.endTime);
    }
    if (filter.type) {
      conditions.push('type = ?');
      params.push(filter.type);
    }
    if (filter.acknowledged !== undefined) {
      conditions.push('acknowledged = ?');
      params.push(filter.acknowledged ? 1 : 0);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY timestamp DESC LIMIT 1000';

    return this.db.prepare(query).all(...params);
  }

  getSignalHistory(satellitePrn, limit = 1000) {
    return this.db.prepare(`
      SELECT * FROM signal_history 
      WHERE satellite_prn = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `).all(satellitePrn, limit);
  }

  getEphemeris(satellitePrn) {
    return this.db.prepare(`
      SELECT * FROM ephemeris 
      WHERE satellite_prn = ? 
      ORDER BY timestamp DESC 
      LIMIT 1
    `).get(satellitePrn);
  }

  acknowledgeAnomaly(anomalyId) {
    return this.db.prepare(`
      UPDATE anomalies 
      SET acknowledged = 1, acknowledged_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(anomalyId);
  }

  getAnomalyCount() {
    return this.db.prepare(`
      SELECT COUNT(*) as count FROM anomalies WHERE acknowledged = 0
    `).get().count;
  }

  log(level, module, message) {
    const stmt = this.db.prepare(`
      INSERT INTO system_logs (level, module, message)
      VALUES (?, ?, ?)
    `);
    return stmt.run(level, module, message);
  }

  exportData(options) {
    const exportObj = {
      exportTime: new Date().toISOString(),
      satellites: this.getSatellites(),
      anomalies: this.getAnomalies(options.filter)
    };

    if (options.includeHistory) {
      exportObj.signalHistory = {};
      for (const sat of exportObj.satellites) {
        exportObj.signalHistory[sat.prn] = this.getSignalHistory(sat.prn, 500);
      }
    }

    const exportPath = path.join(require('os').homedir(), 'gnss_export_' + Date.now() + '.json');
    fs.writeFileSync(exportPath, JSON.stringify(exportObj, null, 2));
    return exportPath;
  }

  isConnected() {
    return this.db !== null && this.db.open;
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

module.exports = GNSSDatabase;