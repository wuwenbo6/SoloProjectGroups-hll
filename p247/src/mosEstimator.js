class MOSEstimator {
  constructor() {
    this.codecProfiles = {
      'PCMU': { bpl: 0.5, Ie: 0, Ipl: 25, offset: 0, clockRate: 8000, payloadType: 0 },
      'PCMA': { bpl: 0.5, Ie: 0, Ipl: 25, offset: 0, clockRate: 8000, payloadType: 8 },
      'G729': { bpl: 1.5, Ie: 10, Ipl: 16, offset: 0, clockRate: 8000, payloadType: 18 },
      'G723.1': { bpl: 7, Ie: 15, Ipl: 12, offset: 0, clockRate: 8000, payloadType: 4 },
      'G722': { bpl: 0.3, Ie: 0, Ipl: 20, offset: 0, clockRate: 16000, payloadType: 9 },
      'AMR': { bpl: 1.2, Ie: 5, Ipl: 20, offset: 0, clockRate: 8000, payloadType: 96 },
      'AMR-WB': { bpl: 1.2, Ie: 2, Ipl: 18, offset: 0, clockRate: 16000, payloadType: 97 },
      'G711': { bpl: 0.5, Ie: 0, Ipl: 25, offset: 0, clockRate: 8000, payloadType: [0, 8] },
      'OPUS': { bpl: 1.0, Ie: 2, Ipl: 18, offset: 0, clockRate: 48000, payloadType: 111 }
    };
  }

  getCodecByPayloadType(payloadType) {
    for (const [name, profile] of Object.entries(this.codecProfiles)) {
      if (Array.isArray(profile.payloadType)) {
        if (profile.payloadType.includes(payloadType)) {
          return { name, ...profile };
        }
      } else if (profile.payloadType === payloadType) {
        return { name, ...profile };
      }
    }
    return { name: 'Unknown', bpl: 1.0, Ie: 5, Ipl: 20, offset: 0, clockRate: 8000 };
  }

  getCodecByName(codecName) {
    const profile = this.codecProfiles[codecName] || this.codecProfiles['PCMU'];
    return { name: codecName, ...profile };
  }

  calculateEtsiBurstGap(lossEvents, totalPackets) {
    if (lossEvents.length === 0) return 0;

    const averageBurstLength = lossEvents.reduce((sum, e) => sum + e.count, 0) / lossEvents.length;
    const meanGapLength = (totalPackets - lossEvents.reduce((sum, e) => sum + e.count, 0)) / Math.max(1, lossEvents.length);

    return averageBurstLength / (1 + meanGapLength);
  }

  calculateRFactor(metrics, options = {}) {
    const codec = options.codec || this.getCodecByPayloadType(metrics.payloadType);
    const lossRate = Math.max(0, Math.min(100, metrics.lossRate || 0));
    const jitterMs = Math.max(0, metrics.jitterMs || 0);
    const burstLossCount = metrics.burstLossCount || 0;
    const lossEvents = metrics.lossEvents || [];
    const totalPackets = metrics.totalPackets || 1;
    const dropRate = metrics.dropRate || 0;

    let effectiveLossRate = lossRate + dropRate * 0.5;
    if (burstLossCount > 0) {
      const burstPenalty = Math.min(burstLossCount * 0.5, 5);
      effectiveLossRate += burstPenalty;
    }

    const pBurst = this.calculateEtsiBurstGap(lossEvents, totalPackets);

    const Ie = codec.Ie;
    const Ipl = codec.Ipl;
    const bpl = codec.bpl;

    const IeEff = Ie + (1 - Math.exp(-lossRate / bpl)) * (Ipl - Ie) * (1 / (1 + pBurst));

    let Idd = 0;
    if (jitterMs > 10) {
      Idd = 0.1 * Math.max(0, jitterMs - 10);
    }

    const T = options.oneWayDelay || 100;
    let Id = 0;
    if (T < 150) {
      Id = 0.025 * T;
    } else if (T < 400) {
      Id = 0.025 * 150 + 0.1 * (T - 150);
    } else {
      Id = 0.025 * 150 + 0.1 * 250 + 0.5 * (T - 400);
    }

    const Iq = options.quantizationNoise || 0;
    const Is = options.equipmentImpairment || 0;
    const A = options.advantageFactor || 0;

    const R = 93.2 - Math.min(Id, 85) - IeEff - Idd - Iq - Is + A;

    return {
      R: Math.max(0, Math.min(100, R)),
      Id,
      IeEff,
      Idd,
      Iq,
      Is,
      A,
      pBurst,
      effectiveLossRate,
      codec: codec.name,
      parameters: {
        lossRate,
        jitterMs,
        burstLossCount,
        dropRate,
        oneWayDelay: T
      }
    };
  }

  rToMos(R) {
    if (R >= 80) {
      return 4.5;
    } else if (R >= 70) {
      return 4.0 + (R - 70) * 0.05;
    } else if (R >= 60) {
      return 3.6 + (R - 60) * 0.04;
    } else if (R >= 50) {
      return 3.1 + (R - 50) * 0.05;
    } else if (R >= 40) {
      return 2.6 + (R - 40) * 0.05;
    } else if (R >= 30) {
      return 2.1 + (R - 30) * 0.05;
    } else if (R >= 20) {
      return 1.7 + (R - 20) * 0.04;
    } else if (R >= 10) {
      return 1.3 + (R - 10) * 0.04;
    } else if (R > 0) {
      return 1.0 + R * 0.03;
    } else {
      return 1.0;
    }
  }

  rToMosPrecise(R) {
    const clampedR = Math.max(0, Math.min(100, R));

    if (clampedR < 0) return 1;
    if (clampedR > 100) return 4.5;

    const mos = 1 + 0.035 * clampedR + clampedR * (clampedR - 60) * (100 - clampedR) * 0.000007;

    return Math.max(1, Math.min(4.5, mos));
  }

  estimateMOS(metrics, options = {}) {
    const rResult = this.calculateRFactor(metrics, options);
    const mosValue = this.rToMosPrecise(rResult.R);

    let qualityLevel;
    if (mosValue >= 4.34) qualityLevel = 'excellent';
    else if (mosValue >= 4.03) qualityLevel = 'good';
    else if (mosValue >= 3.60) qualityLevel = 'fair';
    else if (mosValue >= 3.10) qualityLevel = 'poor';
    else if (mosValue >= 2.58) qualityLevel = 'bad';
    else qualityLevel = 'very_bad';

    let recommendation;
    if (mosValue >= 4.0) {
      recommendation = '语音质量优秀，适合商业通话';
    } else if (mosValue >= 3.5) {
      recommendation = '语音质量良好，大多数用户满意';
    } else if (mosValue >= 3.0) {
      recommendation = '语音质量一般，建议检查网络状况';
    } else if (mosValue >= 2.5) {
      recommendation = '语音质量较差，会影响通话体验';
    } else {
      recommendation = '语音质量很差，无法正常通话';
    }

    return {
      mos: mosValue,
      mosRounded: Math.round(mosValue * 100) / 100,
      R: rResult.R,
      qualityLevel,
      recommendation,
      details: rResult,
      components: {
        delayImpairment: rResult.Id,
        packetLossImpairment: rResult.IeEff,
        jitterImpairment: rResult.Idd,
        totalImpairment: rResult.Id + rResult.IeEff + rResult.Idd
      }
    };
  }

  getQualityThresholds() {
    return [
      { level: 'excellent', minMos: 4.34, description: '完美，几乎没有失真' },
      { level: 'good', minMos: 4.03, description: '良好，只有非常灵敏的用户能察觉' },
      { level: 'fair', minMos: 3.60, description: '一般，多数用户满意' },
      { level: 'poor', minMos: 3.10, description: '较差，所有用户都能察觉' },
      { level: 'bad', minMos: 2.58, description: '很差，令人烦恼' },
      { level: 'very_bad', minMos: 1.0, description: '极差，无法正常沟通' }
    ];
  }

  getImprovementSuggestions(metrics, mosResult) {
    const suggestions = [];
    const lossRate = metrics.lossRate || 0;
    const jitterMs = metrics.jitterMs || 0;
    const dropRate = metrics.dropRate || 0;

    if (lossRate > 2) {
      suggestions.push({
        type: 'loss',
        severity: 'high',
        message: `丢包率过高 (${lossRate.toFixed(2)}%)，建议检查网络链路和QoS配置`,
        action: '优化网络路由，增加带宽，或启用FEC/ARQ'
      });
    } else if (lossRate > 0.5) {
      suggestions.push({
        type: 'loss',
        severity: 'medium',
        message: `存在轻微丢包 (${lossRate.toFixed(2)}%)`,
        action: '建议监控网络质量，考虑启用丢包隐藏机制'
      });
    }

    if (jitterMs > 50) {
      suggestions.push({
        type: 'jitter',
        severity: 'high',
        message: `抖动过大 (${jitterMs.toFixed(2)}ms)，严重影响通话质量`,
        action: '建议增加jitter buffer大小，或使用抖动更小的传输路径'
      });
    } else if (jitterMs > 20) {
      suggestions.push({
        type: 'jitter',
        severity: 'medium',
        message: `存在中等抖动 (${jitterMs.toFixed(2)}ms)`,
        action: '建议微调jitter buffer参数以平衡延迟和抖动'
      });
    }

    if (dropRate > 1) {
      suggestions.push({
        type: 'buffer',
        severity: 'high',
        message: `jitter buffer丢包率过高 (${dropRate.toFixed(2)}%)`,
        action: '建议增加jitter buffer最大延迟，或优化自适应调整算法'
      });
    }

    if (metrics.underflowCount > 0 && metrics.overflowCount > 0) {
      suggestions.push({
        type: 'buffer',
        severity: 'medium',
        message: 'jitter buffer同时存在下溢和上溢',
        action: '建议调整初始buffer大小，使用更平滑的自适应算法'
      });
    }

    return suggestions;
  }
}

module.exports = MOSEstimator;
