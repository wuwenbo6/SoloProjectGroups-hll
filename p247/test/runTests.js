const RTPParser = require('../src/rtpParser');
const MetricsCalculator = require('../src/metricsCalculator');
const AdaptiveJitterBuffer = require('../src/jitterBuffer');
const MOSEstimator = require('../src/mosEstimator');
const AnalysisService = require('../src/analysisService');

const assert = require('assert');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`❌ ${name}`);
    console.log(`   错误: ${error.message}`);
    failed++;
  }
}

function generateTestPackets(count, options = {}) {
  const packets = [];
  const lossRate = options.lossRate || 0;
  const jitterMean = options.jitterMean || 0;
  const clockRate = options.clockRate || 8000;
  const packetIntervalUs = 20000;

  let seqNum = 100;
  let timestamp = 1000000;
  const startTime = Date.now() * 1000;
  const ssrc = 0x12345678;

  for (let i = 0; i < count; i++) {
    if (Math.random() * 100 < lossRate) {
      seqNum = (seqNum + 1) % 65536;
      timestamp = (timestamp + Math.floor(clockRate * packetIntervalUs / 1000000)) % 0xFFFFFFFF;
      continue;
    }

    const jitterUs = (Math.random() - 0.5) * jitterMean * 2000;
    const arrivalTime = startTime + i * packetIntervalUs + jitterUs;

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
    timestamp = (timestamp + Math.floor(clockRate * packetIntervalUs / 1000000)) % 0xFFFFFFFF;
  }

  return packets.sort((a, b) => a.arrivalTime - b.arrivalTime);
}

console.log('🧪 开始运行测试...\n');

console.log('📦 RTP Parser 测试:');
test('RTP Header 解析 - 基本字段', () => {
  const parser = new RTPParser();
  const buffer = Buffer.alloc(12);
  buffer[0] = 0x80;
  buffer[1] = 0x00;
  buffer.writeUInt16BE(1234, 2);
  buffer.writeUInt32BE(5678, 4);
  buffer.writeUInt32BE(0x12345678, 8);

  const header = parser.parseRTPHeader(buffer);

  assert.strictEqual(header.version, 2);
  assert.strictEqual(header.payloadType, 0);
  assert.strictEqual(header.sequenceNumber, 1234);
  assert.strictEqual(header.timestamp, 5678);
  assert.strictEqual(header.ssrc, 0x12345678);
});

test('RTP Header 解析 - Marker位', () => {
  const parser = new RTPParser();
  const buffer = Buffer.alloc(12);
  buffer[0] = 0x80;
  buffer[1] = 0x80;

  const header = parser.parseRTPHeader(buffer);
  assert.strictEqual(header.marker, 1);
});

test('按SSRC分组', () => {
  const parser = new RTPParser();
  const packets = [
    { ssrc: 1, sequenceNumber: 1 },
    { ssrc: 2, sequenceNumber: 1 },
    { ssrc: 1, sequenceNumber: 2 },
    { ssrc: 2, sequenceNumber: 2 }
  ];

  const streams = parser.groupBySSRC(packets);
  assert.strictEqual(streams.size, 2);
  assert.strictEqual(streams.get('1').length, 2);
  assert.strictEqual(streams.get('2').length, 2);
});

console.log('\n📊 Metrics Calculator 测试:');
test('计算丢包率 - 无丢包', () => {
  const calc = new MetricsCalculator();
  const packets = generateTestPackets(100);
  const result = calc.calculatePacketLoss(packets);

  assert.strictEqual(result.lostPackets, 0);
  assert.strictEqual(result.lossRate, 0);
});

test('计算丢包率 - 有丢包', () => {
  const calc = new MetricsCalculator();
  const packets = [];
  for (let i = 0; i < 100; i++) {
    if (i !== 50 && i !== 51) {
      packets.push({
        sequenceNumber: 100 + i,
        arrivalTime: i * 20000,
        timestamp: i * 160,
        ssrc: 1,
        payloadType: 0
      });
    }
  }

  const result = calc.calculatePacketLoss(packets);
  assert.strictEqual(result.lostPackets, 2);
  assert.ok(result.lossRate > 0);
});

test('计算抖动 - 至少2个包', () => {
  const calc = new MetricsCalculator();
  const packets = generateTestPackets(100, { jitterMean: 10 });
  const result = calc.calculateJitter(packets);

  assert.ok(result.jitter >= 0);
  assert.ok(result.jitterMs >= 0);
  assert.ok(result.jitterHistory.length > 0);
});

test('RFC 3550 抖动计算 - D(i)差值法', () => {
  const calc = new MetricsCalculator();
  calc.setClockRate(8000);

  const baseTime = 1000000000;
  const packets = [
    { sequenceNumber: 1, timestamp: 160, arrivalTime: baseTime },
    { sequenceNumber: 2, timestamp: 320, arrivalTime: baseTime + 20000 },
    { sequenceNumber: 3, timestamp: 480, arrivalTime: baseTime + 40000 },
    { sequenceNumber: 4, timestamp: 640, arrivalTime: baseTime + 60000 + 2000 },
  ];

  const result = calc.calculateJitter(packets);

  assert.ok(result.jitterHistory.length === 3);

  for (const h of result.jitterHistory) {
    assert.ok(h.D !== undefined, 'jitterHistory should contain D field');
    assert.ok(h.absD !== undefined, 'jitterHistory should contain absD field');
    assert.ok(h.rfc3550JitterRaw !== undefined, 'jitterHistory should contain rfc3550JitterRaw field');
  }

  assert.ok(result.interarrivalJitter.length === 3);
  for (const ij of result.interarrivalJitter) {
    assert.ok(ij.D !== undefined, 'interarrivalJitter should contain D field');
  }
});

test('RFC 3550 抖动 - 无抖动时D(i)应为0', () => {
  const calc = new MetricsCalculator();
  calc.setClockRate(8000);

  const baseTime = 1000000000;
  const packets = [];
  for (let i = 0; i < 10; i++) {
    packets.push({
      sequenceNumber: i,
      timestamp: i * 160,
      arrivalTime: baseTime + i * 20000
    });
  }

  const result = calc.calculateJitter(packets);

  for (const h of result.jitterHistory) {
    assert.strictEqual(h.D, 0, 'D should be 0 when there is no jitter');
  }
  assert.strictEqual(result.jitterMs, 0, 'jitter should be 0 with perfect timing');
});

test('RFC 3550 抖动 - 带抖动时D(i)非零', () => {
  const calc = new MetricsCalculator();
  calc.setClockRate(8000);

  const baseTime = 1000000000;
  const packets = [
    { sequenceNumber: 1, timestamp: 160, arrivalTime: baseTime },
    { sequenceNumber: 2, timestamp: 320, arrivalTime: baseTime + 22000 },
    { sequenceNumber: 3, timestamp: 480, arrivalTime: baseTime + 38000 },
    { sequenceNumber: 4, timestamp: 640, arrivalTime: baseTime + 62000 },
  ];

  const result = calc.calculateJitter(packets);

  const nonZeroD = result.jitterHistory.filter(h => h.D !== 0);
  assert.ok(nonZeroD.length > 0, 'At least some D values should be non-zero with jitter');
  assert.ok(result.jitterMs > 0, 'jitter should be > 0 with network jitter');
});

test('序列数回绕处理', () => {
  const calc = new MetricsCalculator();
  const packets = [];

  for (let i = 0; i < 50; i++) {
    packets.push({
      sequenceNumber: (65530 + i) % 65536,
      arrivalTime: i * 20000,
      timestamp: i * 160,
      ssrc: 1,
      payloadType: 0
    });
  }

  const result = calc.calculatePacketLoss(packets);
  assert.strictEqual(result.lostPackets, 0);
  assert.strictEqual(result.lossRate, 0);
});

test('乱序包检测 - 乱序包在窗口内到达', () => {
  const calc = new MetricsCalculator();
  const baseTime = 1000000000;

  const packets = [
    { sequenceNumber: 1, arrivalTime: baseTime, timestamp: 160, ssrc: 1, payloadType: 0 },
    { sequenceNumber: 3, arrivalTime: baseTime + 20000, timestamp: 480, ssrc: 1, payloadType: 0 },
    { sequenceNumber: 2, arrivalTime: baseTime + 30000, timestamp: 320, ssrc: 1, payloadType: 0 },
    { sequenceNumber: 4, arrivalTime: baseTime + 60000, timestamp: 640, ssrc: 1, payloadType: 0 },
  ];

  const result = calc.calculatePacketLoss(packets, {
    reorderWindowSize: 16,
    reorderTimeoutMs: 100
  });

  assert.ok(result.reorderedPackets >= 1, 'Should detect at least 1 reordered packet');
  assert.strictEqual(result.reorderWindowSize, 16);
  assert.strictEqual(result.reorderTimeoutMs, 100);
});

test('乱序包检测 - 超时后到达为迟到包', () => {
  const calc = new MetricsCalculator();
  const baseTime = 1000000000;

  const packets = [
    { sequenceNumber: 1, arrivalTime: baseTime, timestamp: 160, ssrc: 1, payloadType: 0 },
    { sequenceNumber: 3, arrivalTime: baseTime + 20000, timestamp: 480, ssrc: 1, payloadType: 0 },
    { sequenceNumber: 4, arrivalTime: baseTime + 40000, timestamp: 640, ssrc: 1, payloadType: 0 },
    { sequenceNumber: 5, arrivalTime: baseTime + 60000, timestamp: 800, ssrc: 1, payloadType: 0 },
    { sequenceNumber: 6, arrivalTime: baseTime + 80000, timestamp: 960, ssrc: 1, payloadType: 0 },
    { sequenceNumber: 7, arrivalTime: baseTime + 100000, timestamp: 1120, ssrc: 1, payloadType: 0 },
    { sequenceNumber: 8, arrivalTime: baseTime + 120000, timestamp: 1280, ssrc: 1, payloadType: 0 },
    { sequenceNumber: 2, arrivalTime: baseTime + 150000, timestamp: 320, ssrc: 1, payloadType: 0 },
  ];

  const result = calc.calculatePacketLoss(packets, {
    reorderWindowSize: 16,
    reorderTimeoutMs: 100
  });

  assert.ok(result.latePackets >= 1, 'Packet 2 arriving after timeout should be counted as late');
});

test('乱序包缓存窗口 - 窗口大小16，超时判丢', () => {
  const calc = new MetricsCalculator();
  const baseTime = 1000000000;

  const packets = [];
  for (let i = 0; i < 30; i++) {
    const seq = i === 5 ? 100 : i;
    packets.push({
      sequenceNumber: seq,
      arrivalTime: baseTime + i * 20000,
      timestamp: i * 160,
      ssrc: 1,
      payloadType: 0
    });
  }

  const result = calc.calculatePacketLoss(packets, {
    reorderWindowSize: 16,
    reorderTimeoutMs: 100
  });

  assert.ok(result.reorderWindowSize === 16);
  assert.ok(typeof result.confirmedLosses === 'number');
});

test('无乱序包时 reorderedPackets 为 0', () => {
  const calc = new MetricsCalculator();
  const packets = generateTestPackets(100);
  const result = calc.calculatePacketLoss(packets, {
    reorderWindowSize: 16,
    reorderTimeoutMs: 100
  });

  assert.strictEqual(result.reorderedPackets, 0);
  assert.strictEqual(result.latePackets, 0);
});

console.log('\n🔄 Jitter Buffer 测试:');
test('Jitter Buffer 初始化', () => {
  const jb = new AdaptiveJitterBuffer({
    initialDelay: 60,
    minDelay: 20,
    maxDelay: 200
  });

  assert.strictEqual(jb.initialDelay, 60);
  assert.strictEqual(jb.currentDelay, 60);
  assert.strictEqual(jb.minDelay, 20);
  assert.strictEqual(jb.maxDelay, 200);
});

test('Jitter Buffer 添加和播放数据包', () => {
  const jb = new AdaptiveJitterBuffer({ initialDelay: 40, minDelay: 20, maxDelay: 100 });
  const packets = generateTestPackets(50);

  for (const packet of packets.slice(0, 5)) {
    const result = jb.addPacket(packet);
    assert.strictEqual(result.action, 'buffered');
  }

  assert.strictEqual(jb.buffer.length, 5);

  const played = jb.getPlaybackPackets(Date.now() * 1000);
  assert.ok(played.length > 0);
});

test('自适应调整延迟', () => {
  const jb = new AdaptiveJitterBuffer({ initialDelay: 60, minDelay: 20, maxDelay: 200 });

  jb.updateJitterEstimate(50);
  assert.ok(jb.currentDelay > 60 || jb.adjustmentHistory.length > 0);
});

test('Jitter Buffer 模拟完整流程', () => {
  const jb = new AdaptiveJitterBuffer({ initialDelay: 60, minDelay: 20, maxDelay: 200 });
  const packets = generateTestPackets(200, { jitterMean: 15, jitterStd: 5 });

  const result = jb.simulate(packets, { jitter: 15 });

  assert.ok(result.finalStats.packetsPlayed > 0);
  assert.ok(result.finalStats.totalPacketsProcessed > 0);
});

console.log('\n🎯 MOS Estimator 测试:');
test('R值到MOS转换 - 完美质量', () => {
  const estimator = new MOSEstimator();
  const mos = estimator.rToMosPrecise(93.2);
  assert.ok(mos > 4.3 && mos <= 4.5);
});

test('R值到MOS转换 - 差质量', () => {
  const estimator = new MOSEstimator();
  const mos = estimator.rToMosPrecise(20);
  assert.ok(mos < 2.0);
});

test('获取编码配置', () => {
  const estimator = new MOSEstimator();

  const codec1 = estimator.getCodecByPayloadType(0);
  assert.ok(codec1.name === 'PCMU' || codec1.name === 'G711');

  const codec2 = estimator.getCodecByPayloadType(8);
  assert.ok(codec2.name === 'PCMA' || codec2.name === 'G711');

  const codec3 = estimator.getCodecByPayloadType(18);
  assert.strictEqual(codec3.name, 'G729');

  const codec4 = estimator.getCodecByName('G729');
  assert.strictEqual(codec4.name, 'G729');
  assert.strictEqual(codec4.payloadType, 18);
});

test('MOS估算 - 好质量', () => {
  const estimator = new MOSEstimator();
  const metrics = {
    lossRate: 0.5,
    jitterMs: 10,
    burstLossCount: 0,
    lossEvents: [],
    totalPackets: 1000,
    dropRate: 0,
    payloadType: 0
  };

  const result = estimator.estimateMOS(metrics);
  assert.ok(result.mos > 3.5);
  assert.ok(result.R > 60);
});

test('MOS估算 - 差质量', () => {
  const estimator = new MOSEstimator();
  const metrics = {
    lossRate: 15,
    jitterMs: 100,
    burstLossCount: 5,
    lossEvents: [{ count: 5 }, { count: 3 }, { count: 4 }],
    totalPackets: 1000,
    dropRate: 2,
    payloadType: 0
  };

  const result = estimator.estimateMOS(metrics);
  assert.ok(result.mos < 3.0);
});

test('获取改进建议', () => {
  const estimator = new MOSEstimator();
  const metrics = {
    lossRate: 3,
    jitterMs: 60,
    dropRate: 1.5,
    underflowCount: 5,
    overflowCount: 3
  };

  const suggestions = estimator.getImprovementSuggestions(metrics, { mos: 3.0 });
  assert.ok(suggestions.length > 0);
});

test('质量等级阈值', () => {
  const estimator = new MOSEstimator();
  const thresholds = estimator.getQualityThresholds();
  assert.strictEqual(thresholds.length, 6);
});

console.log('\n⚙️ Analysis Service 测试:');
test('生成模拟数据', () => {
  const service = new AnalysisService();
  const data = service.generateMockData({
    packetCount: 500,
    lossRate: 2,
    jitterMean: 20,
    jitterStd: 8
  });

  assert.strictEqual(data.rtpPackets.length > 0, true);
  assert.strictEqual(Array.isArray(data.rtcpPackets), true);
});

test('分析流数据', async () => {
  const service = new AnalysisService();
  const data = service.generateMockData({
    packetCount: 300,
    lossRate: 1,
    jitterMean: 15
  });

  const options = {};
  if (data.rtcpPackets.length > 0) {
    options.rtcpSRs = data.rtcpPackets;
  }

  const result = await service.analyzeStream(data.rtpPackets, options);

  assert.ok(result.metrics.totalPackets > 0);
  assert.ok(result.mos.mos >= 1 && result.mos.mos <= 4.5);
  assert.ok(result.jitterBuffer.packetsPlayed > 0);
  assert.ok(Array.isArray(result.suggestions));
});

test('生成时间线数据', () => {
  const service = new AnalysisService();
  const data = service.generateMockData({ packetCount: 200 });

  const lossTimeline = service.generateLossTimeline(data.rtpPackets);
  assert.ok(lossTimeline.length > 0);
});

console.log('\n📈 综合测试:');
test('端到端分析流程', async () => {
  const service = new AnalysisService();
  const data = service.generateMockData({
    packetCount: 500,
    lossRate: 1.5,
    jitterMean: 25,
    jitterStd: 10,
    duration: 30
  });

  const options = {
    initialDelay: 60,
    minDelay: 20,
    maxDelay: 200,
    oneWayDelay: 100
  };
  if (data.rtcpPackets.length > 0) {
    options.rtcpSRs = data.rtcpPackets;
  }

  const result = await service.analyzeStream(data.rtpPackets, options);

  assert.ok(result.metrics.totalPackets > 0);
  assert.ok(result.metrics.lossRate >= 0);
  assert.ok(result.metrics.jitterMs >= 0);
  assert.ok(result.mos.mos >= 1 && result.mos.mos <= 4.5);
  assert.ok(result.jitterBuffer.currentDelay >= 20);
  assert.ok(result.jitterBuffer.currentDelay <= 200);
  assert.ok(Array.isArray(result.metrics.lossTimeline));
  assert.ok(Array.isArray(result.metrics.jitterTimeline));
  assert.ok(Array.isArray(result.jitterBuffer.delayTimeline));
});

console.log('\n🔗 RTCP 同步分析 测试:');
test('RTCP SR 解析 - Sender Report', () => {
  const { RTCPParser } = require('../src/rtcpParser');
  const parser = new RTCPParser();

  const srBuffer = Buffer.alloc(28);
  srBuffer[0] = 0x80;
  srBuffer[1] = 0xC8;
  srBuffer.writeUInt16BE(6, 2);
  srBuffer.writeUInt32BE(0x11111111, 4);
  srBuffer.writeUInt32BE(Math.floor(Date.now() / 1000) + 2208988800, 8);
  srBuffer.writeUInt32BE(0, 12);
  srBuffer.writeUInt32BE(1000, 16);
  srBuffer.writeUInt32BE(500, 20);
  srBuffer.writeUInt32BE(80000, 24);

  const result = parser.parseRTCPPacket(srBuffer);
  assert.strictEqual(result.packetTypeName, 'SR');
  assert.strictEqual(result.ssrc, 0x11111111);
  assert.strictEqual(result.rtpTimestamp, 1000);
  assert.strictEqual(result.senderPacketCount, 500);
  assert.strictEqual(result.senderOctetCount, 80000);
});

test('RTCP 包识别', () => {
  const { RTCPParser } = require('../src/rtcpParser');
  const parser = new RTCPParser();

  const srBuffer = Buffer.alloc(28);
  srBuffer[0] = 0x80;
  srBuffer[1] = 0xC8;
  assert.strictEqual(parser.isRTCP(srBuffer), true);

  const rtpBuffer = Buffer.alloc(12);
  rtpBuffer[0] = 0x80;
  rtpBuffer[1] = 0x00;
  assert.strictEqual(parser.isRTCP(rtpBuffer), false);
});

test('音视频同步偏移计算', () => {
  const { RTCPSynchronizationAnalyzer } = require('../src/rtcpParser');
  const analyzer = new RTCPSynchronizationAnalyzer();

  const baseNtp = Math.floor(Date.now() / 1000) + 2208988800;

  for (let i = 0; i < 5; i++) {
    analyzer.addSRPacket({
      ssrc: 0x11111111,
      packetTypeName: 'SR',
      arrivalTime: i * 5000000,
      ntpTimestampSeconds: baseNtp + i * 5,
      ntpTimestampFraction: 0,
      ntpTimestamp: baseNtp + i * 5,
      rtpTimestamp: i * 40000,
      senderPacketCount: i * 100,
      senderOctetCount: i * 16000
    });

    analyzer.addSRPacket({
      ssrc: 0x22222222,
      packetTypeName: 'SR',
      arrivalTime: i * 5000000 + 30000,
      ntpTimestampSeconds: baseNtp + i * 5,
      ntpTimestampFraction: 0x1CAC0831,
      ntpTimestamp: baseNtp + i * 5 + 0.11,
      rtpTimestamp: i * 270000,
      senderPacketCount: i * 30,
      senderOctetCount: i * 30000
    });
  }

  const result = analyzer.analyzeSynchronization(0x11111111, 0x22222222);
  assert.ok(result.syncPoints.length > 0, 'Should have sync points');
  assert.ok(result.avgOffsetMs !== undefined, 'Should have avg offset');
  assert.ok(result.syncQuality !== undefined, 'Should have sync quality');
});

test('时钟漂移估算', () => {
  const { RTCPSynchronizationAnalyzer } = require('../src/rtcpParser');
  const analyzer = new RTCPSynchronizationAnalyzer();

  const baseNtp = Math.floor(Date.now() / 1000) + 2208988800;

  for (let i = 0; i < 10; i++) {
    const elapsedSec = i * 5;
    const driftPpm = 20;
    const clockRate = 8000;
    const driftOffset = (driftPpm / 1e6) * elapsedSec * clockRate;
    const rtpTs = (elapsedSec * clockRate + driftOffset) >>> 0;

    analyzer.addSRPacket({
      ssrc: 0x11111111,
      packetTypeName: 'SR',
      arrivalTime: i * 5000000,
      ntpTimestampSeconds: baseNtp + elapsedSec,
      ntpTimestampFraction: 0,
      ntpTimestamp: baseNtp + elapsedSec,
      rtpTimestamp: rtpTs,
      senderPacketCount: i * 100,
      senderOctetCount: i * 16000
    });
  }

  const result = analyzer.analyzeStreamClock(0x11111111);
  assert.ok(result.srCount === 10, 'Should have 10 SR packets');
  assert.ok(result.estimatedClockRate > 0, 'Should estimate clock rate');
  assert.ok(typeof result.clockDriftPpm === 'number', 'Should estimate drift');
});

test('AV模拟数据生成', () => {
  const service = new AnalysisService();
  const avData = service.generateAVMockData({
    audioPacketCount: 500,
    videoPacketCount: 150,
    duration: 30,
    syncOffsetMs: 30,
    audioDriftPpm: 0,
    videoDriftPpm: 10
  });

  assert.strictEqual(avData.audio.rtpPackets.length > 0, true);
  assert.strictEqual(avData.video.rtpPackets.length > 0, true);
  assert.strictEqual(avData.audio.rtcpPackets.length > 0, true);
  assert.strictEqual(avData.video.rtcpPackets.length > 0, true);
  assert.strictEqual(typeof avData.audioSSRC, 'number');
  assert.strictEqual(typeof avData.videoSSRC, 'number');
});

console.log('\n' + '='.repeat(50));
console.log(`测试完成: ${passed} 通过, ${failed} 失败`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('\n🎉 所有测试通过！');
}
