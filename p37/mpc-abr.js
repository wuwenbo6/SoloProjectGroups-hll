class MPCABR {
  constructor(options = {}) {
    this.horizon = options.horizon || 5;
    this.bufferMin = options.bufferMin || 5;
    this.bufferMax = options.bufferMax || 30;
    this.lookbackWindow = options.lookbackWindow || 10;
    this.throughputHistory = [];
    this.bufferHistory = [];
    this.segmentDuration = options.segmentDuration || 2;
    this.lastThroughput = 0;
    this.currentBitrate = 0;
    this.bitrates = [];
  }

  setBitrates(bitrates) {
    this.bitrates = bitrates.sort((a, b) => a - b);
  }

  updateThroughput(throughputBps, segmentDuration = 2) {
    this.throughputHistory.push({
      throughput: throughputBps,
      timestamp: Date.now(),
      duration: segmentDuration
    });

    if (this.throughputHistory.length > this.lookbackWindow) {
      this.throughputHistory.shift();
    }

    this.lastThroughput = this.getHarmonicMeanThroughput();
  }

  getHarmonicMeanThroughput() {
    if (this.throughputHistory.length === 0) return 1000000;

    let sum = 0;
    for (const entry of this.throughputHistory) {
      sum += 1 / entry.throughput;
    }

    return this.throughputHistory.length / sum;
  }

  getPredictedThroughput() {
    if (this.throughputHistory.length < 2) {
      return this.lastThroughput || 1000000;
    }

    const recent = this.throughputHistory.slice(-5);
    const x = recent.map((_, i) => i);
    const y = recent.map(e => e.throughput);

    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
    const sumX2 = x.reduce((a, b) => a + b * b, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    const prediction = Math.max(
      this.bitrates[0] * 1.5,
      intercept + slope * (n + this.horizon / 2)
    );

    return Math.min(prediction, this.lastThroughput * 1.5);
  }

  predictBufferLevel(startBuffer, bitrate, throughput, segmentDuration) {
    const downloadTime = (bitrate * segmentDuration) / (8 * throughput);
    return Math.max(0, startBuffer - downloadTime + segmentDuration);
  }

  calculateRebufferProbability(buffer, bitrate, throughput) {
    const downloadTime = (bitrate * this.segmentDuration) / (8 * throughput);
    if (buffer < downloadTime) {
      return 1 - (buffer / downloadTime);
    }
    return 0;
  }

  calculateQualityScore(bitrate) {
    const index = this.bitrates.indexOf(bitrate);
    if (index === -1) return 0;
    return index / (this.bitrates.length - 1);
  }

  calculateSwitchCost(currentBitrate, nextBitrate) {
    if (currentBitrate === 0) return 0;
    const diff = Math.abs(nextBitrate - currentBitrate);
    const maxDiff = this.bitrates[this.bitrates.length - 1] - this.bitrates[0];
    return 0.3 * (diff / maxDiff);
  }

  calculateBufferPenalty(buffer) {
    if (buffer < this.bufferMin) {
      return 0.5 * Math.pow(1 - buffer / this.bufferMin, 2);
    }
    if (buffer > this.bufferMax) {
      return 0.1;
    }
    return 0;
  }

  selectOptimalBitrate(currentBuffer, currentBitrate = null) {
    if (this.bitrates.length === 0) {
      return null;
    }

    const predictedThroughput = this.getPredictedThroughput();
    const currentBr = currentBitrate || this.bitrates[0];

    let bestBitrate = this.bitrates[0];
    let bestScore = -Infinity;

    for (const bitrate of this.bitrates) {
      const totalScore = this.evaluateBitrateTrajectory(
        bitrate,
        currentBuffer,
        currentBr,
        predictedThroughput
      );

      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestBitrate = bitrate;
      }
    }

    this.currentBitrate = bestBitrate;
    return bestBitrate;
  }

  evaluateBitrateTrajectory(initialBitrate, initialBuffer, currentBitrate, throughput) {
    let totalScore = 0;
    let currentBuffer = initialBuffer;
    let prevBitrate = currentBitrate;
    const alpha = 0.8;
    const beta = 0.15;
    const gamma = 0.05;

    for (let t = 0; t < this.horizon; t++) {
      const bitrate = initialBitrate;

      const qualityScore = this.calculateQualityScore(bitrate);
      const switchCost = t === 0 ? this.calculateSwitchCost(prevBitrate, bitrate) : 0;
      const rebufferProb = this.calculateRebufferProbability(currentBuffer, bitrate, throughput);
      const bufferPenalty = this.calculateBufferPenalty(currentBuffer);

      const stepScore = alpha * qualityScore - beta * switchCost - gamma * (rebufferProb + bufferPenalty);
      totalScore += stepScore * Math.pow(0.95, t);

      currentBuffer = this.predictBufferLevel(currentBuffer, bitrate, throughput, this.segmentDuration);
      prevBitrate = bitrate;

      if (currentBuffer <= 0) {
        totalScore -= 5;
        break;
      }
    }

    return totalScore;
  }

  updateBuffer(bufferLevel) {
    this.bufferHistory.push({
      buffer: bufferLevel,
      timestamp: Date.now()
    });

    if (this.bufferHistory.length > this.lookbackWindow) {
      this.bufferHistory.shift();
    }
  }

  getNextBitrate(bufferLevel, currentBitrate = null) {
    this.updateBuffer(bufferLevel);
    return this.selectOptimalBitrate(bufferLevel, currentBitrate);
  }

  getState() {
    return {
      bitrates: this.bitrates,
      lastThroughput: this.lastThroughput,
      predictedThroughput: this.getPredictedThroughput(),
      throughputHistory: this.throughputHistory,
      bufferHistory: this.bufferHistory,
      horizon: this.horizon,
 bufferMin: this.bufferMin,
 bufferMax: this.bufferMax,
      currentBitrate: this.currentBitrate
    };
  }

  reset() {
    this.throughputHistory = [];
    this.bufferHistory = [];
    this.lastThroughput = 0;
    this.currentBitrate = 0;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MPCABR;
}
