const math = require('mathjs');
const db = require('./database');

class ParticleFilter {
  constructor(numParticles = 500, mapWidth = 10, mapHeight = 10) {
    this.numParticles = numParticles;
    this.mapWidth = mapWidth;
    this.mapHeight = mapHeight;
    this.particles = [];
    this.weights = [];
    this.initialized = false;
    this.processNoise = 0.3;
    this.measurementNoise = 0.5;
  }

  initialize() {
    this.particles = [];
    for (let i = 0; i < this.numParticles; i++) {
      this.particles.push({
        x: Math.random() * this.mapWidth,
        y: Math.random() * this.mapHeight,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5
      });
    }
    this.weights = new Array(this.numParticles).fill(1 / this.numParticles);
    this.initialized = true;
  }

  initializeAtPosition(x, y, radius = 1) {
    this.particles = [];
    for (let i = 0; i < this.numParticles; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * radius;
      this.particles.push({
        x: Math.max(0, Math.min(this.mapWidth, x + Math.cos(angle) * r)),
        y: Math.max(0, Math.min(this.mapHeight, y + Math.sin(angle) * r)),
        vx: (Math.random() - 0.5) * 0.2,
        vy: (Math.random() - 0.5) * 0.2
      });
    }
    this.weights = new Array(this.numParticles).fill(1 / this.numParticles);
    this.initialized = true;
  }

  predict(dt = 1) {
    this.particles.forEach(p => {
      p.vx += (Math.random() - 0.5) * this.processNoise * dt;
      p.vy += (Math.random() - 0.5) * this.processNoise * dt;
      
      p.vx = Math.max(-2, Math.min(2, p.vx));
      p.vy = Math.max(-2, Math.min(2, p.vy));
      
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      
      p.x = Math.max(0.1, Math.min(this.mapWidth - 0.1, p.x));
      p.y = Math.max(0.1, Math.min(this.mapHeight - 0.1, p.y));
    });
  }

  gaussian(x, mean, std) {
    return Math.exp(-0.5 * Math.pow((x - mean) / std, 2)) / (std * Math.sqrt(2 * Math.PI));
  }

  calculateParticleWeight(particle, rssiMeasurements, fingerprints) {
    let logWeight = 0;
    let matched = 0;

    rssiMeasurements.forEach(meas => {
      let bestMatch = null;
      let bestDist = Infinity;

      fingerprints.forEach((fp, key) => {
        const dist = Math.sqrt(Math.pow(particle.x - fp.x, 2) + Math.pow(particle.y - fp.y, 2));
        if (dist < bestDist && fp.beacons.has(meas.beaconMac)) {
          bestDist = dist;
          bestMatch = fp.beacons.get(meas.beaconMac);
        }
      });

      if (bestMatch) {
        const likelihood = this.gaussian(meas.rssi, bestMatch.mean, Math.max(bestMatch.std, 3));
        if (likelihood > 0) {
          logWeight += Math.log(likelihood + 1e-10);
          matched++;
        }
      }
    });

    if (matched === 0) return 1e-10;
    return Math.exp(logWeight / matched);
  }

  update(rssiMeasurements, fingerprints) {
    let totalWeight = 0;
    
    for (let i = 0; i < this.numParticles; i++) {
      this.weights[i] = this.calculateParticleWeight(this.particles[i], rssiMeasurements, fingerprints);
      totalWeight += this.weights[i];
    }

    if (totalWeight > 0) {
      for (let i = 0; i < this.numParticles; i++) {
        this.weights[i] /= totalWeight;
      }
    } else {
      this.weights.fill(1 / this.numParticles);
    }
  }

  resample() {
    const newParticles = [];
    const step = 1 / this.numParticles;
    let u = Math.random() * step;
    let c = this.weights[0];
    let i = 0;

    for (let j = 0; j < this.numParticles; j++) {
      while (u > c && i < this.numParticles - 1) {
        i++;
        c += this.weights[i];
      }
      
      const p = this.particles[i];
      newParticles.push({
        x: p.x + (Math.random() - 0.5) * 0.05,
        y: p.y + (Math.random() - 0.5) * 0.05,
        vx: p.vx + (Math.random() - 0.5) * 0.05,
        vy: p.vy + (Math.random() - 0.5) * 0.05
      });
      u += step;
    }

    this.particles = newParticles;
    this.weights.fill(1 / this.numParticles);
  }

  getEstimate() {
    let meanX = 0, meanY = 0;
    let varX = 0, varY = 0;

    for (let i = 0; i < this.numParticles; i++) {
      meanX += this.weights[i] * this.particles[i].x;
      meanY += this.weights[i] * this.particles[i].y;
    }

    for (let i = 0; i < this.numParticles; i++) {
      varX += this.weights[i] * Math.pow(this.particles[i].x - meanX, 2);
      varY += this.weights[i] * Math.pow(this.particles[i].y - meanY, 2);
    }

    const effectiveNumParticles = 1 / this.weights.reduce((sum, w) => sum + w * w, 0);

    return {
      x: meanX,
      y: meanY,
      variance: Math.sqrt(varX + varY),
      effectiveParticles: effectiveNumParticles,
      particles: this.particles.map((p, i) => ({ x: p.x, y: p.y, weight: this.weights[i] }))
    };
  }

  filter(rssiMeasurements, fingerprints, initialPosition = null) {
    if (!this.initialized) {
      if (initialPosition) {
        this.initializeAtPosition(initialPosition.x, initialPosition.y, 0.5);
      } else {
        this.initialize();
      }
    }

    this.predict();
    this.update(rssiMeasurements, fingerprints);
    
    const estimate = this.getEstimate();
    
    if (estimate.effectiveParticles < this.numParticles * 0.5) {
      this.resample();
    }

    return estimate;
  }
}

class AutoFingerprintGenerator {
  constructor(beacons) {
    this.beacons = beacons;
    this.pathLossExponent = 2.5;
    this.referenceRSSI = -40;
    this.referenceDistance = 1;
    this.shadowingStd = 4;
    this.environmentFactor = 1;
  }

  logDistancePathLoss(distance) {
    if (distance < this.referenceDistance) distance = this.referenceDistance;
    return this.referenceRSSI - 10 * this.pathLossExponent * Math.log10(distance / this.referenceDistance);
  }

  multiWallModel(distance, numWalls = 0) {
    const wallAttenuation = numWalls * 3;
    return this.logDistancePathLoss(distance) - wallAttenuation;
  }

  rayTracing(x, y, beacon) {
    const distance = Math.sqrt(Math.pow(x - beacon.x, 2) + Math.pow(y - beacon.y, 2));
    
    let numWalls = 0;
    const walls = [
      { x1: 3, y1: 0, x2: 3, y2: 4 },
      { x1: 7, y1: 6, x2: 7, y2: 10 },
      { x1: 0, y1: 5, x2: 4, y2: 5 }
    ];
    
    walls.forEach(wall => {
      if (this.lineIntersect(
        x, y, beacon.x, beacon.y,
        wall.x1, wall.y1, wall.x2, wall.y2
      )) {
        numWalls++;
      }
    });

    return this.multiWallModel(distance, numWalls);
  }

  lineIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
    const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
    if (Math.abs(denom) < 0.001) return false;
    
    const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
    const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
    
    return ua > 0 && ua < 1 && ub > 0 && ub < 1;
  }

  generateRSSI(x, y, beaconMac, method = 'logdistance') {
    const beacon = this.beacons.find(b => b.mac_address === beaconMac);
    if (!beacon) return null;

    let rssi;
    switch (method) {
      case 'raytracing':
        rssi = this.rayTracing(x, y, beacon);
        break;
      default:
        const distance = Math.sqrt(Math.pow(x - beacon.x, 2) + Math.pow(y - beacon.y, 2));
        rssi = this.logDistancePathLoss(distance);
    }

    const shadowing = (Math.random() - 0.5) * this.shadowingStd * 2;
    return rssi + shadowing;
  }

  generateFingerprint(x, y, floor = 1, numSamples = 5, method = 'logdistance') {
    const beaconData = [];
    
    this.beacons.forEach(beacon => {
      const rssiSamples = [];
      for (let i = 0; i < numSamples; i++) {
        const distance = Math.sqrt(Math.pow(x - beacon.x, 2) + Math.pow(y - beacon.y, 2));
        let rssi;
        if (method === 'raytracing') {
          rssi = this.rayTracing(x, y, beacon);
        } else {
          rssi = this.logDistancePathLoss(distance);
        }
        const shadowing = (Math.random() - 0.5) * this.shadowingStd * 2;
        rssiSamples.push(rssi + shadowing);
      }

      const mean = rssiSamples.reduce((a, b) => a + b, 0) / rssiSamples.length;
      const variance = rssiSamples.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / rssiSamples.length;
      
      beaconData.push({
        beaconMac: beacon.mac_address,
        mean,
        std: Math.sqrt(variance)
      });
    });

    return { x, y, floor, beaconData };
  }

  generateGrid(gridSize = 1, maxX = 10, maxY = 10, floor = 1, method = 'logdistance') {
    const fingerprints = [];
    
    for (let x = 0; x <= maxX; x += gridSize) {
      for (let y = 0; y <= maxY; y += gridSize) {
        fingerprints.push(this.generateFingerprint(x, y, floor, 5, method));
      }
    }

    return fingerprints;
  }
}

class HeatmapGenerator {
  constructor() {
    this.gaussianKernel = this.createGaussianKernel(5, 2);
  }

  createGaussianKernel(size, sigma) {
    const kernel = [];
    const half = Math.floor(size / 2);
    let sum = 0;

    for (let i = 0; i < size; i++) {
      kernel[i] = [];
      for (let j = 0; j < size; j++) {
        const x = i - half;
        const y = j - half;
        kernel[i][j] = Math.exp(-(x * x + y * y) / (2 * sigma * sigma));
        sum += kernel[i][j];
      }
    }

    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        kernel[i][j] /= sum;
      }
    }

    return kernel;
  }

  generateErrorHeatmap(positions, gridSize = 0.5, maxX = 10, maxY = 10) {
    const gridW = Math.ceil(maxX / gridSize) + 1;
    const gridH = Math.ceil(maxY / gridSize) + 1;
    const errorGrid = Array(gridH).fill(null).map(() => Array(gridW).fill(0));
    const countGrid = Array(gridH).fill(null).map(() => Array(gridW).fill(0));

    positions.forEach(pos => {
      const gx = Math.round(pos.estimatedX / gridSize);
      const gy = Math.round(pos.estimatedY / gridSize);
      const error = Math.sqrt(Math.pow(pos.estimatedX - pos.trueX, 2) + Math.pow(pos.estimatedY - pos.trueY, 2));
      
      if (gx >= 0 && gx < gridW && gy >= 0 && gy < gridH) {
        errorGrid[gy][gx] += error;
        countGrid[gy][gx]++;
      }
    });

    for (let y = 0; y < gridH; y++) {
      for (let x = 0; x < gridW; x++) {
        if (countGrid[y][x] > 0) {
          errorGrid[y][x] /= countGrid[y][x];
        }
      }
    }

    const smoothed = this.applyConvolution(errorGrid, this.gaussianKernel);

    return {
      data: smoothed,
      gridSize,
      maxX,
      maxY,
      gridW,
      gridH,
      maxError: Math.max(...smoothed.flat())
    };
  }

  generateRSSIHeatmap(beaconMac, fingerprints, gridSize = 0.5, maxX = 10, maxY = 10) {
    const gridW = Math.ceil(maxX / gridSize) + 1;
    const gridH = Math.ceil(maxY / gridSize) + 1;
    const rssiGrid = Array(gridH).fill(null).map(() => Array(gridW).fill(null));

    const fpMap = new Map();
    fingerprints.forEach(fp => {
      const key = `${fp.location_x},${fp.location_y}`;
      if (!fpMap.has(key)) fpMap.set(key, new Map());
      if (fp.mac_address === beaconMac) {
        fpMap.get(key).set(beaconMac, fp.rssi_mean);
      }
    });

    const points = [];
    fingerprints.forEach(fp => {
      if (fp.mac_address === beaconMac) {
        points.push({ x: fp.location_x, y: fp.location_y, rssi: fp.rssi_mean });
      }
    });

    for (let gy = 0; gy < gridH; gy++) {
      for (let gx = 0; gx < gridW; gx++) {
        const x = gx * gridSize;
        const y = gy * gridSize;
        
        let weightedSum = 0;
        let weightSum = 0;
        
        points.forEach(p => {
          const dist = Math.sqrt(Math.pow(x - p.x, 2) + Math.pow(y - p.y, 2));
          if (dist < 0.1) {
            weightedSum = p.rssi;
            weightSum = 1;
            return;
          }
          const weight = 1 / Math.pow(dist, 2);
          weightedSum += weight * p.rssi;
          weightSum += weight;
        });

        if (weightSum > 0) {
          rssiGrid[gy][gx] = weightedSum / weightSum;
        }
      }
    }

    let minRSSI = -100, maxRSSI = -30;
    rssiGrid.flat().forEach(v => {
      if (v !== null) {
        minRSSI = Math.min(minRSSI, v);
        maxRSSI = Math.max(maxRSSI, v);
      }
    });

    return {
      data: rssiGrid,
      gridSize,
      maxX,
      maxY,
      gridW,
      gridH,
      minRSSI,
      maxRSSI,
      beaconMac
    };
  }

  applyConvolution(grid, kernel) {
    const h = grid.length;
    const w = grid[0].length;
    const kH = kernel.length;
    const kW = kernel[0].length;
    const kHalfH = Math.floor(kH / 2);
    const kHalfW = Math.floor(kW / 2);
    
    const result = Array(h).fill(null).map(() => Array(w).fill(0));

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0;
        let weightSum = 0;

        for (let ky = 0; ky < kH; ky++) {
          for (let kx = 0; kx < kW; kx++) {
            const py = y + ky - kHalfH;
            const px = x + kx - kHalfW;
            
            if (py >= 0 && py < h && px >= 0 && px < w && grid[py][px] !== null) {
              sum += kernel[ky][kx] * grid[py][px];
              weightSum += kernel[ky][kx];
            }
          }
        }

        result[y][x] = weightSum > 0 ? sum / weightSum : grid[y][x];
      }
    }

    return result;
  }

  generatePNG(heatmap, type = 'error') {
    const { data, gridW, gridH } = heatmap;
    
    const scale = 10;
    const width = gridW * scale;
    const height = gridH * scale;
    
    let pngData = 'P3\n';
    pngData += `${width} ${height}\n`;
    pngData += '255\n';

    for (let y = 0; y < gridH; y++) {
      const rowPixels = [];
      for (let x = 0; x < gridW; x++) {
        const value = data[y][x];
        const [r, g, b] = this.valueToColor(value, type, heatmap);
        
        for (let s = 0; s < scale; s++) {
          rowPixels.push(`${r} ${g} ${b}`);
        }
      }
      
      const rowStr = rowPixels.join(' ') + '\n';
      for (let s = 0; s < scale; s++) {
        pngData += rowStr;
      }
    }

    return pngData;
  }

  valueToColor(value, type, heatmap) {
    if (value === null || isNaN(value)) {
      return [200, 200, 200];
    }

    let normalized;
    if (type === 'error') {
      normalized = Math.min(1, value / Math.max(heatmap.maxError, 0.1));
    } else {
      const { minRSSI, maxRSSI } = heatmap;
      normalized = (value - minRSSI) / (maxRSSI - minRSSI);
      normalized = 1 - Math.max(0, Math.min(1, normalized));
    }

    const hue = (1 - normalized) * 240;
    return this.hslToRgb(hue / 360, 0.8, 0.5);
  }

  hslToRgb(h, s, l) {
    let r, g, b;

    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };

      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }

    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }

  generateJSON(heatmap) {
    return JSON.stringify(heatmap);
  }
}

class ParticleFilterManager {
  constructor() {
    this.filters = new Map();
  }

  getFilter(tagId) {
    if (!this.filters.has(tagId)) {
      this.filters.set(tagId, new ParticleFilter(300, 10, 10));
    }
    return this.filters.get(tagId);
  }

  filter(tagId, rssiData, fingerprints, initialPosition = null) {
    const filter = this.getFilter(tagId);
    return filter.filter(rssiData, fingerprints, initialPosition);
  }

  reset(tagId) {
    this.filters.delete(tagId);
  }

  resetAll() {
    this.filters.clear();
  }
}

module.exports = {
  ParticleFilter,
  ParticleFilterManager,
  AutoFingerprintGenerator,
  HeatmapGenerator
};