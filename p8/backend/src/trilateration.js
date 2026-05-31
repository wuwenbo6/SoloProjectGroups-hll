class KalmanFilter {
  constructor(initialValue = 0, processNoise = 0.1, measurementNoise = 1.0) {
    this.x = initialValue;
    this.P = 1.0;
    this.Q = processNoise;
    this.R = measurementNoise;
  }

  update(measurement) {
    this.P = this.P + this.Q;
    const K = this.P / (this.P + this.R);
    this.x = this.x + K * (measurement - this.x);
    this.P = (1 - K) * this.P;
    return this.x;
  }

  getValue() {
    return this.x;
  }
}

class MovingAverage {
  constructor(windowSize = 5) {
    this.windowSize = windowSize;
    this.values = [];
  }

  update(value) {
    this.values.push(value);
    if (this.values.length > this.windowSize) {
      this.values.shift();
    }
    return this.getValue();
  }

  getValue() {
    if (this.values.length === 0) return 0;
    return this.values.reduce((a, b) => a + b, 0) / this.values.length;
  }
}

class ExponentialSmoothing {
  constructor(alpha = 0.3) {
    this.alpha = alpha;
    this.value = null;
  }

  update(newValue) {
    if (this.value === null) {
      this.value = newValue;
    } else {
      this.value = this.alpha * newValue + (1 - this.alpha) * this.value;
    }
    return this.value;
  }

  getValue() {
    return this.value;
  }
}

class OutlierDetector {
  constructor(threshold = 2.0) {
    this.threshold = threshold;
    this.mean = 0;
    this.std = 1;
    this.values = [];
  }

  update(value) {
    this.values.push(value);
    if (this.values.length > 20) {
      this.values.shift();
    }
    this.mean = this.values.reduce((a, b) => a + b, 0) / this.values.length;
    this.std = Math.sqrt(
      this.values.reduce((a, b) => a + Math.pow(b - this.mean, 2), 0) / this.values.length
    );
  }

  isOutlier(value) {
    if (this.values.length < 5) return false;
    const zScore = Math.abs((value - this.mean) / (this.std || 1));
    return zScore > this.threshold;
  }
}

class MeasurementFilter {
  constructor() {
    this.kalmanFilters = new Map();
    this.movingAverages = new Map();
    this.outlierDetectors = new Map();
  }

  filter(bssid, distance) {
    if (!this.kalmanFilters.has(bssid)) {
      this.kalmanFilters.set(bssid, new KalmanFilter(distance, 0.05, 0.5));
      this.movingAverages.set(bssid, new MovingAverage(5));
      this.outlierDetectors.set(bssid, new OutlierDetector(2.5));
    }

    const detector = this.outlierDetectors.get(bssid);
    const kalman = this.kalmanFilters.get(bssid);
    const ma = this.movingAverages.get(bssid);

    detector.update(distance);
    
    if (detector.isOutlier(distance)) {
      return kalman.getValue();
    }

    const kalmanFiltered = kalman.update(distance);
    const maFiltered = ma.update(kalmanFiltered);
    
    return maFiltered;
  }

  getFilteredDistance(bssid, rawDistance) {
    return this.filter(bssid, rawDistance);
  }

  reset(bssid) {
    this.kalmanFilters.delete(bssid);
    this.movingAverages.delete(bssid);
    this.outlierDetectors.delete(bssid);
  }

  clearAll() {
    this.kalmanFilters.clear();
    this.movingAverages.clear();
    this.outlierDetectors.clear();
  }
}

class PositionSmoother {
  constructor() {
    this.deviceFilters = new Map();
  }

  smooth(deviceId, position) {
    if (!this.deviceFilters.has(deviceId)) {
      this.deviceFilters.set(deviceId, {
        x: new ExponentialSmoothing(0.4),
        y: new ExponentialSmoothing(0.4),
        z: new ExponentialSmoothing(0.4),
        history: []
      });
    }

    const filters = this.deviceFilters.get(deviceId);
    
    filters.history.push({ x: position.x, y: position.y, z: position.z });
    if (filters.history.length > 10) {
      filters.history.shift();
    }

    return {
      x: filters.x.update(position.x),
      y: filters.y.update(position.y),
      z: filters.z.update(position.z),
      raw: position
    };
  }

  reset(deviceId) {
    this.deviceFilters.delete(deviceId);
  }
}

function trilaterate2D(apData) {
  if (apData.length < 2) {
    return null;
  }

  if (apData.length === 2) {
    const p1 = apData[0];
    const p2 = apData[1];
    return {
      x: (p1.x * p2.distance + p2.x * p1.distance) / (p1.distance + p2.distance),
      y: (p1.y * p2.distance + p2.y * p1.distance) / (p1.distance + p2.distance),
      z: p1.z || 0,
      accuracy: Math.abs(p1.distance - p2.distance) + 2
    };
  }

  const points = apData.map(ap => ({
    x: ap.x,
    y: ap.y,
    z: ap.z || 0,
    r: ap.distance,
    weight: 1 / (ap.distance * ap.distance || 0.01)
  }));

  if (points.length === 3) {
    return basicTrilateration3Points(points[0], points[1], points[2]);
  }

  return weightedLeastSquares(points);
}

function basicTrilateration3Points(P1, P2, P3) {
  const Ex = normalizeVector(subtract(P2, P1));
  const i = dot(Ex, subtract(P3, P1));
  const tmp = subtract(P3, P1);
  const Ey = normalizeVector(subtract(tmp, multiply(Ex, i)));
  const Ez = cross(Ex, Ey);

  const d = vectorLength(subtract(P2, P1));
  const j = dot(Ey, subtract(P3, P1));

  const r1Sq = P1.r * P1.r;
  const r2Sq = P2.r * P2.r;
  const r3Sq = P3.r * P3.r;

  const x = (r1Sq - r2Sq + d * d) / (2 * d);
  const y = (r1Sq - r3Sq + i * i + j * j) / (2 * j) - (i / j) * x;

  let zSq = r1Sq - x * x - y * y;
  let z = 0;

  if (zSq > 0) {
    z = Math.sqrt(zSq);
  }

  const result = add(
    P1,
    add(
      multiply(Ex, x),
      add(
        multiply(Ey, y),
        multiply(Ez, z)
      )
    )
  );

  const accuracy = calculateAccuracy(result, [P1, P2, P3]);

  return {
    x: result.x,
    y: result.y,
    z: result.z,
    accuracy: accuracy
  };
}

function weightedLeastSquares(points) {
  const n = points.length;
  let x = 0, y = 0, z = 0;
  let totalWeight = 0;

  points.forEach(p => {
    x += p.x * p.weight;
    y += p.y * p.weight;
    z += p.z * p.weight;
    totalWeight += p.weight;
  });

  x /= totalWeight;
  y /= totalWeight;
  z /= totalWeight;

  for (let iter = 0; iter < 10; iter++) {
    let dx = 0, dy = 0, dz = 0;
    let sumWeight = 0;

    points.forEach(p => {
      const dist = Math.sqrt(
        Math.pow(x - p.x, 2) +
        Math.pow(y - p.y, 2) +
        Math.pow(z - p.z, 2)
      );
      
      if (dist > 0.1) {
        const error = p.r - dist;
        const weight = p.weight / dist;
        
        dx += weight * (x - p.x) * error / dist;
        dy += weight * (y - p.y) * error / dist;
        dz += weight * (z - p.z) * error / dist;
        sumWeight += weight;
      }
    });

    if (sumWeight > 0) {
      x += dx / sumWeight;
      y += dy / sumWeight;
      z += dz / sumWeight;
    }
  }

  const accuracy = calculateAccuracy({ x, y, z }, points);

  return { x, y, z, accuracy };
}

function calculateAccuracy(point, aps) {
  let totalError = 0;
  let validCount = 0;

  aps.forEach(ap => {
    const dist = Math.sqrt(
      Math.pow(point.x - ap.x, 2) +
      Math.pow(point.y - ap.y, 2) +
      Math.pow(point.z - ap.z, 2)
    );
    if (dist > 0) {
      totalError += Math.abs(dist - ap.r);
      validCount++;
    }
  });

  return validCount > 0 ? totalError / validCount : 999;
}

function robustTrilateration(apData) {
  if (apData.length === 0) {
    return null;
  }

  if (apData.length === 1) {
    const ap = apData[0];
    return {
      x: ap.x,
      y: ap.y,
      z: ap.z || 0,
      accuracy: ap.distance + 1,
      source: 'single_ap'
    };
  }

  const sorted = [...apData].sort((a, b) => a.distance - b.distance);
  
  for (let useCount = Math.min(sorted.length, 8); useCount >= 2; useCount--) {
    const subset = sorted.slice(0, useCount);
    try {
      const result = trilaterate2D(subset);
      if (result && result.accuracy < 10) {
        result.source = `trilateration_${useCount}ap`;
        return result;
      }
    } catch (e) {
      continue;
    }
  }

  const nearest = sorted[0];
  return {
    x: nearest.x,
    y: nearest.y,
    z: nearest.z || 0,
    accuracy: nearest.distance,
    source: 'fallback_nearest'
  };
}

function subtract(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: (a.z || 0) - (b.z || 0) };
}

function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: (a.z || 0) + (b.z || 0) };
}

function multiply(v, s) {
  return { x: v.x * s, y: v.y * s, z: (v.z || 0) * s };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + (a.z || 0) * (b.z || 0);
}

function cross(a, b) {
  return {
    x: a.y * (b.z || 0) - (a.z || 0) * b.y,
    y: (a.z || 0) * b.x - a.x * (b.z || 0),
    z: a.x * b.y - a.y * b.x
  };
}

function vectorLength(v) {
  return Math.sqrt(v.x * v.x + v.y * v.y + (v.z || 0) * (v.z || 0));
}

function normalizeVector(v) {
  const len = vectorLength(v);
  if (len === 0) return { x: 0, y: 0, z: 0 };
  return multiply(v, 1 / len);
}

const measurementFilter = new MeasurementFilter();
const positionSmoother = new PositionSmoother();

module.exports = {
  trilaterate: robustTrilateration,
  robustTrilateration,
  KalmanFilter,
  MovingAverage,
  ExponentialSmoothing,
  OutlierDetector,
  MeasurementFilter,
  PositionSmoother,
  measurementFilter,
  positionSmoother
};
