const Database = require('better-sqlite3');

class FlightDatabase {
  constructor(dbPath) {
    this.db = new Database(dbPath);
    this.initTables();
  }

  initTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS flights (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        icao24 TEXT NOT NULL,
        callsign TEXT,
        latitude REAL,
        longitude REAL,
        altitude REAL,
        velocity REAL,
        heading REAL,
        vertical_rate REAL,
        timestamp INTEGER NOT NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_flights_icao24 ON flights(icao24);
      CREATE INDEX IF NOT EXISTS idx_flights_timestamp ON flights(timestamp);
      CREATE INDEX IF NOT EXISTS idx_flights_callsign ON flights(callsign);
    `);
  }

  insertFlight(flightData) {
    const stmt = this.db.prepare(`
      INSERT INTO flights 
      (icao24, callsign, latitude, longitude, altitude, velocity, heading, vertical_rate, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    return stmt.run(
      flightData.icao24,
      flightData.callsign || null,
      flightData.latitude,
      flightData.longitude,
      flightData.altitude,
      flightData.velocity,
      flightData.heading,
      flightData.vertical_rate,
      flightData.timestamp
    );
  }

  getHistoricalFlights(startTime, endTime) {
    const stmt = this.db.prepare(`
      SELECT DISTINCT icao24, callsign, 
             MIN(latitude) as min_lat, MAX(latitude) as max_lat,
             MIN(longitude) as min_lon, MAX(longitude) as max_lon,
             MIN(timestamp) as first_seen, MAX(timestamp) as last_seen
      FROM flights 
      WHERE timestamp BETWEEN ? AND ?
      GROUP BY icao24, callsign
      ORDER BY last_seen DESC
    `);
    return stmt.all(startTime, endTime);
  }

  getFlightHistory(icao24) {
    const stmt = this.db.prepare(`
      SELECT * FROM flights 
      WHERE icao24 = ? 
      ORDER BY timestamp ASC
    `);
    return stmt.all(icao24);
  }

  getAllFlights() {
    const stmt = this.db.prepare(`
      SELECT DISTINCT icao24, callsign,
             FIRST_VALUE(latitude) OVER (PARTITION BY icao24 ORDER BY timestamp DESC) as last_lat,
             FIRST_VALUE(longitude) OVER (PARTITION BY icao24 ORDER BY timestamp DESC) as last_lon,
             FIRST_VALUE(altitude) OVER (PARTITION BY icao24 ORDER BY timestamp DESC) as last_altitude,
             FIRST_VALUE(velocity) OVER (PARTITION BY icao24 ORDER BY timestamp DESC) as last_velocity,
             MAX(timestamp) OVER (PARTITION BY icao24) as last_seen
      FROM flights
      ORDER BY last_seen DESC
    `);
    return stmt.all();
  }

  close() {
    this.db.close();
  }
}

module.exports = FlightDatabase;
