class RTCPParser {
  constructor() {
    this.RTCP_PACKET_TYPES = {
      200: 'SR',
      201: 'RR',
      202: 'SDES',
      203: 'BYE',
      204: 'APP'
    };
  }

  isRTCP(buffer) {
    if (buffer.length < 8) return false;

    const version = (buffer[0] >> 6) & 0x03;
    const packetType = buffer[1];

    return version === 2 && packetType >= 200 && packetType <= 223;
  }

  parseRTCPPacket(buffer) {
    if (!this.isRTCP(buffer)) return null;

    const version = (buffer[0] >> 6) & 0x03;
    const padding = (buffer[0] >> 5) & 0x01;
    const rc = buffer[0] & 0x1f;
    const packetType = buffer[1];
    const length = buffer.readUInt16BE(2);

    const packet = {
      version,
      padding,
      rc,
      packetType,
      packetTypeName: this.RTCP_PACKET_TYPES[packetType] || 'UNKNOWN',
      length,
      byteLength: (length + 1) * 4
    };

    if (packetType === 200 && buffer.length >= 28) {
      return this.parseSR(buffer, packet);
    } else if (packetType === 201 && buffer.length >= 8) {
      return this.parseRR(buffer, packet);
    }

    return packet;
  }

  parseSR(buffer, basePacket) {
    let offset = 4;

    const ssrc = buffer.readUInt32BE(offset);
    offset += 4;

    const ntpTimestampSeconds = buffer.readUInt32BE(offset);
    offset += 4;
    const ntpTimestampFraction = buffer.readUInt32BE(offset);
    offset += 4;

    const ntpTimestamp = ntpTimestampSeconds + ntpTimestampFraction / 0x100000000;

    const rtpTimestamp = buffer.readUInt32BE(offset);
    offset += 4;

    const senderPacketCount = buffer.readUInt32BE(offset);
    offset += 4;

    const senderOctetCount = buffer.readUInt32BE(offset);
    offset += 4;

    const wallClockTime = this.ntpToWallClock(ntpTimestampSeconds, ntpTimestampFraction);

    const sr = {
      ...basePacket,
      ssrc,
      ntpTimestampSeconds,
      ntpTimestampFraction,
      ntpTimestamp,
      rtpTimestamp,
      senderPacketCount,
      senderOctetCount,
      wallClockTime,
      reports: []
    };

    const rc = basePacket.rc;
    for (let i = 0; i < rc && offset + 24 <= buffer.length; i++) {
      const report = this.parseReceiverReport(buffer, offset);
      sr.reports.push(report);
      offset += 24;
    }

    return sr;
  }

  parseRR(buffer, basePacket) {
    let offset = 4;

    const ssrc = buffer.readUInt32BE(offset);
    offset += 4;

    const rr = {
      ...basePacket,
      ssrc,
      reports: []
    };

    const rc = basePacket.rc;
    for (let i = 0; i < rc && offset + 24 <= buffer.length; i++) {
      const report = this.parseReceiverReport(buffer, offset);
      rr.reports.push(report);
      offset += 24;
    }

    return rr;
  }

  parseReceiverReport(buffer, offset) {
    return {
      ssrc: buffer.readUInt32BE(offset),
      fractionLost: (buffer[offset + 4] >> 2) & 0x3f,
      packetsLost: this.readInt24BE(buffer, offset + 5),
      highestSeqReceived: buffer.readUInt32BE(offset + 8),
      jitter: buffer.readUInt32BE(offset + 12),
      lastSR: buffer.readUInt32BE(offset + 16),
      delaySinceLastSR: buffer.readUInt32BE(offset + 20)
    };
  }

  readInt24BE(buffer, offset) {
    const value = (buffer[offset] << 16) | (buffer[offset + 1] << 8) | buffer[offset + 2];
    if (value & 0x800000) {
      return value - 0x1000000;
    }
    return value;
  }

  ntpToWallClock(ntpSeconds, ntpFraction) {
    const ntpEpoch = Date.UTC(1900, 0, 1, 0, 0, 0);
    const unixSeconds = ntpSeconds - 2208988800;
    const milliseconds = unixSeconds * 1000 + (ntpFraction / 0x100000000) * 1000;
    return new Date(ntpEpoch + milliseconds * 1000 + 2208988800000);
  }

  ntpToUnixMs(ntpSeconds, ntpFraction) {
    const unixSeconds = ntpSeconds - 2208988800;
    return unixSeconds * 1000 + (ntpFraction / 0x100000000) * 1000;
  }

  parsePCAPFile(filePath) {
    const pcapParser = require('pcap-parser');
    const fs = require('fs');

    return new Promise((resolve, reject) => {
      const rtcpPackets = [];
      const parser = pcapParser.parse(filePath);

      parser.on('packet', (packet) => {
        const rtcpInfo = this.extractRTCPFromPacket(packet);
        if (rtcpInfo) {
          rtcpPackets.push(rtcpInfo);
        }
      });

      parser.on('end', () => {
        resolve(rtcpPackets);
      });

      parser.on('error', (err) => {
        reject(err);
      });
    });
  }

  extractRTCPFromPacket(packet) {
    const packetData = packet.data;
    if (packetData.length < 14) return null;

    const etherType = packetData.readUInt16BE(12);
    let ipStart = 14;

    if (etherType === 0x8100 && packetData.length >= 18) {
      ipStart = 18;
    }

    if (packetData.length < ipStart + 20) return null;

    const ipVersion = (packetData[ipStart] >> 4) & 0x0f;
    if (ipVersion !== 4) return null;

    const ihl = packetData[ipStart] & 0x0f;
    const ipHeaderLength = ihl * 4;
    const protocol = packetData[ipStart + 9];

    if (protocol !== 17) return null;

    const udpStart = ipStart + ipHeaderLength;

    if (packetData.length < udpStart + 8) return null;

    const sourcePort = packetData.readUInt16BE(udpStart);
    const destPort = packetData.readUInt16BE(udpStart + 2);
    const udpLength = packetData.readUInt16BE(udpStart + 4);

    const rtcpPayload = packetData.slice(udpStart + 8, udpStart + 8 + udpLength - 8);

    const rtcpPacket = this.parseRTCPPacket(rtcpPayload);
    if (!rtcpPacket) return null;

    const arrivalTime = packet.header.timestampSeconds * 1000000 + packet.header.timestampMicroseconds;

    return {
      arrivalTime,
      sourcePort,
      destPort,
      ...rtcpPacket
    };
  }
}

class RTCPSynchronizationAnalyzer {
  constructor() {
    this.srStreams = new Map();
  }

  addSRPacket(srPacket) {
    const ssrcKey = srPacket.ssrc.toString();
    if (!this.srStreams.has(ssrcKey)) {
      this.srStreams.set(ssrcKey, []);
    }
    this.srStreams.get(ssrcKey).push(srPacket);
  }

  analyzeSynchronization(audioSSRC, videoSSRC) {
    const audioSRs = this.srStreams.get(audioSSRC.toString()) || [];
    const videoSRs = this.srStreams.get(videoSSRC.toString()) || [];

    if (audioSRs.length === 0 || videoSRs.length === 0) {
      return { error: 'Insufficient SR packets for synchronization analysis' };
    }

    const audioMappings = this._buildTimestampMappings(audioSRs);
    const videoMappings = this._buildTimestampMappings(videoSRs);

    if (audioMappings.length === 0 || videoMappings.length === 0) {
      return { error: 'No valid timestamp mappings found' };
    }

    const syncAnalysis = this._calculateSyncOffset(audioMappings, videoMappings);
    const driftAnalysis = this._calculateClockDrift(audioMappings, videoMappings);

    return {
      audioSSRC,
      videoSSRC,
      audioSRCount: audioSRs.length,
      videoSRCount: videoSRs.length,
      ...syncAnalysis,
      ...driftAnalysis,
      audioMappings: audioMappings.slice(0, 100),
      videoMappings: videoMappings.slice(0, 100)
    };
  }

  analyzeStreamClock(ssrc) {
    const srs = this.srStreams.get(ssrc.toString()) || [];

    if (srs.length < 2) {
      return { error: 'Need at least 2 SR packets for clock analysis' };
    }

    const mappings = this._buildTimestampMappings(srs);
    const clockRate = this._estimateClockRate(mappings);
    const drift = this._estimateDrift(mappings);
    const offsetHistory = this._buildOffsetHistory(mappings);

    return {
      ssrc,
      srCount: srs.length,
      estimatedClockRate: clockRate,
      clockDriftPpm: drift,
      offsetHistory,
      mappings: mappings.slice(0, 100)
    };
  }

  _buildTimestampMappings(srPackets) {
    const mappings = [];
    const sorted = [...srPackets].sort((a, b) => a.arrivalTime - b.arrivalTime);

    for (const sr of sorted) {
      if (sr.packetTypeName === 'SR') {
        const unixMs = this._ntpToUnixMs(sr.ntpTimestampSeconds, sr.ntpTimestampFraction);

        mappings.push({
          arrivalTime: sr.arrivalTime,
          ntpTimestamp: sr.ntpTimestamp,
          ntpSeconds: sr.ntpTimestampSeconds,
          ntpFraction: sr.ntpTimestampFraction,
          rtpTimestamp: sr.rtpTimestamp,
          unixMs,
          senderPacketCount: sr.senderPacketCount,
          senderOctetCount: sr.senderOctetCount
        });
      }
    }

    return mappings;
  }

  _ntpToUnixMs(ntpSeconds, ntpFraction) {
    const unixSeconds = ntpSeconds - 2208988800;
    return unixSeconds * 1000 + (ntpFraction / 0x100000000) * 1000;
  }

  _calculateSyncOffset(audioMappings, videoMappings) {
    const offsets = [];
    const syncPoints = [];

    for (const audioMap of audioMappings) {
      let closestVideo = null;
      let minDiff = Infinity;

      for (const videoMap of videoMappings) {
        const diff = Math.abs(audioMap.unixMs - videoMap.unixMs);
        if (diff < minDiff && diff < 1000) {
          minDiff = diff;
          closestVideo = videoMap;
        }
      }

      if (closestVideo) {
        const ntpDiffMs = audioMap.unixMs - closestVideo.unixMs;

        offsets.push(ntpDiffMs);
        syncPoints.push({
          audioNtpMs: audioMap.unixMs,
          videoNtpMs: closestVideo.unixMs,
          audioRtp: audioMap.rtpTimestamp,
          videoRtp: closestVideo.rtpTimestamp,
          offsetMs: ntpDiffMs,
          timeDiffMs: minDiff
        });
      }
    }

    if (offsets.length === 0) {
      return { offsets: [], syncPoints: [] };
    }

    const avgOffset = offsets.reduce((a, b) => a + b, 0) / offsets.length;
    const variance = offsets.reduce((sum, o) => sum + Math.pow(o - avgOffset, 2), 0) / offsets.length;
    const stdDev = Math.sqrt(variance);
    const maxOffset = Math.max(...offsets.map(Math.abs));

    const sortedOffsets = [...offsets].sort((a, b) => a - b);
    const medianOffset = sortedOffsets.length % 2 === 0
      ? (sortedOffsets[sortedOffsets.length / 2 - 1] + sortedOffsets[sortedOffsets.length / 2]) / 2
      : sortedOffsets[Math.floor(sortedOffsets.length / 2)];

    let syncQuality = 'unknown';
    if (maxOffset < 20) syncQuality = 'excellent';
    else if (maxOffset < 45) syncQuality = 'good';
    else if (maxOffset < 90) syncQuality = 'fair';
    else if (maxOffset < 180) syncQuality = 'poor';
    else syncQuality = 'bad';

    return {
      syncPoints,
      avgOffsetMs: avgOffset,
      medianOffsetMs: medianOffset,
      stdDevMs: stdDev,
      maxOffsetMs: maxOffset,
      minOffsetMs: Math.min(...offsets),
      syncQuality,
      sampleCount: offsets.length
    };
  }

  _calculateClockDrift(audioMappings, videoMappings) {
    if (audioMappings.length < 2 || videoMappings.length < 2) {
      return {};
    }

    const audioDrift = this._estimateDrift(audioMappings);
    const videoDrift = this._estimateDrift(videoMappings);
    const relativeDrift = audioDrift - videoDrift;

    return {
      audioClockDriftPpm: audioDrift,
      videoClockDriftPpm: videoDrift,
      relativeDriftPpm: relativeDrift
    };
  }

  _estimateClockRate(mappings) {
    if (mappings.length < 2) return 0;

    const first = mappings[0];
    const last = mappings[mappings.length - 1];

    const timeSpanMs = last.unixMs - first.unixMs;
    const rtpSpan = last.rtpTimestamp - first.rtpTimestamp;

    if (timeSpanMs <= 0) return 0;

    let adjustedRtpSpan = rtpSpan;
    if (rtpSpan < -0x7FFFFFFF) {
      adjustedRtpSpan = rtpSpan + 0x100000000;
    }

    return Math.round(adjustedRtpSpan * 1000 / timeSpanMs);
  }

  _estimateDrift(mappings) {
    if (mappings.length < 3) return 0;

    const slopes = [];
    for (let i = 1; i < mappings.length; i++) {
      const prev = mappings[i - 1];
      const curr = mappings[i];

      const dNtp = curr.unixMs - prev.unixMs;
      let dRtp = curr.rtpTimestamp - prev.rtpTimestamp;

      if (dRtp < -0x7FFFFFFF) {
        dRtp += 0x100000000;
      }

      if (dNtp > 0 && Math.abs(dNtp) < 60000) {
        const ratio = dRtp / dNtp;
        slopes.push(ratio);
      }
    }

    if (slopes.length < 2) return 0;

    const avgRatio = slopes.reduce((a, b) => a + b, 0) / slopes.length;
    const expectedRatio = 8;

    const driftPpm = ((avgRatio - expectedRatio) / expectedRatio) * 1e6;

    return driftPpm;
  }

  _buildOffsetHistory(mappings) {
    const history = [];
    for (let i = 0; i < mappings.length; i++) {
      const map = mappings[i];
      let cumulativeOffset = 0;

      if (i > 0) {
        const first = mappings[0];
        const dNtp = map.unixMs - first.unixMs;
        let dRtp = map.rtpTimestamp - first.rtpTimestamp;

        if (dRtp < -0x7FFFFFFF) {
          dRtp += 0x100000000;
        }

        const expectedRtp = dNtp * 8;
        cumulativeOffset = dRtp - expectedRtp;
      }

      history.push({
        ntpMs: map.unixMs,
        rtpTimestamp: map.rtpTimestamp,
        offsetSamples: cumulativeOffset,
        offsetMs: cumulativeOffset / 8
      });
    }
    return history;
  }

  getAllStreams() {
    const result = [];
    for (const [ssrc, packets] of this.srStreams) {
      result.push({
        ssrc: parseInt(ssrc),
        packetCount: packets.length,
        firstPacket: packets[0]?.arrivalTime,
        lastPacket: packets[packets.length - 1]?.arrivalTime
      });
    }
    return result;
  }
}

module.exports = { RTCPParser, RTCPSynchronizationAnalyzer };
