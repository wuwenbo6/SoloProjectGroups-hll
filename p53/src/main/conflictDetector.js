const EventEmitter = require('events');

class ConflictDetector extends EventEmitter {
  constructor(options = {}) {
    super();
    this.horizontalWarningThreshold = options.horizontalWarningThreshold || 5;
    this.horizontalAlertThreshold = options.horizontalAlertThreshold || 2;
    this.verticalWarningThreshold = options.verticalWarningThreshold || 1000;
    this.verticalAlertThreshold = options.verticalAlertThreshold || 500;
    this.timeWarningThreshold = options.timeWarningThreshold || 120;
    this.timeAlertThreshold = options.timeAlertThreshold || 60;
    
    this.activeConflicts = new Map();
    this.activeFlights = new Map();
    this.checkInterval = null;
  }

  start(intervalMs = 5000) {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    this.checkInterval = setInterval(() => this.checkConflicts(), intervalMs);
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  updateFlight(flight) {
    if (flight.latitude && flight.longitude && flight.altitude !== null) {
      this.activeFlights.set(flight.icao24, {
        ...flight,
        lastUpdate: Date.now()
      });
    }
  }

  removeFlight(icao24) {
    this.activeFlights.delete(icao24);
  }

  checkConflicts() {
    const now = Date.now();
    const flights = Array.from(this.activeFlights.values()).filter(f => now - f.lastUpdate < 30000);
    
    for (let i = 0; i < flights.length; i++) {
      for (let j = i + 1; j < flights.length; j++) {
        this.checkPairConflict(flights[i], flights[j]);
      }
    }
    
    this.cleanupOldConflicts();
  }

  checkPairConflict(flight1, flight2) {
    const conflictId = [flight1.icao24, flight2.icao24].sort().join('-');
    
    const horizontalDistance = this.haversineDistance(
      flight1.latitude, flight1.longitude,
      flight2.latitude, flight2.longitude
    );
    
    const verticalDistance = Math.abs(flight1.altitude - flight2.altitude);
    
    const timeToClosest = this.calculateTimeToClosest(flight1, flight2, horizontalDistance);
    
    const conflict = {
      id: conflictId,
      flight1: { icao24: flight1.icao24, callsign: flight1.callsign },
      flight2: { icao24: flight2.icao24, callsign: flight2.callsign },
      horizontalDistance,
      verticalDistance,
      timeToClosest,
      level: this.getConflictLevel(horizontalDistance, verticalDistance, timeToClosest),
      timestamp: Date.now()
    };
    
    const existingConflict = this.activeConflicts.get(conflictId);
    
    if (conflict.level !== 'safe') {
      this.activeConflicts.set(conflictId, conflict);
      
      if (!existingConflict || existingConflict.level !== conflict.level) {
        this.emit('conflict', conflict);
      }
    } else if (existingConflict) {
      this.activeConflicts.delete(conflictId);
      this.emit('conflictResolved', conflictId);
    }
  }

  getConflictLevel(horizontalDist, verticalDist, timeToClosest) {
    const horizontalAlert = horizontalDist <= this.horizontalAlertThreshold;
    const horizontalWarning = horizontalDist <= this.horizontalWarningThreshold;
    const verticalAlert = verticalDist <= this.verticalAlertThreshold;
    const verticalWarning = verticalDist <= this.verticalWarningThreshold;
    const timeAlert = timeToClosest !== null && timeToClosest <= this.timeAlertThreshold;
    const timeWarning = timeToClosest !== null && timeToClosest <= this.timeWarningThreshold;
    
    if ((horizontalAlert && verticalAlert) || timeAlert) {
      return 'alert';
    } else if ((horizontalWarning && verticalWarning) || timeWarning) {
      return 'warning';
    }
    
    return 'safe';
  }

  calculateTimeToClosest(flight1, flight2, currentDistance) {
    if (!flight1.velocity || !flight2.velocity || !flight1.heading || !flight2.heading) {
      return null;
    }
    
    const v1 = flight1.velocity * 1.852 / 3600;
    const v2 = flight2.velocity * 1.852 / 3600;
    
    const h1 = flight1.heading * Math.PI / 180;
    const h2 = flight2.heading * Math.PI / 180;
    
    const vx1 = v1 * Math.sin(h1);
    const vy1 = v1 * Math.cos(h1);
    const vx2 = v2 * Math.sin(h2);
    const vy2 = v2 * Math.cos(h2);
    
    const relVx = vx2 - vx1;
    const relVy = vy2 - vy1;
    
    const relSpeed = Math.sqrt(relVx * relVx + relVy * relVy);
    
    if (relSpeed < 0.001) return null;
    
    const timeToClosest = (currentDistance / relSpeed) / 1000;
    
    return timeToClosest > 0 ? timeToClosest : null;
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

  cleanupOldConflicts() {
    const now = Date.now();
    for (const [id, conflict] of this.activeConflicts.entries()) {
      if (now - conflict.timestamp > 60000) {
        this.activeConflicts.delete(id);
      }
    }
  }

  getActiveConflicts() {
    return Array.from(this.activeConflicts.values());
  }

  cleanupOldFlights() {
    const now = Date.now();
    const timeout = 300000;
    
    for (const [icao24, flight] of this.activeFlights.entries()) {
      if (now - flight.lastUpdate > timeout) {
        this.activeFlights.delete(icao24);
      }
    }
  }
}

module.exports = ConflictDetector;
