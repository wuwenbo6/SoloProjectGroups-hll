class MetricsCalculator {
  constructor() {
    this.clockRate = 8000;
  }

  setClockRate(clockRate) {
    this.clockRate = clockRate;
  }

  calculateSeqDiff(a, b) {
    const diff = a - b;
    if (diff > 32768) return diff - 65536;
    if (diff < -32768) return diff + 65536;
    return diff;
  }

  calculatePacketLoss(packets, options = {}) {
    const reorderWindowSize = options.reorderWindowSize || 16;
    const reorderTimeoutMs = options.reorderTimeoutMs || 100;

    if (packets.length === 0) {
      return {
        totalPackets: 0,
        lostPackets: 0,
        lossRate: 0,
        lossEvents: [],
        reorderedPackets: 0,
        latePackets: 0
      };
    }

    const sorted = [...packets].sort((a, b) => a.arrivalTime - b.arrivalTime);

    const receivedSeqs = new Set();
    for (const p of sorted) {
      receivedSeqs.add(p.sequenceNumber);
    }

    let expectedCount = 1;
    let maxSeq = sorted[0].sequenceNumber;

    for (let i = 1; i < sorted.length; i++) {
      const seqDiff = this.calculateSeqDiff(sorted[i].sequenceNumber, maxSeq);
      if (seqDiff > 0) {
        expectedCount += seqDiff;
        maxSeq = sorted[i].sequenceNumber;
      }
    }

    const lostPackets = expectedCount - sorted.length;
    const lossRate = expectedCount > 0 ? (lostPackets / expectedCount) * 100 : 0;

    const { reorderedPackets, latePackets, confirmedLosses } = this._detectLossWithReorderWindow(
      sorted,
      reorderWindowSize,
      reorderTimeoutMs
    );

    const lossEvents = [];
    let currentLoss = 0;
    let lossStart = -1;
    const firstSeq = sorted[0].sequenceNumber;
    const lastSeq = maxSeq;

    for (let expected = firstSeq; ; expected = (expected + 1) % 65536) {
      if (!receivedSeqs.has(expected)) {
        if (currentLoss === 0) {
          lossStart = expected;
        }
        currentLoss++;
      } else {
        if (currentLoss > 0) {
          lossEvents.push({
            startSeq: lossStart,
            endSeq: (expected - 1 + 65536) % 65536,
            count: currentLoss
          });
          currentLoss = 0;
        }
      }
      if (expected === lastSeq) break;
    }

    if (currentLoss > 0) {
      lossEvents.push({
        startSeq: lossStart,
        endSeq: lastSeq,
        count: currentLoss
      });
    }

    return {
      totalPackets: sorted.length,
      expectedCount,
      lostPackets,
      lossRate: Math.min(lossRate, 100),
      lossEvents,
      burstLossCount: lossEvents.filter(e => e.count >= 3).length,
      averageBurstLength: lossEvents.length > 0
        ? lossEvents.reduce((sum, e) => sum + e.count, 0) / lossEvents.length
        : 0,
      reorderedPackets,
      latePackets,
      reorderWindowSize,
      reorderTimeoutMs,
      confirmedLosses
    };
  }

  _detectLossWithReorderWindow(sortedPackets, windowSize, timeoutMs) {
    let reorderedPackets = 0;
    let latePackets = 0;
    let confirmedLosses = 0;

    if (sortedPackets.length < 2) {
      return { reorderedPackets, latePackets, confirmedLosses };
    }

    const pendingGaps = new Map();
    let maxSeq = sortedPackets[0].sequenceNumber;

    for (let i = 0; i < sortedPackets.length; i++) {
      const pkt = sortedPackets[i];
      const seq = pkt.sequenceNumber;
      const seqDiff = this.calculateSeqDiff(seq, maxSeq);

      if (seqDiff > 0) {
        const newGaps = [];
        for (let s = (maxSeq + 1) % 65536; s !== seq; s = (s + 1) % 65536) {
          if (!pendingGaps.has(s)) {
            newGaps.push(s);
          }
        }
        maxSeq = seq;

        const keysToDelete = [];
        for (const [gapSeq, gapInfo] of pendingGaps) {
          gapInfo.packetsSinceDetection++;
          const timeSinceDetection = (pkt.arrivalTime - gapInfo.detectedAtTime) / 1000;
          if (gapInfo.packetsSinceDetection >= windowSize || timeSinceDetection > timeoutMs) {
            confirmedLosses++;
            keysToDelete.push(gapSeq);
          }
        }
        for (const key of keysToDelete) {
          pendingGaps.delete(key);
        }

        for (const s of newGaps) {
          if (!pendingGaps.has(s)) {
            pendingGaps.set(s, {
              seqNum: s,
              detectedAtTime: pkt.arrivalTime,
              packetsSinceDetection: 0
            });
          }
        }
      } else if (seqDiff < 0) {
        if (pendingGaps.has(seq)) {
          const gap = pendingGaps.get(seq);
          const delayMs = (pkt.arrivalTime - gap.detectedAtTime) / 1000;

          if (delayMs <= timeoutMs) {
            reorderedPackets++;
          } else {
            latePackets++;
          }
          pendingGaps.delete(seq);
        } else {
          reorderedPackets++;
        }
      }
    }

    return { reorderedPackets, latePackets, confirmedLosses };
  }

  calculateJitter(packets) {
    if (packets.length < 2) {
      return { jitter: 0, jitterMs: 0, jitterHistory: [], interarrivalJitter: [] };
    }

    const sorted = [...packets].sort((a, b) => a.arrivalTime - b.arrivalTime);

    const jitterHistory = [];
    const interarrivalJitter = [];
    let jitter = 0;

    let prevS = null;
    let prevR = null;

    for (let i = 0; i < sorted.length; i++) {
      const pkt = sorted[i];

      const S = pkt.timestamp;

      const R = Math.floor(pkt.arrivalTime * this.clockRate / 1000000);

      if (prevS !== null && prevR !== null) {
        let dS = S - prevS;
        if (dS > 0x7FFFFFFF) dS -= 0x100000000;
        if (dS < -0x7FFFFFFF) dS += 0x100000000;

        const dR = R - prevR;

        const D = dR - dS;

        jitter += (Math.abs(D) - jitter) / 16;

        interarrivalJitter.push({
          packetIndex: i,
          seqNum: pkt.sequenceNumber,
          arrivalTime: pkt.arrivalTime,
          D: D,
          absD: Math.abs(D),
          smoothedJitter: jitter
        });

        jitterHistory.push({
          packetIndex: i,
          seqNum: pkt.sequenceNumber,
          jitter: jitter / this.clockRate,
          jitterMs: (jitter / this.clockRate) * 1000,
          D: D,
          absD: Math.abs(D),
          rfc3550JitterRaw: jitter
        });
      }

      prevS = S;
      prevR = R;
    }

    const jitterSec = jitter / this.clockRate;
    const jitterMs = jitterSec * 1000;
    const jitterValues = jitterHistory.map(j => j.jitter);
    const jitterMsValues = jitterHistory.map(j => j.jitterMs);

    return {
      jitter: jitterSec,
      jitterMs,
      maxJitter: jitterValues.length > 0 ? Math.max(...jitterValues) : 0,
      maxJitterMs: jitterMsValues.length > 0 ? Math.max(...jitterMsValues) : 0,
      avgJitter: jitterValues.length > 0
        ? jitterValues.reduce((a, b) => a + b, 0) / jitterValues.length
        : 0,
      avgJitterMs: jitterMsValues.length > 0
        ? jitterMsValues.reduce((a, b) => a + b, 0) / jitterMsValues.length
        : 0,
      jitterHistory,
      interarrivalJitter
    };
  }

  calculateAllMetrics(packets, options = {}) {
    const lossMetrics = this.calculatePacketLoss(packets, options);
    const jitterMetrics = this.calculateJitter(packets);

    return {
      ...lossMetrics,
      ...jitterMetrics,
      ssrc: packets.length > 0 ? packets[0].ssrc : null,
      payloadType: packets.length > 0 ? packets[0].payloadType : null,
      duration: packets.length > 1
        ? (packets[packets.length - 1].arrivalTime - packets[0].arrivalTime) / 1000000
        : 0
    };
  }
}

module.exports = MetricsCalculator;
