const RTPParser = require('./rtpParser');
const MetricsCalculator = require('./metricsCalculator');
const AdaptiveJitterBuffer = require('./jitterBuffer');
const MOSEstimator = require('./mosEstimator');
const { RTCPSynchronizationAnalyzer } = require('./rtcpParser');

class AnalysisService {
  constructor() {
    this.rtpParser = new RTPParser();
    this.metricsCalculator = new MetricsCalculator();
    this.mosEstimator = new MOSEstimator();
    this.rtcpAnalyzer = new RTCPSynchronizationAnalyzer();
  }

  async analyzePCAPFile(filePath, options = {}) {
    try {
      const parseResult = await this.rtpParser.parsePCAPFile(filePath);
      const { rtpPackets, rtcpPackets } = parseResult;

      if (rtpPackets.length === 0) {
        return {
          error: 'No RTP packets found in the pcap file',
          streams: []
        };
      }

      const rtcpSRPackets = rtcpPackets.filter(p => p.packetTypeName === 'SR');
      for (const sr of rtcpSRPackets) {
        this.rtcpAnalyzer.addSRPacket(sr);
      }

      const streams = this.rtpParser.groupBySSRC(rtpPackets);
      const rtcpStreams = this.rtpParser.groupRTCPBySSRC(rtcpPackets);
      const results = [];

      for (const [ssrc, streamPackets] of streams) {
        const streamOptions = { ...options };
        if (rtcpStreams.has(ssrc)) {
          streamOptions.rtcpSRs = rtcpStreams.get(ssrc);
        }
        const streamResult = await this.analyzeStream(streamPackets, streamOptions);
        results.push({
          ssrc,
          ...streamResult
        });
      }

      let syncAnalysis = null;
      if (results.length >= 2) {
        const audioStream = results.find(r => {
          const pt = r.payloadType;
          return pt === 0 || pt === 8 || pt === 9 || pt === 18 || pt === 111;
        });
        const videoStream = results.find(r => {
          const pt = r.payloadType;
          return pt >= 96 && pt <= 127 && pt !== 97 && pt !== 111;
        }) || results.find(r => r !== audioStream);

        if (audioStream && videoStream) {
          syncAnalysis = this.rtcpAnalyzer.analyzeSynchronization(
            audioStream.ssrc,
            videoStream.ssrc
          );
        }
      }

      return {
        totalPackets: rtpPackets.length,
        totalRTCPPackets: rtcpPackets.length,
        totalSRPackets: rtcpSRPackets.length,
        streamCount: streams.size,
        streams: results,
        syncAnalysis
      };
    } catch (error) {
      throw new Error(`PCAP analysis failed: ${error.message}`);
    }
  }

  async analyzeStream(packets, options = {}) {
    const codec = options.codec || this.mosEstimator.getCodecByPayloadType(packets[0]?.payloadType);
    const clockRate = codec.clockRate || 8000;

    this.metricsCalculator.setClockRate(clockRate);

    const metricsOptions = {
      reorderWindowSize: options.reorderWindowSize || 16,
      reorderTimeoutMs: options.reorderTimeoutMs || 100
    };

    const metrics = this.metricsCalculator.calculateAllMetrics(packets, metricsOptions);

    const jitterBuffer = new AdaptiveJitterBuffer({
      initialDelay: options.initialDelay || 60,
      minDelay: options.minDelay || 20,
      maxDelay: options.maxDelay || 200,
      clockRate
    });

    const bufferSimulation = jitterBuffer.simulate(packets, {
      jitter: metrics.jitterMs
    });

    const combinedMetrics = {
      ...metrics,
      ...bufferSimulation.finalStats
    };

    const mosResult = this.mosEstimator.estimateMOS(combinedMetrics, {
      codec,
      oneWayDelay: options.oneWayDelay || 100
    });

    const suggestions = this.mosEstimator.getImprovementSuggestions(combinedMetrics, mosResult);

    const samplePackets = packets.slice(0, 50).map(p => ({
      seqNum: p.sequenceNumber,
      timestamp: p.timestamp,
      ssrc: p.ssrc,
      payloadType: p.payloadType,
      arrivalTime: p.arrivalTime,
      marker: p.marker,
      payloadSize: p.payload?.length || 0
    }));

    const lossTimeline = this.generateLossTimeline(packets);
    const jitterTimeline = this.generateJitterTimeline(metrics);
    const delayTimeline = this.generateDelayTimeline(bufferSimulation);

    let rtcpAnalysis = null;
    if (options.rtcpSRs && options.rtcpSRs.length > 0) {
      rtcpAnalysis = this.analyzeStreamClock(packets[0].ssrc, options.rtcpSRs);
    }

    return {
      packetCount: packets.length,
      ssrc: packets[0]?.ssrc,
      payloadType: packets[0]?.payloadType,
      codec: codec.name,
      clockRate,
      metrics: {
        ...metrics,
        lossTimeline,
        jitterTimeline
      },
      jitterBuffer: {
        ...bufferSimulation.finalStats,
        bufferHistory: bufferSimulation.bufferHistory.slice(0, 500),
        delayTimeline,
        adjustmentHistory: bufferSimulation.adjustmentHistory
      },
      mos: mosResult,
      suggestions,
      samplePackets,
      qualityThresholds: this.mosEstimator.getQualityThresholds(),
      duration: metrics.duration,
      rtcpAnalysis
    };
  }

  analyzeStreamClock(ssrc, rtcpSRs) {
    const analyzer = new RTCPSynchronizationAnalyzer();
    for (const sr of rtcpSRs) {
      analyzer.addSRPacket(sr);
    }
    return analyzer.analyzeStreamClock(ssrc);
  }

  analyzeSynchronization(audioSSRC, videoSSRC, rtcpSRs) {
    const analyzer = new RTCPSynchronizationAnalyzer();
    for (const sr of rtcpSRs) {
      analyzer.addSRPacket(sr);
    }
    return analyzer.analyzeSynchronization(audioSSRC, videoSSRC);
  }

  generateSRPackets(rtpPackets, options = {}) {
    const ssrc = options.ssrc || 0x12345678;
    const srInterval = options.srInterval || 5;
    const clockRate = options.clockRate || 8000;
    const startNtpSeconds = options.startNtpSeconds || Math.floor(Date.now() / 1000) + 2208988800;
    const startRtpTimestamp = options.startRtpTimestamp || 0;
    const driftPpm = options.driftPpm || 0;

    if (rtpPackets.length === 0) return [];

    const srPackets = [];
    const sorted = [...rtpPackets].sort((a, b) => a.arrivalTime - b.arrivalTime);

    const startTimeUs = sorted[0].arrivalTime;
    const endTimeUs = sorted[sorted.length - 1].arrivalTime;
    const durationUs = endTimeUs - startTimeUs;

    const srIntervalUs = srInterval * 1000000;
    let srTime = startTimeUs;
    let pktIdx = 0;

    while (srTime <= endTimeUs) {
      while (pktIdx < sorted.length - 1 && sorted[pktIdx + 1].arrivalTime <= srTime) {
        pktIdx++;
      }

      const elapsedSec = (srTime - startTimeUs) / 1000000;
      const driftOffsetSamples = (driftPpm / 1e6) * elapsedSec * clockRate;

      const ntpSeconds = startNtpSeconds + Math.floor(elapsedSec);
      const ntpFraction = Math.floor((elapsedSec % 1) * 0x100000000);

      const rtpTimestamp = (startRtpTimestamp + Math.floor(elapsedSec * clockRate) + Math.floor(driftOffsetSamples)) >>> 0;

      const packetsUntilNow = pktIdx + 1;
      const octetsUntilNow = packetsUntilNow * (sorted[pktIdx].payload?.length || 160);

      srPackets.push({
        arrivalTime: srTime,
        sourcePort: 10001,
        destPort: 20001,
        version: 2,
        padding: 0,
        rc: 0,
        packetType: 200,
        packetTypeName: 'SR',
        length: 6,
        byteLength: 28,
        ssrc,
        ntpTimestampSeconds: ntpSeconds,
        ntpTimestampFraction: ntpFraction,
        ntpTimestamp: ntpSeconds + ntpFraction / 0x100000000,
        rtpTimestamp,
        senderPacketCount: packetsUntilNow,
        senderOctetCount: octetsUntilNow,
        reports: []
      });

      srTime += srIntervalUs;
    }

    if (srPackets.length < 2 && sorted.length > 0) {
      const elapsedSec = (endTimeUs - startTimeUs) / 1000000;
      const driftOffsetSamples = (driftPpm / 1e6) * elapsedSec * clockRate;
      const ntpSeconds = startNtpSeconds + Math.floor(elapsedSec);
      const ntpFraction = Math.floor((elapsedSec % 1) * 0x100000000);
      const rtpTimestamp = (startRtpTimestamp + Math.floor(elapsedSec * clockRate) + Math.floor(driftOffsetSamples)) >>> 0;

      srPackets.push({
        arrivalTime: endTimeUs,
        sourcePort: 10001,
        destPort: 20001,
        version: 2,
        padding: 0,
        rc: 0,
        packetType: 200,
        packetTypeName: 'SR',
        length: 6,
        byteLength: 28,
        ssrc,
        ntpTimestampSeconds: ntpSeconds,
        ntpTimestampFraction: ntpFraction,
        ntpTimestamp: ntpSeconds + ntpFraction / 0x100000000,
        rtpTimestamp,
        senderPacketCount: sorted.length,
        senderOctetCount: sorted.length * (sorted[sorted.length - 1].payload?.length || 160),
        reports: []
      });
    }

    return srPackets;
  }

  generateLossTimeline(packets) {
    if (packets.length < 10) return [];

    const sorted = [...packets].sort((a, b) => a.arrivalTime - b.arrivalTime);
    const chunkSize = Math.max(10, Math.floor(sorted.length / 50));
    const timeline = [];

    for (let i = 0; i < sorted.length; i += chunkSize) {
      const chunk = sorted.slice(i, i + chunkSize);
      const seqNumbers = chunk.map(p => p.sequenceNumber).sort((a, b) => a - b);

      let expected = seqNumbers[0];
      let lost = 0;

      for (const seq of seqNumbers) {
        while (expected !== seq) {
          lost++;
          expected = (expected + 1) % 65536;
        }
        expected = (expected + 1) % 65536;
      }

      const lossRate = chunk.length > 0 ? (lost / (lost + chunk.length)) * 100 : 0;

      timeline.push({
        time: chunk[0].arrivalTime,
        packetCount: chunk.length,
        lostPackets: lost,
        lossRate
      });
    }

    return timeline;
  }

  generateJitterTimeline(metrics) {
    if (!metrics.jitterHistory || metrics.jitterHistory.length === 0) return [];

    const history = metrics.jitterHistory;
    const sampleRate = Math.max(1, Math.floor(history.length / 100));

    return history
      .filter((_, i) => i % sampleRate === 0)
      .map(h => ({
        packetIndex: h.packetIndex,
        seqNum: h.seqNum,
        jitterMs: h.jitterMs
      }));
  }

  generateDelayTimeline(bufferSimulation) {
    if (!bufferSimulation.delayHistory || bufferSimulation.delayHistory.length === 0) return [];

    const history = bufferSimulation.delayHistory;
    const sampleRate = Math.max(1, Math.floor(history.length / 100));

    return history
      .filter((_, i) => i % sampleRate === 0)
      .map(h => ({
        timestamp: h.timestamp,
        delay: h.delay
      }));
  }

  generateMockData(options = {}) {
    const packetCount = options.packetCount || 1000;
    const lossRate = options.lossRate || 1;
    const jitterMean = options.jitterMean || 15;
    const jitterStd = options.jitterStd || 5;
    const duration = options.duration || 60;
    const reorderRate = options.reorderRate || 0;
    const includeRTCP = options.includeRTCP !== false;
    const driftPpm = options.driftPpm || 0;
    const audioVideoSyncOffsetMs = options.audioVideoSyncOffsetMs || 0;

    const packets = [];
    const startTime = Date.now() * 1000;
    const packetInterval = (duration * 1000000) / packetCount;
    const clockRate = 8000;
    const timestampInterval = Math.floor(clockRate * packetInterval / 1000000);

    let seqNum = Math.floor(Math.random() * 1000);
    let timestamp = Math.floor(Math.random() * 1000000);
    const ssrc = 0x12345678;

    for (let i = 0; i < packetCount; i++) {
      if (Math.random() * 100 < lossRate) {
        seqNum = (seqNum + 1) % 65536;
        timestamp = (timestamp + timestampInterval) % 0xFFFFFFFF;
        continue;
      }

      const jitterVariation = this.gaussianRandom(jitterMean, jitterStd);
      const arrivalTime = startTime + Math.floor(i * packetInterval + jitterVariation * 1000);

      packets.push({
        arrivalTime,
        sequenceNumber: seqNum,
        timestamp,
        ssrc,
        payloadType: 0,
        marker: i % 50 === 0,
        version: 2,
        padding: 0,
        extension: 0,
        csrcCount: 0,
        headerLength: 12,
        payload: Buffer.alloc(160),
        sourcePort: 10000,
        destPort: 20000
      });

      seqNum = (seqNum + 1) % 65536;
      timestamp = (timestamp + timestampInterval) % 0xFFFFFFFF;
    }

    if (reorderRate > 0 && packets.length > 3) {
      const reorderCount = Math.floor(packets.length * reorderRate / 100);
      const reorderIndices = new Set();

      for (let r = 0; r < reorderCount; r++) {
        const idx = 1 + Math.floor(Math.random() * (packets.length - 2));
        reorderIndices.add(idx);
      }

      for (const idx of reorderIndices) {
        const swapDist = 1 + Math.floor(Math.random() * 3);
        const swapIdx = Math.min(idx + swapDist, packets.length - 1);

        const tempArrival = packets[idx].arrivalTime;
        packets[idx].arrivalTime = packets[swapIdx].arrivalTime;
        packets[swapIdx].arrivalTime = tempArrival;
      }

      packets.sort((a, b) => a.arrivalTime - b.arrivalTime);
    }

    let rtcpSRs = [];
    if (includeRTCP && packets.length > 10) {
      rtcpSRs = this.generateSRPackets(packets, {
        ssrc,
        clockRate,
        driftPpm,
        startRtpTimestamp: packets[0].timestamp,
        startNtpSeconds: options.startNtpSeconds,
        srInterval: Math.max(1, duration / 10)
      });
    }

    return { rtpPackets: packets, rtcpPackets: rtcpSRs };
  }

  generateAVMockData(options = {}) {
    const audioPacketCount = options.audioPacketCount || 1000;
    const videoPacketCount = options.videoPacketCount || 300;
    const duration = options.duration || 60;
    const syncOffsetMs = options.syncOffsetMs || 0;
    const audioDrift = options.audioDriftPpm || 0;
    const videoDrift = options.videoDriftPpm || 10;

    const sharedNtpBase = Math.floor(Date.now() / 1000) + 2208988800;

    const audioOptions = {
      ...options,
      packetCount: audioPacketCount,
      duration,
      includeRTCP: true,
      driftPpm: audioDrift,
      payloadType: 0,
      startNtpSeconds: sharedNtpBase
    };

    const videoOptions = {
      ...options,
      packetCount: videoPacketCount,
      duration,
      includeRTCP: true,
      driftPpm: videoDrift,
      payloadType: 96,
      startNtpSeconds: sharedNtpBase
    };

    const audioData = this.generateMockData(audioOptions);
    const videoData = this.generateMockData(videoOptions);

    const audioSSRC = 0x11111111;
    const videoSSRC = 0x22222222;

    for (const p of audioData.rtpPackets) {
      p.ssrc = audioSSRC;
    }
    for (const p of videoData.rtpPackets) {
      p.ssrc = videoSSRC;
      p.payloadType = 96;
      if (syncOffsetMs !== 0) {
        p.arrivalTime += Math.floor(syncOffsetMs * 1000);
      }
    }

    for (const sr of audioData.rtcpPackets) {
      sr.ssrc = audioSSRC;
    }
    for (const sr of videoData.rtcpPackets) {
      sr.ssrc = videoSSRC;
      if (syncOffsetMs !== 0) {
        sr.arrivalTime += Math.floor(syncOffsetMs * 1000);
        const ntpOffsetSec = syncOffsetMs / 1000;
        const newNtpTimestamp = sr.ntpTimestamp + ntpOffsetSec;
        const newNtpSeconds = Math.floor(newNtpTimestamp);
        const newNtpFraction = Math.floor((newNtpTimestamp - newNtpSeconds) * 0x100000000);
        sr.ntpTimestampSeconds = newNtpSeconds;
        sr.ntpTimestampFraction = newNtpFraction;
        sr.ntpTimestamp = newNtpTimestamp;
      }
    }

    return {
      audio: audioData,
      video: videoData,
      audioSSRC,
      videoSSRC,
      syncOffsetMs
    };
  }

  gaussianRandom(mean, std) {
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z * std;
  }
}

module.exports = AnalysisService;
