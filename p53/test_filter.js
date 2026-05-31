const KalmanFilter = require('./src/main/adsbReceiver.js');
const TimeSynchronizer = require('./src/main/adsbReceiver.js');

console.log('=== 卡尔曼滤波测试 ===\n');

const { KalmanFilter: KF, MultiStateKalmanFilter, TimeSynchronizer: TS } = (() => {
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
  }

  return { KalmanFilter, MultiStateKalmanFilter: null, TimeSynchronizer: TS };
})();

console.log('测试 1: 卡尔曼滤波 - 带有噪声的位置数据');
const kf = new KF(0.001, 0.1);
const trueValue = 39.9042;
const noisyMeasurements = [
  39.9042 + (Math.random() - 0.5) * 0.01,
  39.9042 + (Math.random() - 0.5) * 0.01,
  39.9042 + (Math.random() - 0.5) * 0.01,
  39.9042 + (Math.random() - 0.5) * 0.01,
  39.9042 + (Math.random() - 0.5) * 0.01,
  39.9042 + 0.05,
  39.9042 + (Math.random() - 0.5) * 0.01,
  39.9042 + (Math.random() - 0.5) * 0.01,
];

console.log(`真实值: ${trueValue.toFixed(6)}`);
console.log('测量值 -> 滤波后值:');
noisyMeasurements.forEach((m, i) => {
  const filtered = kf.update(m);
  console.log(`  ${i+1}: ${m.toFixed(6)} -> ${filtered.toFixed(6)}`);
});

console.log('\n=== 时间同步和插值测试 ===\n');

const ts = new TS(15000, 500);
const baseTime = Date.now();

console.log('测试 2: 常规间隔数据 (1秒间隔)');
const regularPoints = [
  { icao24: 'TEST01', latitude: 39.9000, longitude: 116.4000, altitude: 10000, velocity: 400, heading: 90, timestamp: baseTime },
  { icao24: 'TEST01', latitude: 39.9010, longitude: 116.4010, altitude: 10050, velocity: 405, heading: 91, timestamp: baseTime + 1000 },
  { icao24: 'TEST01', latitude: 39.9020, longitude: 116.4020, altitude: 10100, velocity: 410, heading: 92, timestamp: baseTime + 2000 },
];

regularPoints.forEach((p, i) => {
  const result = ts.addPoint('TEST01', p);
  console.log(`  点 ${i+1}: 输出 ${result.length} 个点`);
});

console.log('\n测试 3: 大时间间隔数据 (5秒间隔，应该插值)');
const gapPoints = [
  { icao24: 'TEST02', latitude: 39.9000, longitude: 116.4000, altitude: 10000, velocity: 400, heading: 90, timestamp: baseTime + 10000 },
  { icao24: 'TEST02', latitude: 39.9050, longitude: 116.4050, altitude: 10250, velocity: 425, heading: 95, timestamp: baseTime + 15000 },
];

gapPoints.forEach((p, i) => {
  const result = ts.addPoint('TEST02', p);
  console.log(`  点 ${i+1}: 输出 ${result.length} 个点`);
  if (result.length > 1) {
    result.forEach((rp, j) => {
      console.log(`    ${j+1}: lat=${rp.latitude.toFixed(6)}, lon=${rp.longitude.toFixed(6)}, alt=${rp.altitude}, t=${new Date(rp.timestamp).toLocaleTimeString()}, interpolated=${rp.interpolated || false}`);
    });
  }
});

console.log('\n测试 4: 航向插值 (边界情况 350度 -> 10度)');
const headingPoints = [
  { icao24: 'TEST03', latitude: 39.9000, longitude: 116.4000, altitude: 10000, velocity: 400, heading: 350, timestamp: baseTime + 20000 },
  { icao24: 'TEST03', latitude: 39.9020, longitude: 116.4020, altitude: 10100, velocity: 410, heading: 10, timestamp: baseTime + 25000 },
];

headingPoints.forEach((p, i) => {
  const result = ts.addPoint('TEST03', p);
  if (result.length > 1) {
    console.log('  插值结果:');
    result.forEach((rp, j) => {
      console.log(`    ${j+1}: heading=${rp.heading.toFixed(2)}°`);
    });
  }
});

console.log('\n=== 测试完成 ===');
