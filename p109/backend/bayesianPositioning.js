const math = require('mathjs');
const db = require('./database');

class BayesianPositioning {
  constructor() {
    this.fingerprints = new Map();
    this.gridPoints = [];
    this.loadFingerprints();
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

        console.log(`Loaded ${this.fingerprints.size} fingerprint locations`);
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

  findPosition(rssiMeasurements, floor = 1) {
    if (this.gridPoints.length === 0) {
      return { x: 5, y: 5, floor, confidence: 0, error: 'No fingerprints available' };
    }

    const floorPoints = this.gridPoints.filter(p => p.floor === floor);
    if (floorPoints.length === 0) {
      return { x: 5, y: 5, floor, confidence: 0, error: 'No fingerprints for this floor' };
    }

    let maxLikelihood = 0;
    let bestPoint = floorPoints[0];
    const likelihoods = [];

    floorPoints.forEach(point => {
      const likelihood = this.calculateLikelihood(rssiMeasurements, point);
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

    return {
      x: weightSum > 0 ? weightedX / weightSum : bestPoint.x,
      y: weightSum > 0 ? weightedY / weightSum : bestPoint.y,
      floor,
      confidence,
      rawPosition: { x: bestPoint.x, y: bestPoint.y }
    };
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
}

module.exports = BayesianPositioning;