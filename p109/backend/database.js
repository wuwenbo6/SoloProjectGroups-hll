const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'positioning.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS beacons (
      id TEXT PRIMARY KEY,
      mac_address TEXT UNIQUE NOT NULL,
      name TEXT,
      x REAL,
      y REAL,
      floor INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS fingerprints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location_x REAL NOT NULL,
      location_y REAL NOT NULL,
      floor INTEGER DEFAULT 1,
      beacon_id TEXT NOT NULL,
      rssi_mean REAL NOT NULL,
      rssi_std REAL NOT NULL,
      sample_count INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (beacon_id) REFERENCES beacons(id),
      UNIQUE(location_x, location_y, floor, beacon_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS trajectories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tag_id TEXT NOT NULL,
      x REAL NOT NULL,
      y REAL NOT NULL,
      floor INTEGER DEFAULT 1,
      confidence REAL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS raw_rssi_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tag_id TEXT NOT NULL,
      beacon_mac TEXT NOT NULL,
      rssi INTEGER NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const beacons = [
    { id: 'beacon_1', mac: 'AA:BB:CC:DD:EE:01', name: 'Beacon A', x: 0, y: 0, floor: 1 },
    { id: 'beacon_2', mac: 'AA:BB:CC:DD:EE:02', name: 'Beacon B', x: 10, y: 0, floor: 1 },
    { id: 'beacon_3', mac: 'AA:BB:CC:DD:EE:03', name: 'Beacon C', x: 0, y: 10, floor: 1 },
    { id: 'beacon_4', mac: 'AA:BB:CC:DD:EE:04', name: 'Beacon D', x: 10, y: 10, floor: 1 },
  ];

  const stmt = db.prepare('INSERT OR IGNORE INTO beacons (id, mac_address, name, x, y, floor) VALUES (?, ?, ?, ?, ?, ?)');
  beacons.forEach(b => stmt.run(b.id, b.mac, b.name, b.x, b.y, b.floor));
  stmt.finalize();

  console.log('Database initialized successfully');
});

module.exports = db;