const math = require('mathjs');
const db = require('./database');

class RSSIPreprocessor {
  constructor(windowSize = 5) {
    this.windowSize = windowSize;
    this.rssiHistory = new Map();
  }

  process(tagId, beaconMac, rssi) {
    const key = `${tagId}_${beaconMac}`;
    if (!this.rssiHistory.has(key)) {
      this.rssiHistory.set(key, []);
    }
    
    const history = this.rssiHistory.get(key);
    history.push({ rssi, timestamp: Date.now() });
    
    if (history.length > this.windowSize) {
      history.shift();
    }
    
    return history;
  }

  movingAverage(tagId, beaconMac, rssi) {
    const history = this.process(tagId, beaconMac, rssi);
    if (history.length === 0) return rssi;
    
    const values = history.map(h => h.rssi);
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  medianFilter(tagId, beaconMac, rssi) {
    const history = this.process(tagId, beaconMac, rssi);
    if (history.length < 3) return rssi;
    
    const values = history.map(h => h.rssi).sort((a, b) => a - b);
    const mid = Math.floor(values.length / 2);
    return values[mid];
  }

  removeOutliers(tagId, beaconMac, rssi, threshold = 2) {
    const history = this.process(tagId, beaconMac, rssi);
    if (history.length < 4) return rssi;
    
    const values = history.map(h => h.rssi);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const std = Math.sqrt(values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length);
    
    if (Math.abs(rssi - mean) > threshold * std) {
      return mean;
    }
    return rssi;
  }

  processBatch(tagId, rssiData, method = 'ma') {
    return rssiData.map(meas => {
      let processedRSSI;
      switch (method) {
        case 'median':
          processedRSSI = this.medianFilter(tagId, meas.beaconMac, meas.rssi);
          break;
        case 'outlier':
          processedRSSI = this.removeOutliers(tagId, meas.beaconMac, meas.rssi);
          break;
        default:
          processedRSSI = this.movingAverage(tagId, meas.beaconMac, meas.rssi);
      }
      return { ...meas, rssi: processedRSSI };
    });
  }

  cleanOldData(maxAge = 30000) {
    const now = Date.now();
    this.rssiHistory.forEach((history, key) => {
      const filtered = history.filter(h => now - h.timestamp < maxAge);
      if (filtered.length === 0) {
        this.rssiHistory.delete(key);
      } else if (filtered.length < history.length) {
        this.rssiHistory.set(key, filtered);
      }
    });
  }
}

class KalmanFilter {
  constructor(processNoise = 0.01, measurementNoise = 0.1) {
    this.x = 0;
    this.P = 1;
    this.Q = processNoise;
    this.R = measurementNoise;
  }

  predict() {
    this.P = this.P + this.Q;
  }

  update(measurement) {
    const K = this.P / (this.P + this.R);
    this.x = this.x + K * (measurement - this.x);
    this.P = (1 - K) * this.P;
    return this.x;
  }

  filter(measurement) {
    this.predict();
    return this.update(measurement);
  }
}

class MultiVarKalmanFilter {
  constructor(dimensions = 2, processNoise = 0.01, measurementNoise = 0.1) {
    this.dim = dimensions;
    this.x = math.zeros(dimensions, 1);
    this.P = math.multiply(math.identity(dimensions), 1);
    this.Q = math.multiply(math.identity(dimensions), processNoise);
    this.R = math.multiply(math.identity(dimensions), measurementNoise);
    this.H = math.identity(dimensions);
    this.initialized = false;
  }

  predict() {
    this.P = math.add(this.P, this.Q);
  }

  update(measurement) {
    const z = math.matrix(measurement.map(v => [v]));
    
    if (!this.initialized) {
      this.x = z;
      this.initialized = true;
      return measurement;
    }

    const y = math.subtract(z, math.multiply(this.H, this.x));
    const S = math.add(math.multiply(math.multiply(this.H, this.P), math.transpose(this.H)), this.R);
    const K = math.multiply(math.multiply(this.P, math.transpose(this.H)), math.inv(S));
    
    this.x = math.add(this.x, math.multiply(K, y));
    const I = math.identity(this.dim);
    this.P = math.multiply(math.subtract(I, math.multiply(K, this.H)), this.P);

    return math.flatten(this.x).toArray();
  }

  filter(measurement) {
    this.predict();
    return this.update(measurement);
  }
}

class FingerprintInterpolator {
  constructor(fingerprints) {
    this.fingerprints = fingerprints;
  }

  updateFingerprints(fingerprints) {
    this.fingerprints = fingerprints;
  }

  distance(p1, p2) {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
  }

  idwInterpolate(targetX, targetY, beaconMac, power = 2) {
    let weightedSum = 0;
    let weightSum = 0;

    this.fingerprints.forEach((fp, key) => {
      const beaconData = fp.beacons.get(beaconMac);
      if (!beaconData) return;

      const dist = this.distance({ x: targetX, y: targetY }, { x: fp.x, y: fp.y });
      
      if (dist < 0.1) {
        return beaconData.mean;
      }

      const weight = 1 / Math.pow(dist, power);
      weightedSum += weight * beaconData.mean;
      weightSum += weight;
    });

    if (weightSum === 0) return null;
    return weightedSum / weightSum;
  }

  krigingInterpolate(targetX, targetY, beaconMac) {
    const nearbyPoints = [];
    const maxDist = 5;

    this.fingerprints.forEach((fp, key) => {
      const beaconData = fp.beacons.get(beaconMac);
      if (!beaconData) return;

      const dist = this.distance({ x: targetX, y: targetY }, { x: fp.x, y: fp.y });
      if (dist <= maxDist) {
        nearbyPoints.push({ x: fp.x, y: fp.y, rssi: beaconData.mean, dist });
      }
    });

    if (nearbyPoints.length < 3) {
      return this.idwInterpolate(targetX, targetY, beaconMac);
    }

    nearbyPoints.sort((a, b) => a.dist - b.dist);
    const n = Math.min(nearbyPoints.length, 8);
    const selected = nearbyPoints.slice(0, n);

    const variogram = (h) => {
      const nugget = 1;
      const sill = 20;
      const range = 5;
      if (h === 0) return 0;
      return nugget + (sill - nugget) * (1.5 * h / range - 0.5 * Math.pow(h / range, 3));
    };

    const k = selected.map(p => variogram(p.dist));
    
    const K = [];
    for (let i = 0; i < n; i++) {
      K[i] = [];
      for (let j = 0; j < n; j++) {
        const dist = this.distance(selected[i], selected[j]);
        K[i][j] = variogram(dist);
      }
      K[i].push(1);
    }
    K.push(new Array(n).fill(1));
    K[n].push(0);

    try {
      const Kinv = math.inv(math.matrix(K));
      const kVec = math.matrix([...k, 1]);
      const lambda = math.multiply(Kinv, kVec).toArray();

      let estimate = 0;
      for (let i = 0; i < n; i++) {
        estimate += lambda[i] * selected[i].rssi;
      }
      return estimate;
    } catch (e) {
      return this.idwInterpolate(targetX, targetY, beaconMac);
    }
  }

  generateInterpolatedFingerprints(gridSize = 1, maxX = 10, maxY = 10, floor = 1) {
    const interpolatedFPs = [];
    const beaconMacs = new Set();

    this.fingerprints.forEach(fp => {
      fp.beacons.forEach((_, mac) => beaconMacs.add(mac));
    });

    for (let x = 0; x <= maxX; x += gridSize) {
      for (let y = 0; y <= maxY; y += gridSize) {
        const fpKey = `${x},${y},${floor}`;
        if (this.fingerprints.has(fpKey)) continue;

        const beacons = new Map();
        beaconMacs.forEach(mac => {
          const rssiMean = this.krigingInterpolate(x, y, mac);
          if (rssiMean !== null) {
            beacons.set(mac, { mean: rssiMean, std: 5 });
          }
        });

        if (beacons.size > 0) {
          interpolatedFPs.push({
            x, y, floor, beacons, interpolated: true
          });
        }
      }
    }

    return interpolatedFPs;
  }
}

class CrowdsourcedUpdater {
  constructor(db, positioning) {
    this.db = db;
    this.positioning = positioning;
    this.updateBuffer = new Map();
    this.minConfidence = 0.5;
    this.minUpdates = 10;
    this.learningRate = 0.1;
  }

  recordPositionAndRSSI(position, rssiData, floor) {
    if (position.confidence < this.minConfidence) return;

    const gridX = Math.round(position.x * 2) / 2;
    const gridY = Math.round(position.y * 2) / 2;
    const key = `${gridX},${gridY},${floor}`;

    if (!this.updateBuffer.has(key)) {
      this.updateBuffer.set(key, { count: 0, beaconData: new Map() });
    }

    const buffer = this.updateBuffer.get(key);
    buffer.count++;

    rssiData.forEach(meas => {
      if (!buffer.beaconData.has(meas.beaconMac)) {
        buffer.beaconData.set(meas.beaconMac, []);
      }
      buffer.beaconData.get(meas.beaconMac).push(meas.rssi);
    });

    if (buffer.count >= this.minUpdates) {
      this.applyUpdate(key, buffer, gridX, gridY, floor);
      this.updateBuffer.delete(key);
    }
  }

  applyUpdate(key, buffer, gridX, gridY, floor) {
    buffer.beaconData.forEach((rssiValues, beaconMac) => {
      if (rssiValues.length < 5) return;

      const newMean = rssiValues.reduce((a, b) => a + b, 0) / rssiValues.length;
      const variance = rssiValues.reduce((sum, v) => sum + Math.pow(v - newMean, 2), 0) / rssiValues.length;
      const newStd = Math.sqrt(variance);

      this.db.get(`
        SELECT f.rssi_mean, f.rssi_std, f.sample_count, b.id as beacon_id
        FROM fingerprints f
        JOIN beacons b ON f.beacon_id = b.id
        WHERE f.location_x = ? AND f.location_y = ? AND f.floor = ? AND b.mac_address = ?
      `, [gridX, gridY, floor, beaconMac], (err, existing) => {
        if (err) {
          console.error('Error querying fingerprint:', err);
          return;
        }

        if (existing) {
          const updatedMean = existing.rssi_mean * (1 - this.learningRate) + newMean * this.learningRate;
          const updatedStd = existing.rssi_std * (1 - this.learningRate) + newStd * this.learningRate;
          const newCount = existing.sample_count + rssiValues.length;

          this.db.run(`
            UPDATE fingerprints 
            SET rssi_mean = ?, rssi_std = ?, sample_count = ?, updated_at = CURRENT_TIMESTAMP
            WHERE location_x = ? AND location_y = ? AND floor = ? AND beacon_id = ?
          `, [updatedMean, updatedStd, newCount, gridX, gridY, floor, existing.beacon_id], (err) => {
            if (!err) {
              this.positioning.loadFingerprints();
            }
          });
        } else {
          this.db.get('SELECT id FROM beacons WHERE mac_address = ?', [beaconMac], (err, beacon) => {
            if (err || !beacon) return;

            this.db.run(`
              INSERT INTO fingerprints (location_x, location_y, floor, beacon_id, rssi_mean, rssi_std, sample_count)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [gridX, gridY, floor, beacon.id, newMean, newStd, rssiValues.length], (err) => {
              if (!err) {
                this.positioning.loadFingerprints();
              }
            });
          });
        }
      });
    });
  }

  clearBuffer() {
    this.updateBuffer.clear();
  }
}

class EnhancedPositioning {
  constructor() {
    this.fingerprints = new Map();
    this.gridPoints = [];
    this.rssiPreprocessor = new RSSIPreprocessor(5);
    this.kalmanFilters = new Map();
    this.interpolator = new FingerprintInterpolator(this.fingerprints);
    this.crowdsourcedUpdater = null;
    this.useInterpolation = true;
    this.useKalman = true;
    this.useRSSIPreprocessing = true;
    this.useCrowdsourcing = true;
    this.loadFingerprints();
  }

  initCrowdsourcing() {
    if (!this.crowdsourcedUpdater) {
      this.crowdsourcedUpdater = new CrowdsourcedUpdater(db, this);
    }
  }

  loadFingerprints() {
    return new Promise((resolve, reject) => {
      db.all(`
        SELECT f.*, b.mac_address 
        FROM fingerprints f 
        JOIN beacons b ON f.beacon_id = b.id
      `, (err, rows) => {
        if (err) {
          reject(err);
          return;
        }

        this.fingerprints.clear();
        this.gridPoints = [];

        rows.forEach(row => {
          const key = `${row.location_x},${row.location_y},${row.floor}`;
          if (!this.fingerprints.has(key)) {
            this.fingerprints.set(key, {
              x: row.location_x,
              y: row.location_y,
              floor: row.floor,
              beacons: new Map()
            });
            this.gridPoints.push({ x: row.location_x, y: row.location_y, floor: row.floor });
          }
          this.fingerprints.get(key).beacons.set(row.mac_address, {
            mean: row.rssi_mean,
            std: row.rssi_std
          });
        });

        this.interpolator.updateFingerprints(this.fingerprints);
        
        if (this.useInterpolation) {
          const interpolated = this.interpolator.generateInterpolatedFingerprints(1, 10, 10, 1);
          interpolated.forEach(fp => {
            const key = `${fp.x},${fp.y},${fp.floor}`;
            if (!this.fingerprints.has(key)) {
              this.fingerprints.set(key, fp);
              this.gridPoints.push({ x: fp.x, y: fp.y, floor: fp.floor });
            }
          });
        }

        console.log(`Loaded ${this.fingerprints.size} fingerprint locations (${rows.length} raw + interpolated)`);
        resolve();
      });
    });
  }

  gaussianPDF(x, mean, std) {
    if (std === 0) std = 1;
    const exponent = -Math.pow(x - mean, 2) / (2 * Math.pow(std, 2));
    return (1 / (std * Math.sqrt(2 * Math.PI))) * Math.exp(exponent);
  }

  calculateLikelihood(rssiMeasurements, gridPoint) {
    const fpKey = `${gridPoint.x},${gridPoint.y},${gridPoint.floor}`;
    const fingerprint = this.fingerprints.get(fpKey);
    
    if (!fingerprint) return 0;

    let logLikelihood = 0;
    let matchedBeacons = 0;

    rssiMeasurements.forEach(meas => {
      const beaconData = fingerprint.beacons.get(meas.beaconMac);
      if (beaconData) {
        const likelihood = this.gaussianPDF(meas.rssi, beaconData.mean, beaconData.std);
        if (likelihood > 0) {
          logLikelihood += Math.log(likelihood);
          matchedBeacons++;
        }
      }
    });

    if (matchedBeacons === 0) return 0;

    return Math.exp(logLikelihood / matchedBeacons);
  }

  findPosition(tagId, rssiData, floor = 1) {
    if (this.gridPoints.length === 0) {
      return { x: 5, y: 5, floor, confidence: 0, error: 'No fingerprints available' };
    }

    let processedRSSI = rssiData;
    if (this.useRSSIPreprocessing) {
      processedRSSI = this.rssiPreprocessor.processBatch(tagId, rssiData, 'outlier');
    }

    const floorPoints = this.gridPoints.filter(p => p.floor === floor);
    if (floorPoints.length === 0) {
      return { x: 5, y: 5, floor, confidence: 0, error: 'No fingerprints for this floor' };
    }

    let maxLikelihood = 0;
    let bestPoint = floorPoints[0];
    const likelihoods = [];

    floorPoints.forEach(point => {
      const likelihood = this.calculateLikelihood(processedRSSI, point);
      likelihoods.push({ point, likelihood });
      if (likelihood > maxLikelihood) {
        maxLikelihood = likelihood;
        bestPoint = point;
      }
    });

    const totalLikelihood = likelihoods.reduce((sum, l) => sum + l.likelihood, 0);
    const confidence = totalLikelihood > 0 ? maxLikelihood / totalLikelihood : 0;

    let weightedX = 0, weightedY = 0, weightSum = 0;
    likelihoods.forEach(({ point, likelihood }) => {
      const weight = likelihood / (totalLikelihood || 1);
      weightedX += point.x * weight;
      weightedY += point.y * weight;
      weightSum += weight;
    });

    let finalX = weightSum > 0 ? weightedX / weightSum : bestPoint.x;
    let finalY = weightSum > 0 ? weightedY / weightSum : bestPoint.y;

    if (this.useKalman) {
      if (!this.kalmanFilters.has(tagId)) {
        this.kalmanFilters.set(tagId, new MultiVarKalmanFilter(2, 0.01, 0.1));
      }
      const kf = this.kalmanFilters.get(tagId);
      const smoothed = kf.filter([finalX, finalY]);
      finalX = smoothed[0];
      finalY = smoothed[1];
    }

    const result = {
      x: finalX,
      y: finalY,
      floor,
      confidence,
      rawPosition: { x: bestPoint.x, y: bestPoint.y }
    };

    if (this.useCrowdsourcing && this.crowdsourcedUpdater) {
      this.crowdsourcedUpdater.recordPositionAndRSSI(result, processedRSSI, floor);
    }

    return result;
  }

  updateFingerprint(locationX, locationY, floor, beaconMac, rssi) {
    return new Promise((resolve, reject) => {
      db.get('SELECT id FROM beacons WHERE mac_address = ?', [beaconMac], (err, beacon) => {
        if (err) {
          reject(err);
          return;
        }
        if (!beacon) {
          reject(new Error('Beacon not found'));
          return;
        }

        db.get(`
          SELECT rssi_mean, rssi_std, sample_count FROM fingerprints 
          WHERE location_x = ? AND location_y = ? AND floor = ? AND beacon_id = ?
        `, [locationX, locationY, floor, beacon.id], (err, existing) => {
          if (err) {
            reject(err);
            return;
          }

          if (existing) {
            const newCount = existing.sample_count + 1;
            const newMean = (existing.rssi_mean * existing.sample_count + rssi) / newCount;
            
            const oldVariance = Math.pow(existing.rssi_std, 2);
            const newVariance = ((existing.sample_count - 1) * oldVariance + 
                                Math.pow(rssi - newMean, 2)) / newCount;
            const newStd = Math.sqrt(Math.max(newVariance, 1));

            db.run(`
              UPDATE fingerprints 
              SET rssi_mean = ?, rssi_std = ?, sample_count = ?, updated_at = CURRENT_TIMESTAMP
              WHERE location_x = ? AND location_y = ? AND floor = ? AND beacon_id = ?
            `, [newMean, newStd, newCount, locationX, locationY, floor, beacon.id], (err) => {
              if (err) reject(err);
              else {
                this.loadFingerprints().then(resolve).catch(reject);
              }
            });
          } else {
            db.run(`
              INSERT INTO fingerprints (location_x, location_y, floor, beacon_id, rssi_mean, rssi_std, sample_count)
              VALUES (?, ?, ?, ?, ?, 5, 1)
            `, [locationX, locationY, floor, beacon.id, rssi, 5], (err) => {
              if (err) reject(err);
              else {
                this.loadFingerprints().then(resolve).catch(reject);
              }
            });
          }
        });
      });
    });
  }

  batchUpdateFingerprint(locationX, locationY, floor, rssiMeasurements) {
    return Promise.all(
      rssiMeasurements.map(m => 
        this.updateFingerprint(locationX, locationY, floor, m.beaconMac, m.rssi)
      )
    );
  }

  setOptions(options) {
    if (options.useInterpolation !== undefined) this.useInterpolation = options.useInterpolation;
    if (options.useKalman !== undefined) this.useKalman = options.useKalman;
    if (options.useRSSIPreprocessing !== undefined) this.useRSSIPreprocessing = options.useRSSIPreprocessing;
    if (options.useCrowdsourcing !== undefined) {
      this.useCrowdsourcing = options.useCrowdsourcing;
      if (this.useCrowdsourcing) {
        this.initCrowdsourcing();
      }
    }
    return this.loadFingerprints();
  }
}

module.exports = {
  RSSIPreprocessor,
  KalmanFilter,
  MultiVarKalmanFilter,
  FingerprintInterpolator,
  CrowdsourcedUpdater,
  EnhancedPositioning
};