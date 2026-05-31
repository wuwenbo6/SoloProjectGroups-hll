const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../database/indoor_positioning.db');
const db = new sqlite3.Database(dbPath);

function initDatabase() {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS access_points (
      id TEXT PRIMARY KEY,
      bssid TEXT UNIQUE NOT NULL,
      name TEXT,
      x REAL NOT NULL,
      y REAL NOT NULL,
      z REAL NOT NULL,
      floor INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS fingerprints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bssid TEXT NOT NULL,
      distance REAL NOT NULL,
      rssi INTEGER,
      floor INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS position_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL,
      x REAL NOT NULL,
      y REAL NOT NULL,
      z REAL NOT NULL,
      floor INTEGER NOT NULL,
      accuracy REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS buildings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      floors INTEGER NOT NULL DEFAULT 5,
      floor_height REAL NOT NULL DEFAULT 3.0,
      width REAL NOT NULL DEFAULT 50,
      depth REAL NOT NULL DEFAULT 30
    )`);

    db.get("SELECT COUNT(*) as count FROM buildings", (err, row) => {
      if (row.count === 0) {
        db.run(`INSERT INTO buildings (name, floors, floor_height, width, depth) 
                VALUES ('Main Building', 5, 3.0, 50, 30)`);
      }
    });
  });
}

function getAllAPs() {
  return new Promise((resolve, reject) => {
    db.all("SELECT * FROM access_points ORDER BY floor", (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function getAPsByFloor(floor) {
  return new Promise((resolve, reject) => {
    db.all("SELECT * FROM access_points WHERE floor = ?", [floor], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function addAP(ap) {
  return new Promise((resolve, reject) => {
    const { id, bssid, name, x, y, z, floor } = ap;
    db.run(`INSERT OR REPLACE INTO access_points (id, bssid, name, x, y, z, floor)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, bssid, name, x, y, z, floor],
            function(err) {
              if (err) reject(err);
              else resolve({ ...ap, id: id || this.lastID });
            });
  });
}

function deleteAP(id) {
  return new Promise((resolve, reject) => {
    db.run("DELETE FROM access_points WHERE id = ?", [id], function(err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
}

function addPositionHistory(position) {
  return new Promise((resolve, reject) => {
    const { device_id, x, y, z, floor, accuracy } = position;
    db.run(`INSERT INTO position_history (device_id, x, y, z, floor, accuracy)
            VALUES (?, ?, ?, ?, ?, ?)`,
            [device_id, x, y, z, floor, accuracy],
            function(err) {
              if (err) reject(err);
              else resolve({ id: this.lastID, ...position, created_at: new Date().toISOString() });
            });
  });
}

function getPositionHistory(deviceId, limit = 100) {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM position_history 
            WHERE device_id = ? 
            ORDER BY created_at DESC 
            LIMIT ?`, [deviceId, limit], (err, rows) => {
      if (err) reject(err);
      else resolve(rows.reverse());
    });
  });
}

function getAllRecentPositions(limit = 50) {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM position_history 
            ORDER BY created_at DESC 
            LIMIT ?`, [limit], (err, rows) => {
      if (err) reject(err);
      else resolve(rows.reverse());
    });
  });
}

function addFingerprint(fingerprint) {
  return new Promise((resolve, reject) => {
    const { bssid, distance, rssi, floor } = fingerprint;
    db.run(`INSERT INTO fingerprints (bssid, distance, rssi, floor)
            VALUES (?, ?, ?, ?)`,
            [bssid, distance, rssi, floor],
            function(err) {
              if (err) reject(err);
              else resolve({ id: this.lastID, ...fingerprint });
            });
  });
}

function getBuilding() {
  return new Promise((resolve, reject) => {
    db.get("SELECT * FROM buildings LIMIT 1", (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function getHeatmapData(floor = null, hours = 24) {
  return new Promise((resolve, reject) => {
    let query = `
      SELECT x, y, COUNT(*) as count, AVG(accuracy) as avg_accuracy
      FROM position_history
      WHERE created_at >= datetime('now', '-${hours} hours')
    `;
    let params = [];
    
    if (floor !== null) {
      query += " AND floor = ?";
      params.push(floor);
    }
    
    query += " GROUP BY ROUND(x, 1), ROUND(y, 1) ORDER BY count DESC";
    
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function getDeviceIds() {
  return new Promise((resolve, reject) => {
    db.all("SELECT DISTINCT device_id FROM position_history ORDER BY device_id", (err, rows) => {
      if (err) reject(err);
      else resolve(rows.map(r => r.device_id));
    });
  });
}

function getPositionsByTimeRange(startTime, endTime, deviceId = null) {
  return new Promise((resolve, reject) => {
    let query = `
      SELECT * FROM position_history 
      WHERE created_at >= ? AND created_at <= ?
    `;
    let params = [startTime, endTime];
    
    if (deviceId) {
      query += " AND device_id = ?";
      params.push(deviceId);
    }
    
    query += " ORDER BY created_at ASC";
    
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

module.exports = {
  initDatabase,
  getAllAPs,
  getAPsByFloor,
  addAP,
  deleteAP,
  addPositionHistory,
  getPositionHistory,
  getAllRecentPositions,
  addFingerprint,
  getBuilding,
  getHeatmapData,
  getDeviceIds,
  getPositionsByTimeRange
};
