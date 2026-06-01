class AdaptiveJitterBuffer {
  constructor(options = {}) {
    this.initialDelay = options.initialDelay || 60;
    this.minDelay = options.minDelay || 20;
    this.maxDelay = options.maxDelay || 200;
    this.targetBufferLevel = options.targetBufferLevel || 0.75;
    this.adjustmentThreshold = options.adjustmentThreshold || 10;
    this.clockRate = options.clockRate || 8000;
    this.maxJitterMultiplier = options.maxJitterMultiplier || 3;

    this.buffer = [];
    this.currentDelay = this.initialDelay;
    this.lastPlaybackTime = null;
    this.bufferHistory = [];
    this.adjustmentHistory = [];
    this.underflowCount = 0;
    this.overflowCount = 0;
    this.totalPacketsProcessed = 0;
    this.packetsPlayed = 0;
    this.packetsDropped = 0;
    this.jitterEstimate = 0;
    this.delayHistory = [];
  }

  setClockRate(clockRate) {
    this.clockRate = clockRate;
  }

  calculateOptimalDelay(currentJitter) {
    const jitterBasedDelay = currentJitter * this.maxJitterMultiplier;
    let optimalDelay = Math.max(this.minDelay, Math.min(this.maxDelay, jitterBasedDelay));

    const bufferLevel = this.buffer.length > 0
      ? this.buffer.length / Math.max(1, Math.ceil(this.currentDelay / 20))
      : 0;

    if (bufferLevel > this.targetBufferLevel * 1.5) {
      optimalDelay = Math.max(this.minDelay, optimalDelay * 0.8);
    } else if (bufferLevel < this.targetBufferLevel * 0.5 && this.underflowCount > 0) {
      optimalDelay = Math.min(this.maxDelay, optimalDelay * 1.2);
    }

    return optimalDelay;
  }

  adjustDelay(newDelay) {
    const diff = newDelay - this.currentDelay;

    if (Math.abs(diff) >= this.adjustmentThreshold) {
      const oldDelay = this.currentDelay;
      const adjustment = diff > 0
        ? Math.min(diff, this.adjustmentThreshold * 2)
        : Math.max(diff, -this.adjustmentThreshold * 2);

      this.currentDelay = Math.max(
        this.minDelay,
        Math.min(this.maxDelay, this.currentDelay + adjustment)
      );

      this.adjustmentHistory.push({
        timestamp: Date.now(),
        oldDelay,
        newDelay: this.currentDelay,
        reason: diff > 0 ? 'increase' : 'decrease',
        bufferLevel: this.buffer.length,
        jitter: this.jitterEstimate
      });

      return true;
    }
    return false;
  }

  addPacket(packet) {
    this.totalPacketsProcessed++;

    const maxBufferSize = Math.ceil(this.currentDelay / 20) * 3;

    if (this.buffer.length >= maxBufferSize) {
      this.overflowCount++;
      this.packetsDropped++;
      this.adjustDelay(this.calculateOptimalDelay(this.jitterEstimate) * 0.9);
      return { action: 'dropped', reason: 'overflow' };
    }

    const insertIndex = this.findInsertIndex(packet.sequenceNumber);

    if (insertIndex >= 0 && insertIndex < this.buffer.length) {
      if (this.buffer[insertIndex].sequenceNumber === packet.sequenceNumber) {
        return { action: 'duplicate' };
      }
    }

    if (insertIndex === 0 && this.buffer.length > 0) {
      const seqDiff = this.calculateSeqDiff(packet.sequenceNumber, this.buffer[0].sequenceNumber);
      if (seqDiff < -50) {
        this.packetsDropped++;
        return { action: 'dropped', reason: 'late' };
      }
    }

    this.buffer.splice(Math.max(0, insertIndex), 0, {
      ...packet,
      insertedAt: process.hrtime.bigint ? process.hrtime.bigint() : Date.now()
    });

    return { action: 'buffered', bufferSize: this.buffer.length };
  }

  findInsertIndex(seqNum) {
    if (this.buffer.length === 0) return 0;

    let low = 0;
    let high = this.buffer.length - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const diff = this.calculateSeqDiff(seqNum, this.buffer[mid].sequenceNumber);

      if (diff === 0) return mid;
      if (diff > 0) low = mid + 1;
      else high = mid - 1;
    }

    return low;
  }

  calculateSeqDiff(a, b) {
    const diff = a - b;
    if (diff > 32768) return diff - 65536;
    if (diff < -32768) return diff + 65536;
    return diff;
  }

  getPlaybackPackets(playbackTimeUs) {
    const packetsToPlay = [];
    const expectedBufferSize = Math.ceil(this.currentDelay / 20);

    while (this.buffer.length > expectedBufferSize) {
      const packet = this.buffer.shift();
      packetsToPlay.push(packet);
      this.packetsPlayed++;
    }

    if (packetsToPlay.length === 0 && this.buffer.length > 0) {
      const packet = this.buffer.shift();
      packetsToPlay.push(packet);
      this.packetsPlayed++;
    }

    if (this.buffer.length === 0) {
      this.underflowCount++;
    }

    this.bufferHistory.push({
      timestamp: playbackTimeUs,
      bufferSize: this.buffer.length,
      currentDelay: this.currentDelay,
      underflow: this.buffer.length === 0
    });

    this.delayHistory.push({
      timestamp: playbackTimeUs,
      delay: this.currentDelay
    });

    return packetsToPlay;
  }

  updateJitterEstimate(jitterMs) {
    this.jitterEstimate = jitterMs;
    const optimalDelay = this.calculateOptimalDelay(jitterMs);
    this.adjustDelay(optimalDelay);
  }

  simulate(packets, options = {}) {
    const results = [];
    const sortedPackets = [...packets].sort((a, b) => a.arrivalTime - b.arrivalTime);

    if (sortedPackets.length < 2) {
      return {
        bufferEvents: [],
        finalStats: this.getStats()
      };
    }

    const startTime = sortedPackets[0].arrivalTime;
    const endTime = sortedPackets[sortedPackets.length - 1].arrivalTime;
    const playbackInterval = 20000;

    let packetIndex = 0;
    let jitterUpdateCounter = 0;
    let currentTime = startTime;

    for (; currentTime <= endTime + this.currentDelay * 1000; currentTime += playbackInterval) {
      while (packetIndex < sortedPackets.length && sortedPackets[packetIndex].arrivalTime <= currentTime) {
        const result = this.addPacket(sortedPackets[packetIndex]);
        results.push({
          type: 'arrival',
          time: currentTime,
          seqNum: sortedPackets[packetIndex].sequenceNumber,
          ...result
        });
        packetIndex++;
      }

      const played = this.getPlaybackPackets(currentTime);
      if (played.length > 0) {
        results.push({
          type: 'playback',
          time: currentTime,
          count: played.length,
          seqNums: played.map(p => p.sequenceNumber)
        });
      }

      jitterUpdateCounter++;
      if (jitterUpdateCounter % 5 === 0 && options.jitter !== undefined) {
        this.updateJitterEstimate(options.jitter);
      }
    }

    while (this.buffer.length > 0) {
      const played = this.getPlaybackPackets(currentTime);
      if (played.length > 0) {
        results.push({
          type: 'playback',
          time: currentTime,
          count: played.length,
          seqNums: played.map(p => p.sequenceNumber)
        });
      }
      currentTime += playbackInterval;
    }

    return {
      bufferEvents: results,
      bufferHistory: this.bufferHistory,
      adjustmentHistory: this.adjustmentHistory,
      delayHistory: this.delayHistory,
      finalStats: this.getStats()
    };
  }

  getStats() {
    const avgBufferLevel = this.bufferHistory.length > 0
      ? this.bufferHistory.reduce((sum, h) => sum + h.bufferSize, 0) / this.bufferHistory.length
      : 0;

    const bufferLevelVariance = this.bufferHistory.length > 0
      ? this.bufferHistory.reduce((sum, h) => sum + Math.pow(h.bufferSize - avgBufferLevel, 2), 0) / this.bufferHistory.length
      : 0;

    return {
      currentDelay: this.currentDelay,
      initialDelay: this.initialDelay,
      minDelay: this.minDelay,
      maxDelay: this.maxDelay,
      underflowCount: this.underflowCount,
      overflowCount: this.overflowCount,
      totalPacketsProcessed: this.totalPacketsProcessed,
      packetsPlayed: this.packetsPlayed,
      packetsDropped: this.packetsDropped,
      dropRate: this.totalPacketsProcessed > 0
        ? (this.packetsDropped / this.totalPacketsProcessed) * 100
        : 0,
      avgBufferLevel,
      bufferLevelStdDev: Math.sqrt(bufferLevelVariance),
      adjustmentCount: this.adjustmentHistory.length,
      delayAdjustments: this.adjustmentHistory.slice(-10)
    };
  }
}

module.exports = AdaptiveJitterBuffer;
