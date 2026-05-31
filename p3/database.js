const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'df_system.db');
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    emitter_lat REAL,
    emitter_lng REAL,
    probability REAL,
    ellipse_major REAL,
    ellipse_minor REAL,
    ellipse_orientation REAL,
    power REAL,
    terrain_factor REAL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS station_readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    history_id INTEGER,
    station_id TEXT,
    station_lat REAL,
    station_lng REAL,
    azimuth REAL,
    error REAL,
    FOREIGN KEY (history_id) REFERENCES history(id)
  )
`);

function saveHistory(data) {
  const stmt = db.prepare(`
    INSERT INTO history (
      emitter_lat, emitter_lng, probability,
      ellipse_major, ellipse_minor, ellipse_orientation,
      power, terrain_factor
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    data.emitterLat, data.emitterLng, data.probability,
    data.ellipseMajor, data.ellipseMinor, data.ellipseOrientation,
    data.power, data.terrainFactor
  );
  
  const historyId = result.lastInsertRowid;
  
  const readingStmt = db.prepare(`
    INSERT INTO station_readings (
      history_id, station_id, station_lat, station_lng, azimuth, error
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  data.stations.forEach(station => {
    readingStmt.run(
      historyId, station.id, station.lat, station.lng,
      station.azimuth, station.error
    );
  });
  
  return historyId;
}

function getHistory(limit = 50) {
  const history = db.prepare(`
    SELECT * FROM history ORDER BY timestamp DESC LIMIT ?
  `).all(limit);
  
  const readingsStmt = db.prepare(`
    SELECT * FROM station_readings WHERE history_id = ?
  `);
  
  history.forEach(record => {
    record.stations = readingsStmt.all(record.id);
  });
  
  return history;
}

function getHistoryById(id) {
  const record = db.prepare(`
    SELECT * FROM history WHERE id = ?
  `).get(id);
  
  if (record) {
    record.stations = db.prepare(`
      SELECT * FROM station_readings WHERE history_id = ?
    `).all(id);
  }
  
  return record;
}

module.exports = {
  saveHistory,
  getHistory,
  getHistoryById
};
