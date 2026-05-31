const net = require('net');
const EventEmitter = require('events');

class KalmanFilter {
  constructor(processNoise = 0.001, measurementNoise = 0.1) {
    this.x = 0;
    this.P = 1;
    this.Q = processNoise;
    this.R = measurementNoise;
    this.initialized = false;
  }

  update(measurement) {
    if (!this.initialized) {
      this.x = measurement;
      this.initialized = true;
      return this.x;
    }

    const P_pred = this.P + this.Q;
    const K = P_pred / (P_pred + this.R);
    this.x = this.x + K * (measurement - this.x);
    this.P = (1 - K) * P_pred;
    
    return this.x;
  }

  reset() {
    this.initialized = false;
    this.x = 0;
    this.P = 1;
  }
}

class MultiStateKalmanFilter {
  constructor() {
    this.latFilter = new KalmanFilter(0.001, 0.05);
    this.lonFilter = new KalmanFilter(0.001, 0.05);
    this.altFilter = new KalmanFilter(0.1, 50);
    this.velFilter = new KalmanFilter(0.1, 10);
    this.hdgFilter = new KalmanFilter(0.01, 2);
    this.vrFilter = new KalmanFilter(0.1, 20);
  }

  update(flight) {
    const result = { ...flight };
    
    if (flight.latitude !== null && !isNaN(flight.latitude)) {
      result.latitude = this.latFilter.update(flight.latitude);
    }
    if (flight.longitude !== null && !isNaN(flight.longitude)) {
      result.longitude = this.lonFilter.update(flight.longitude);
    }
    if (flight.altitude !== null && !isNaN(flight.altitude)) {
      result.altitude = Math.round(this.altFilter.update(flight.altitude));
    }
    if (flight.velocity !== null && !isNaN(flight.velocity)) {
      result.velocity = Math.round(this.velFilter.update(flight.velocity));
    }
    if (flight.heading !== null && !isNaN(flight.heading)) {
      result.heading = this.hdgFilter.update(flight.heading);
    }
    if (flight.vertical_rate !== null && !isNaN(flight.vertical_rate)) {
      result.vertical_rate = Math.round(this.vrFilter.update(flight.vertical_rate));
    }
    
    return result;
  }

  reset() {
    this.latFilter.reset();
    this.lonFilter.reset();
    this.altFilter.reset();
    this.velFilter.reset();
    this.hdgFilter.reset();
    this.vrFilter.reset();
  }
}

class TimeSynchronizer {
  constructor(maxGapMs = 10000, interpolationIntervalMs = 1000) {
    this.maxGapMs = maxGapMs;
    this.interpolationIntervalMs = interpolationIntervalMs;
    this.flightBuffers = new Map();
  }

  addPoint(icao24, flightData) {
    if (!this.flightBuffers.has(icao24)) {
      this.flightBuffers.set(icao24, []);
    }
    
    const buffer = this.flightBuffers.get(icao24);
    buffer.push(flightData);
    
    if (buffer.length > 50) {
      buffer.shift();
    }
    
    return this.interpolateIfNeeded(icao24, flightData);
  }

  interpolateIfNeeded(icao24, newPoint) {
    const buffer = this.flightBuffers.get(icao24);
    if (buffer.length < 2) return [newPoint];
    
    const prevPoint = buffer[buffer.length - 2];
    const timeGap = newPoint.timestamp - prevPoint.timestamp;
    
    if (timeGap <= this.interpolationIntervalMs) {
      return [newPoint];
    }
    
    if (timeGap > this.maxGapMs) {
      return [newPoint];
    }
    
    const interpolatedPoints = [];
    const numSteps = Math.floor(timeGap / this.interpolationIntervalMs);
    
    for (let i = 1; i <= numSteps; i++) {
      const ratio = i / (numSteps + 1);
      const interpolated = this.interpolateLinear(prevPoint, newPoint, ratio);
      interpolatedPoints.push(interpolated);
    }
    
    interpolatedPoints.push(newPoint);
    return interpolatedPoints;
  }

  interpolateLinear(point1, point2, ratio) {
    const lat1 = point1.latitude || 0;
    const lon1 = point1.longitude || 0;
    const lat2 = point2.latitude || lat1;
    const lon2 = point2.longitude || lon1;
    
    return {
      icao24: point1.icao24,
      callsign: point1.callsign || point2.callsign,
      latitude: lat1 + (lat2 - lat1) * ratio,
      longitude: lon1 + (lon2 - lon1) * ratio,
      altitude: this.interpolateValue(point1.altitude, point2.altitude, ratio),
      velocity: this.interpolateValue(point1.velocity, point2.velocity, ratio),
      heading: this.interpolateHeading(point1.heading, point2.heading, ratio),
      vertical_rate: this.interpolateValue(point1.vertical_rate, point2.vertical_rate, ratio),
      timestamp: Math.round(point1.timestamp + (point2.timestamp - point1.timestamp) * ratio),
      interpolated: true
    };
  }

  interpolateValue(val1, val2, ratio) {
    if (val1 === null || val1 === undefined || isNaN(val1)) return val2;
    if (val2 === null || val2 === undefined || isNaN(val2)) return val1;
    return Math.round(val1 + (val2 - val1) * ratio);
  }

  interpolateHeading(hdg1, hdg2, ratio) {
    if (hdg1 === null || hdg1 === undefined || isNaN(hdg1)) return hdg2;
    if (hdg2 === null || hdg2 === undefined || isNaN(hdg2)) return hdg1;
    
    let diff = hdg2 - hdg1;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    
    let result = hdg1 + diff * ratio;
    if (result < 0) result += 360;
    if (result >= 360) result -= 360;
    
    return result;
  }

  clearOldData(maxAgeMs = 300000) {
    const now = Date.now();
    for (const [icao24, buffer] of this.flightBuffers.entries()) {
      const filtered = buffer.filter(p => now - p.timestamp < maxAgeMs);
      if (filtered.length === 0) {
        this.flightBuffers.delete(icao24);
      } else {
        this.flightBuffers.set(icao24, filtered);
      }
    }
  }
}

class ADSBReceiver extends EventEmitter {
  constructor(database) {
    super();
    this.database = database;
    this.client = null;
    this.buffer = '';
    this.flights = new Map();
    this.kalmanFilters = new Map();
    this.timeSynchronizer = new TimeSynchronizer(15000, 500);
    this.isConnected = false;
    this.lastPositionUpdate = new Map();
    
    setInterval(() => {
      this.timeSynchronizer.clearOldData();
      this.cleanupOldFlights();
    }, 60000);
  }

  start(host = 'localhost', port = 30003) {
    if (this.client) {
      this.stop();
    }

    this.client = net.connect(port, host, () => {
      console.log(`Connected to dump1090 at ${host}:${port}`);
      this.isConnected = true;
    });

    this.client.on('data', (data) => {
      this.buffer += data.toString();
      this.processBuffer();
    });

    this.client.on('error', (err) => {
      console.error('Connection error:', err.message);
      this.isConnected = false;
    });

    this.client.on('close', () => {
      console.log('Connection closed');
      this.isConnected = false;
    });
  }

  stop() {
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }
    this.isConnected = false;
  }

  processBuffer() {
    let lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (let line of lines) {
      line = line.trim();
      if (line) {
        this.parseSBS1Message(line);
      }
    }
  }

  parseSBS1Message(line) {
    const parts = line.split(',');
    if (parts.length < 22) return;

    const transmissionType = parseInt(parts[1]);
    const icao24 = parts[4];
    const timestamp = this.parseTimestamp(parts[6], parts[7]);

    if (!icao24) return;

    let flight = this.flights.get(icao24) || {
      icao24,
      callsign: null,
      latitude: null,
      longitude: null,
      altitude: null,
      velocity: null,
      heading: null,
      vertical_rate: null,
      timestamp: timestamp
    };

    let hasPositionUpdate = false;

    switch (transmissionType) {
      case 1:
        flight.callsign = parts[10] ? parts[10].trim() : null;
        break;
      case 3:
        flight.altitude = parts[11] ? parseInt(parts[11]) : null;
        const lat = parts[14] ? parseFloat(parts[14]) : null;
        const lon = parts[15] ? parseFloat(parts[15]) : null;
        
        if (lat !== null && lon !== null && !isNaN(lat) && !isNaN(lon)) {
          if (this.isValidPosition(lat, lon, icao24)) {
            flight.latitude = lat;
            flight.longitude = lon;
            hasPositionUpdate = true;
          }
        }
        break;
      case 4:
        flight.velocity = parts[12] ? parseFloat(parts[12]) : null;
        flight.heading = parts[13] ? parseFloat(parts[13]) : null;
        flight.vertical_rate = parts[16] ? parseInt(parts[16]) : null;
        break;
    }

    flight.timestamp = timestamp;
    
    if (hasPositionUpdate && flight.latitude !== null && flight.longitude !== null) {
      if (!this.kalmanFilters.has(icao24)) {
        this.kalmanFilters.set(icao24, new MultiStateKalmanFilter());
      }
      
      const kalmanFilter = this.kalmanFilters.get(icao24);
      const filteredFlight = kalmanFilter.update(flight);
      
      const synchronizedPoints = this.timeSynchronizer.addPoint(icao24, filteredFlight);
      
      for (const point of synchronizedPoints) {
        this.flights.set(icao24, { ...point });
        this.database.insertFlight(point);
        this.emit('flightUpdate', point);
      }
      
      this.lastPositionUpdate.set(icao24, Date.now());
    } else {
      this.flights.set(icao24, flight);
    }
  }

  isValidPosition(lat, lon, icao24) {
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return false;
    }
    
    const lastUpdate = this.lastPositionUpdate.get(icao24);
    if (!lastUpdate) return true;
    
    const timeSinceLastUpdate = Date.now() - lastUpdate;
    if (timeSinceLastUpdate < 1000) return true;
    
    const existingFlight = this.flights.get(icao24);
    if (existingFlight && existingFlight.latitude !== null && existingFlight.velocity !== null) {
      const distance = this.haversineDistance(
        existingFlight.latitude, existingFlight.longitude,
        lat, lon
      );
      
      const maxPossibleDistance = (existingFlight.velocity * 1.852) * (timeSinceLastUpdate / 3600000) * 2;
      
      if (distance > maxPossibleDistance + 50) {
        console.log(`Position jump detected for ${icao24}: ${distance.toFixed(2)}km, max expected: ${maxPossibleDistance.toFixed(2)}km`);
        return false;
      }
    }
    
    return true;
  }

  haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  parseTimestamp(dateStr, timeStr) {
    if (!dateStr || !timeStr) return Date.now();
    const dateTimeStr = `${dateStr} ${timeStr}`;
    const parsed = Date.parse(dateTimeStr);
    return isNaN(parsed) ? Date.now() : parsed;
  }

  cleanupOldFlights() {
    const now = Date.now();
    const timeout = 300000;
    
    for (const [icao24, lastTime] of this.lastPositionUpdate.entries()) {
      if (now - lastTime > timeout) {
        this.flights.delete(icao24);
        this.kalmanFilters.delete(icao24);
        this.lastPositionUpdate.delete(icao24);
      }
    }
  }

  getActiveFlights() {
    return Array.from(this.flights.values());
  }
}

module.exports = ADSBReceiver;
