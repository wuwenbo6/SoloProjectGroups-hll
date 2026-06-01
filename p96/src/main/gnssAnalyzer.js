const EventEmitter = require('events');
const { spawn } = require('child_process');
const path = require('path');

class MultiAntennaDirectionFinder {
  constructor() {
    this.antennaPositions = [
      { id: 0, x: 0, y: 0, z: 0 },
      { id: 1, x: 0.15, y: 0, z: 0 },
      { id: 2, x: 0, y: 0.15, z: 0 },
      { id: 3, x: 0.075, y: 0.075, z: 0.1 }
    ];
    
    this.phaseDifferenceHistory = new Map();
    this.doaEstimates = new Map();
    this.wavelength = 0.1903;
    
    this.config = {
      aoaThreshold: 15,
      doaStabilityThreshold: 5,
      maxHistorySize: 50
    };
  }

  initSatellite(prn) {
    this.phaseDifferenceHistory.set(prn, []);
    this.doaEstimates.set(prn, []);
  }

  calculatePhaseDifference(antenna1, antenna2, carrierPhase1, carrierPhase2) {
    const baseDistance = Math.sqrt(
      Math.pow(antenna2.x - antenna1.x, 2) +
      Math.pow(antenna2.y - antenna1.y, 2) +
      Math.pow(antenna2.z - antenna1.z, 2)
    );
    
    let phaseDiff = carrierPhase2 - carrierPhase1;
    while (phaseDiff > Math.PI) phaseDiff -= 2 * Math.PI;
    while (phaseDiff < -Math.PI) phaseDiff += 2 * Math.PI;
    
    return {
      phaseDiff,
      baseDistance,
      theoreticalMax: (2 * Math.PI * baseDistance) / this.wavelength
    };
  }

  estimateAoA(prn, carrierPhases) {
    const history = this.phaseDifferenceHistory.get(prn);
    if (!history) return null;

    if (carrierPhases && carrierPhases.length >= 2) {
      const pd01 = this.calculatePhaseDifference(
        this.antennaPositions[0],
        this.antennaPositions[1],
        carrierPhases[0],
        carrierPhases[1]
      );
      
      const pd02 = this.calculatePhaseDifference(
        this.antennaPositions[0],
        this.antennaPositions[2],
        carrierPhases[0],
        carrierPhases[2]
      );

      const azimuth = Math.atan2(pd02.phaseDiff, pd01.phaseDiff) * (180 / Math.PI);
      const elevation = Math.acos(Math.min(1, Math.abs(pd01.phaseDiff / pd01.theoreticalMax))) * (180 / Math.PI);

      history.push({
        azimuth: (azimuth + 360) % 360,
        elevation: Math.max(0, Math.min(90, elevation)),
        timestamp: Date.now(),
        pd01: pd01.phaseDiff,
        pd02: pd02.phaseDiff
      });

      if (history.length > this.config.maxHistorySize) {
        history.shift();
      }
    }

    return this.calculateStableDoA(prn);
  }

  calculateStableDoA(prn) {
    const history = this.phaseDifferenceHistory.get(prn);
    if (!history || history.length < 10) return null;

    const recent = history.slice(-10);
    
    const avgAzimuth = this.circularAverage(recent.map(d => d.azimuth));
    const avgElevation = recent.reduce((sum, d) => sum + d.elevation, 0) / recent.length;
    
    const azVariance = this.circularVariance(recent.map(d => d.azimuth));
    const elVariance = recent.reduce((sum, d) => sum + Math.pow(d.elevation - avgElevation, 2), 0) / recent.length;

    const doaData = {
      azimuth: avgAzimuth,
      elevation: avgElevation,
      azimuthVariance: azVariance,
      elevationVariance: elVariance,
      stability: 1 - Math.min(1, (azVariance + elVariance) / 100)
    };

    const estimates = this.doaEstimates.get(prn);
    estimates.push(doaData);
    if (estimates.length > 20) estimates.shift();

    return doaData;
  }

  circularAverage(angles) {
    let sumSin = 0, sumCos = 0;
    angles.forEach(angle => {
      const rad = angle * Math.PI / 180;
      sumSin += Math.sin(rad);
      sumCos += Math.cos(rad);
    });
    return Math.atan2(sumSin / angles.length, sumCos / angles.length) * 180 / Math.PI;
  }

  circularVariance(angles) {
    const avg = this.circularAverage(angles) * Math.PI / 180;
    let variance = 0;
    angles.forEach(angle => {
      const rad = angle * Math.PI / 180;
      let diff = Math.abs(rad - avg);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      variance += diff * diff;
    });
    return variance / angles.length * (180 / Math.PI) * (180 / Math.PI);
  }

  detectDoAAnomaly(prn, expectedAzimuth, expectedElevation) {
    const doa = this.calculateStableDoA(prn);
    if (!doa) return { anomaly: false };

    const azDiff = Math.abs(doa.azimuth - expectedAzimuth);
    const elDiff = Math.abs(doa.elevation - expectedElevation);
    const angularError = Math.sqrt(azDiff * azDiff + elDiff * elDiff);

    const anomalies = [];
    
    if (angularError > this.config.aoaThreshold) {
      anomalies.push({
        type: 'doa_mismatch',
        severity: angularError > 30 ? 'high' : 'medium',
        confidence: Math.min(1, angularError / 50),
        description: `到达角偏差 ${angularError.toFixed(1)}°，期望方位 ${expectedAzimuth.toFixed(1)}°，实测 ${doa.azimuth.toFixed(1)}°`
      });
    }

    if (doa.stability > 0.98) {
      anomalies.push({
        type: 'unnatural_doa_stability',
        severity: 'high',
        confidence: doa.stability,
        description: `信号到达角异常稳定 (${(doa.stability * 100).toFixed(1)}%)，可能为模拟信号`
      });
    }

    return {
      anomaly: anomalies.length > 0,
      anomalies,
      doa,
      angularError
    };
  }
}

class SignalAuthenticator {
  constructor() {
    this.authState = new Map();
    this.smuHistory = new Map();
    
    this.config = {
      nmaWindowSize: 30,
      smuThreshold: 0.1,
      consistencyThreshold: 0.9
    };
  }

  initSatellite(prn) {
    this.authState.set(prn, {
      lastSubframeTime: 0,
      subframeCount: 0,
      expectedParity: null,
      smuDetected: false,
      authScore: 1.0,
      nmaBits: []
    });
    this.smuHistory.set(prn, []);
  }

  verifyCivilianSignal(prn, signalData) {
    const state = this.authState.get(prn);
    if (!state) return { authentic: true, score: 1.0 };

    const checks = [];

    const parityCheck = this.verifyParity(signalData);
    checks.push({
      name: '奇偶校验',
      pass: parityCheck.pass,
      confidence: parityCheck.confidence
    });

    const smuCheck = this.detectSpoofedMessageUnit(prn, signalData);
    checks.push({
      name: 'SMU检测',
      pass: !smuCheck.detected,
      confidence: smuCheck.confidence
    });

    const timingCheck = this.verifyTimingConsistency(prn, signalData);
    checks.push({
      name: '时序一致性',
      pass: timingCheck.consistent,
      confidence: timingCheck.confidence
    });

    const nmaCheck = this.verifyNMA(prn, signalData);
    checks.push({
      name: 'NMA认证',
      pass: nmaCheck.pass || nmaCheck.notApplicable,
      confidence: nmaCheck.confidence,
      note: nmaCheck.note
    });

    const overallScore = checks.reduce((sum, c) => sum + c.confidence, 0) / checks.length;
    const allPass = checks.every(c => c.pass);

    state.authScore = state.authScore * 0.7 + overallScore * 0.3;

    return {
      authentic: allPass && state.authScore > 0.7,
      score: state.authScore,
      checks,
      warnings: checks.filter(c => !c.pass).map(c => c.name),
      details: {
        parityErrorRate: parityCheck.errorRate,
        smuSuspicion: smuCheck.suspicionLevel,
        timingJitter: timingCheck.jitter
      }
    };
  }

  verifyParity(signalData) {
    if (!signalData.navBits || signalData.navBits.length < 30) {
      return { pass: true, confidence: 0.5, errorRate: 0 };
    }

    let errorCount = 0;
    const totalWords = Math.floor(signalData.navBits.length / 30);
    
    for (let i = 0; i < totalWords; i++) {
      const word = signalData.navBits.slice(i * 30, (i + 1) * 30);
      if (!this.checkGPSParity(word)) {
        errorCount++;
      }
    }

    const errorRate = totalWords > 0 ? errorCount / totalWords : 0;
    
    return {
      pass: errorRate < 0.1,
      confidence: Math.max(0.3, 1 - errorRate * 2),
      errorRate
    };
  }

  checkGPSParity(bits) {
    if (bits.length !== 30) return true;
    
    const d = bits.slice(0, 24);
    const parity = bits.slice(24, 30);
    
    const computed = this.calculateGPSParity(d);
    
    let matchCount = 0;
    for (let i = 0; i < 6; i++) {
      if (Math.abs(parity[i] - computed[i]) < 0.5) matchCount++;
    }
    
    return matchCount >= 5;
  }

  calculateGPSParity(d) {
    const p = new Array(6);
    p[0] = d[0] ^ d[1] ^ d[2] ^ d[4] ^ d[5] ^ d[9] ^ d[10] ^ d[11] ^ d[12] ^ d[13] ^ d[16] ^ d[17] ^ d[19] ^ d[20] ^ d[22];
    p[1] = d[1] ^ d[2] ^ d[3] ^ d[5] ^ d[6] ^ d[10] ^ d[11] ^ d[12] ^ d[13] ^ d[14] ^ d[17] ^ d[18] ^ d[20] ^ d[21] ^ d[23];
    p[2] = d[0] ^ d[2] ^ d[3] ^ d[4] ^ d[6] ^ d[7] ^ d[11] ^ d[12] ^ d[13] ^ d[14] ^ d[15] ^ d[18] ^ d[19] ^ d[21] ^ d[22];
    p[3] = d[1] ^ d[3] ^ d[4] ^ d[5] ^ d[7] ^ d[8] ^ d[12] ^ d[13] ^ d[14] ^ d[15] ^ d[16] ^ d[19] ^ d[20] ^ d[22] ^ d[23];
    p[4] = d[0] ^ d[2] ^ d[4] ^ d[5] ^ d[6] ^ d[8] ^ d[9] ^ d[13] ^ d[14] ^ d[15] ^ d[16] ^ d[17] ^ d[20] ^ d[21] ^ d[23];
    p[5] = d[2] ^ d[4] ^ d[5] ^ d[7] ^ d[8] ^ d[9] ^ d[10] ^ d[12] ^ d[14] ^ d[18] ^ d[21] ^ d[22] ^ d[23];
    return p;
  }

  detectSpoofedMessageUnit(prn, signalData) {
    const history = this.smuHistory.get(prn);
    if (!history) return { detected: false, confidence: 1.0, suspicionLevel: 0 };

    if (signalData.navBits) {
      history.push({
        timestamp: Date.now(),
        bitPattern: signalData.navBits.slice(0, 60).join('')
      });
      
      if (history.length > this.config.nmaWindowSize) {
        history.shift();
      }
    }

    if (history.length < 10) return { detected: false, confidence: 0.5, suspicionLevel: 0 };

    let suspicionLevel = 0;

    const recent = history.slice(-10);
    const patternMatches = [];
    for (let i = 0; i < recent.length - 1; i++) {
      let matches = 0;
      for (let j = 0; j < Math.min(recent[i].bitPattern.length, recent[i + 1].bitPattern.length); j++) {
        if (recent[i].bitPattern[j] === recent[i + 1].bitPattern[j]) matches++;
      }
      patternMatches.push(matches / Math.min(recent[i].bitPattern.length, recent[i + 1].bitPattern.length));
    }
    
    const avgSimilarity = patternMatches.reduce((a, b) => a + b, 0) / patternMatches.length;
    if (avgSimilarity > this.config.consistencyThreshold) {
      suspicionLevel += (avgSimilarity - this.config.consistencyThreshold) * 2;
    }

    const timeDiffs = [];
    for (let i = 1; i < recent.length; i++) {
      timeDiffs.push(recent[i].timestamp - recent[i - 1].timestamp);
    }
    const avgInterval = timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length;
    const expectedInterval = 6000;
    
    if (Math.abs(avgInterval - expectedInterval) > 500) {
      suspicionLevel += 0.3;
    }

    return {
      detected: suspicionLevel > this.config.smuThreshold,
      confidence: Math.min(1, 0.5 + suspicionLevel),
      suspicionLevel,
      avgSimilarity,
      timingError: Math.abs(avgInterval - expectedInterval)
    };
  }

  verifyTimingConsistency(prn, signalData) {
    const state = this.authState.get(prn);
    if (!state) return { consistent: true, confidence: 0.5, jitter: 0 };

    const now = Date.now();
    const jitters = [];
    
    if (state.lastSubframeTime > 0) {
      const interval = now - state.lastSubframeTime;
      const expected = 6000;
      const jitter = Math.abs(interval - expected);
      jitters.push(jitter);

      if (jitter > 1000) {
        return {
          consistent: false,
          confidence: Math.max(0.3, 1 - jitter / 5000),
          jitter
        };
      }
    }

    state.lastSubframeTime = now;
    state.subframeCount++;

    return {
      consistent: true,
      confidence: 0.9,
      jitter: jitters.length > 0 ? jitters[0] : 0
    };
  }

  verifyNMA(prn, signalData) {
    const state = this.authState.get(prn);
    if (!state) return { pass: true, confidence: 0.5, notApplicable: true, note: 'N/A' };

    if (signalData.nmaBits) {
      state.nmaBits.push(...signalData.nmaBits);
      if (state.nmaBits.length > 1000) state.nmaBits = state.nmaBits.slice(-1000);
    }

    if (state.nmaBits.length < 100) {
      return {
        pass: true,
        confidence: 0.3,
        notApplicable: true,
        note: 'NMA数据不足'
      };
    }

    const entropy = this.calculateEntropy(state.nmaBits);
    
    if (entropy < 0.8) {
      return {
        pass: false,
        confidence: 0.8,
        notApplicable: false,
        note: `NMA数据熵值过低 (${entropy.toFixed(2)})，疑似伪造`
      };
    }

    return {
      pass: true,
      confidence: 0.7 + entropy * 0.3,
      notApplicable: false,
      note: 'NMA验证通过'
    };
  }

  calculateEntropy(bits) {
    if (bits.length === 0) return 0;
    
    const ones = bits.filter(b => b === 1).length;
    const p1 = ones / bits.length;
    const p0 = 1 - p1;
    
    if (p0 === 0 || p1 === 0) return 0;
    
    return -p0 * Math.log2(p0) - p1 * Math.log2(p1);
  }
}

class AdvancedSpoofingDetector {
  constructor() {
    this.cusumState = new Map();
    this.ewmaState = new Map();
    this.multipathFeatures = new Map();
    this.directionFinder = new MultiAntennaDirectionFinder();
    this.authenticator = new SignalAuthenticator();
    
    this.config = {
      cusumThreshold: 15,
      cusumDrift: 2,
      ewmaAlpha: 0.15,
      ewmaSigma: 3,
      multipathCorrelationThreshold: 0.7,
      maxMultipathSnrDrop: 8,
      spoofingCorrelationThreshold: 0.85,
      gradualDriftThreshold: 0.5,
      enableDirectionFinding: true,
      enableSignalAuth: true
    };
  }

  initSatellite(prn) {
    this.cusumState.set(prn, {
      positive: 0,
      negative: 0,
      mean: null,
      variance: null,
      count: 0
    });
    
    this.ewmaState.set(prn, {
      value: null,
      variance: null
    });
    
    this.multipathFeatures.set(prn, {
      snrFluctuationHistory: [],
      pseudorangeErrorHistory: [],
      lockLossEvents: 0,
      lastLockTime: 0
    });

    if (this.config.enableDirectionFinding) {
      this.directionFinder.initSatellite(prn);
    }

    if (this.config.enableSignalAuth) {
      this.authenticator.initSatellite(prn);
    }
  }

  updateCUSUM(prn, value) {
    const state = this.cusumState.get(prn);
    if (!state) return { alarm: false, value: 0 };

    if (state.count < 20) {
      if (state.mean === null) {
        state.mean = value;
        state.variance = 0;
      } else {
        const delta = value - state.mean;
        state.mean = state.mean + delta / (state.count + 1);
        state.variance = state.variance + delta * (value - state.mean);
      }
      state.count++;
      return { alarm: false, value: 0 };
    }

    const stdDev = Math.sqrt(state.variance / state.count) || 1;
    const normalized = (value - state.mean) / stdDev;

    state.positive = Math.max(0, state.positive + normalized - this.config.cusumDrift);
    state.negative = Math.max(0, state.negative - normalized - this.config.cusumDrift);

    const maxCUSUM = Math.max(state.positive, state.negative);
    const alarm = maxCUSUM > this.config.cusumThreshold;

    if (alarm) {
      state.positive = 0;
      state.negative = 0;
    }

    return { alarm, value: maxCUSUM, direction: state.positive > state.negative ? 'up' : 'down' };
  }

  updateEWMA(prn, value) {
    const state = this.ewmaState.get(prn);
    if (!state) return { alarm: false, value: value, ucl: 0, lcl: 0 };

    if (state.value === null) {
      state.value = value;
      state.variance = 1;
      return { alarm: false, value: value, ucl: value + 3, lcl: value - 3 };
    }

    state.value = this.config.ewmaAlpha * value + (1 - this.config.ewmaAlpha) * state.value;
    state.variance = this.config.ewmaAlpha * Math.pow(value - state.value, 2) + 
                     (1 - this.config.ewmaAlpha) * state.variance;

    const sigma = Math.sqrt(state.variance);
    const ucl = state.value + this.config.ewmaSigma * sigma * Math.sqrt(this.config.ewmaAlpha / (2 - this.config.ewmaAlpha));
    const lcl = state.value - this.config.ewmaSigma * sigma * Math.sqrt(this.config.ewmaAlpha / (2 - this.config.ewmaAlpha));

    const alarm = value > ucl || value < lcl;

    return { alarm, value: state.value, ucl, lcl, deviation: value - state.value };
  }

  updateMultipathFeatures(prn, snr, pseudorange, elevation, lockTime) {
    const features = this.multipathFeatures.get(prn);
    if (!features) return { isMultipath: false, confidence: 0 };

    const snrFluctuation = Math.abs(snr - (features.snrFluctuationHistory.length > 0 
      ? features.snrFluctuationHistory[features.snrFluctuationHistory.length - 1].snr 
      : snr));

    features.snrFluctuationHistory.push({ snr, fluctuation: snrFluctuation, time: Date.now() });
    if (features.snrFluctuationHistory.length > 50) {
      features.snrFluctuationHistory.shift();
    }

    if (lockTime < features.lastLockTime) {
      features.lockLossEvents++;
    }
    features.lastLockTime = lockTime;

    return this.classifyMultipath(prn, elevation);
  }

  classifyMultipath(prn, elevation) {
    const features = this.multipathFeatures.get(prn);
    if (!features || features.snrFluctuationHistory.length < 10) {
      return { isMultipath: false, confidence: 0 };
    }

    let confidence = 0;
    const reasons = [];

    const recent = features.snrFluctuationHistory.slice(-10);
    const avgFluctuation = recent.reduce((sum, f) => sum + f.fluctuation, 0) / recent.length;

    if (avgFluctuation > 1.5 && avgFluctuation < this.config.maxMultipathSnrDrop) {
      confidence += 0.3;
      reasons.push('SNR中度波动');
    }

    if (elevation < 30) {
      confidence += 0.25;
      reasons.push('低仰角');
    }

    if (features.lockLossEvents > 0) {
      confidence += Math.min(0.2, features.lockLossEvents * 0.05);
      reasons.push('锁相环丢失事件');
    }

    const snrValues = recent.map(f => f.snr);
    const autocorrelation = this.calculateAutocorrelation(snrValues, 1);
    if (autocorrelation > 0.5 && autocorrelation < this.config.multipathCorrelationThreshold) {
      confidence += 0.25;
      reasons.push('SNR相关性符合多径特征');
    }

    return {
      isMultipath: confidence > 0.4,
      confidence: Math.min(1, confidence),
      reasons,
      multipathSeverity: confidence
    };
  }

  calculateAutocorrelation(data, lag) {
    if (data.length < lag + 2) return 0;

    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < data.length - lag; i++) {
      numerator += (data[i] - mean) * (data[i + lag] - mean);
    }
    for (let i = 0; i < data.length; i++) {
      denominator += Math.pow(data[i] - mean, 2);
    }

    return denominator === 0 ? 0 : numerator / denominator;
  }

  checkSatelliteConsistency(satellites) {
    const inconsistencies = [];
    
    if (satellites.length < 4) return inconsistencies;

    const prValues = Array.from(satellites.values()).map(s => s.pseudorange);
    const meanPR = prValues.reduce((a, b) => a + b, 0) / prValues.length;
    
    const deviations = prValues.map(pr => Math.abs(pr - meanPR));
    const stdDev = Math.sqrt(deviations.reduce((a, b) => a + b * b, 0) / deviations.length);

    satellites.forEach((sat, prn) => {
      const zScore = Math.abs(sat.pseudorange - meanPR) / (stdDev || 1);
      if (zScore > 2.5) {
        inconsistencies.push({
          prn,
          type: 'satellite_outlier',
          confidence: Math.min(1, (zScore - 2.5) / 2),
          description: `PRN ${prn} 伪距与其他卫星偏差过大 (Z=${zScore.toFixed(2)})`
        });
      }
    });

    const snrValues = Array.from(satellites.values()).map(s => s.snr);
    const meanSNR = snrValues.reduce((a, b) => a + b, 0) / snrValues.length;
    const snrStdDev = Math.sqrt(snrValues.reduce((sum, s) => sum + Math.pow(s - meanSNR, 2), 0) / snrValues.length);

    if (snrStdDev < 2 && satellites.size >= 5) {
      inconsistencies.push({
        type: 'unnatural_snr_uniformity',
        confidence: 0.7,
        description: `多卫星SNR异常一致 (标准差=${snrStdDev.toFixed(2)}dB)，可能存在欺骗攻击`
      });
    }

    return inconsistencies;
  }
}

class GNSSAnalyzer extends EventEmitter {
  constructor(db) {
    super();
    this.db = db;
    this.running = false;
    this.satellites = new Map();
    this.pseudorangeHistory = new Map();
    this.signalPowerHistory = new Map();
    this.gnssSdrProcess = null;
    this.simulationInterval = null;
    this.detector = new AdvancedSpoofingDetector();
    
    this.config = {
      pseudorangeJumpThreshold: 50,
      signalPowerDropThreshold: 10,
      signalPowerRiseThreshold: 15,
      cn0Threshold: 35,
      maxHistorySize: 200,
      simulationMode: true,
      enableMultipathMitigation: true,
      enableCUSUM: true,
      enableEWMA: true,
      enableCrossCheck: true
    };
  }

  async start() {
    if (this.running) return false;
    
    this.running = true;
    this.db.log('info', 'analyzer', 'GNSS analysis started with advanced spoofing detection');
    
    if (this.config.simulationMode) {
      this.startSimulation();
    } else {
      await this.startGNSSSDR();
    }
    
    return true;
  }

  async stop() {
    this.running = false;
    
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }
    
    if (this.gnssSdrProcess) {
      this.gnssSdrProcess.kill();
      this.gnssSdrProcess = null;
    }
    
    this.db.log('info', 'analyzer', 'GNSS analysis stopped');
    return true;
  }

  startSimulation() {
    this.initializeMockSatellites();
    
    let frameCount = 0;
    
    this.simulationInterval = setInterval(() => {
      if (!this.running) return;
      
      this.updateSatelliteData();
      this.detectSpoofing();
      
      frameCount++;
      if (frameCount % 2 === 0) {
        this.simulateDoAandAuth();
      }
      
    }, 1000);
  }

  initializeMockSatellites() {
    const mockSatellites = [
      { prn: 1, system: 'GPS', baseSnr: 45, basePseudorange: 20000000 },
      { prn: 3, system: 'GPS', baseSnr: 42, basePseudorange: 21000000 },
      { prn: 7, system: 'GPS', baseSnr: 48, basePseudorange: 19500000 },
      { prn: 8, system: 'GPS', baseSnr: 40, basePseudorange: 22000000 },
      { prn: 11, system: 'GPS', baseSnr: 43, basePseudorange: 20500000 },
      { prn: 14, system: 'GPS', baseSnr: 46, basePseudorange: 19800000 },
      { prn: 17, system: 'GPS', baseSnr: 38, basePseudorange: 23000000 },
      { prn: 22, system: 'GPS', baseSnr: 41, basePseudorange: 21500000 }
    ];

    mockSatellites.forEach(sat => {
      this.satellites.set(sat.prn, {
        ...sat,
        azimuth: Math.random() * 360,
        elevation: 15 + Math.random() * 75,
        cn0: sat.baseSnr,
        lock_time: Math.random() * 1000,
        pseudorange_rate: (Math.random() - 0.5) * 100,
        gradualDrift: 0,
        multipathConfidence: 0
      });
      
      this.pseudorangeHistory.set(sat.prn, []);
      this.signalPowerHistory.set(sat.prn, []);
      this.detector.initSatellite(sat.prn);
    });
  }

  updateSatelliteData() {
    this.satellites.forEach((sat, prn) => {
      const noise = (Math.random() - 0.5) * 2;
      sat.snr = Math.max(20, Math.min(60, sat.baseSnr + noise));
      sat.cn0 = sat.snr;
      
      const rangeNoise = (Math.random() - 0.5) * 10;
      sat.pseudorange = sat.basePseudorange + sat.gradualDrift + rangeNoise;
      
      sat.azimuth = (sat.azimuth + (Math.random() - 0.5) * 0.5 + 360) % 360;
      sat.elevation = Math.max(5, Math.min(90, sat.elevation + (Math.random() - 0.5) * 0.3));
      sat.lock_time += 1;

      const prHistory = this.pseudorangeHistory.get(prn);
      const spHistory = this.signalPowerHistory.get(prn);
      
      prHistory.push({
        value: sat.pseudorange,
        timestamp: Date.now()
      });
      
      spHistory.push({
        value: sat.snr,
        timestamp: Date.now()
      });
      
      if (prHistory.length > this.config.maxHistorySize) {
        prHistory.shift();
      }
      if (spHistory.length > this.config.maxHistorySize) {
        spHistory.shift();
      }

      if (this.config.enableMultipathMitigation) {
        const multipathResult = this.detector.updateMultipathFeatures(
          prn, sat.snr, sat.pseudorange, sat.elevation, sat.lock_time
        );
        sat.multipathConfidence = multipathResult.confidence;
        sat.isMultipath = multipathResult.isMultipath;
        sat.multipathReasons = multipathResult.reasons;
      }

      this.db.insertSatellite({
        prn: sat.prn,
        system: sat.system,
        azimuth: sat.azimuth,
        elevation: sat.elevation,
        snr: sat.snr,
        pseudorange: sat.pseudorange,
        carrier_frequency: 1575.42e6
      });

      this.db.insertSignalHistory({
        satellite_prn: prn,
        snr: sat.snr,
        pseudorange: sat.pseudorange,
        pseudorange_rate: sat.pseudorange_rate,
        cn0: sat.cn0,
        lock_time: sat.lock_time
      });
    });

    if (Math.random() < 0.08) {
      this.injectSpoofingEvent();
    }

    this.emit('satellite-update', Array.from(this.satellites.values()));
  }

  injectSpoofingEvent() {
    const prns = Array.from(this.satellites.keys());
    const targetPrn = prns[Math.floor(Math.random() * prns.length)];
    const sat = this.satellites.get(targetPrn);
    
    const eventType = Math.random();
    
    if (eventType < 0.3) {
      sat.basePseudorange += 100 + Math.random() * 200;
      this.db.log('warning', 'simulation', `Injected pseudorange jump for PRN ${targetPrn}`);
    } else if (eventType < 0.5) {
      sat.baseSnr = Math.min(60, sat.baseSnr + 10 + Math.random() * 10);
      this.db.log('warning', 'simulation', `Injected signal power spike for PRN ${targetPrn}`);
    } else if (eventType < 0.7) {
      sat.baseSnr = Math.max(20, sat.baseSnr - 10 - Math.random() * 10);
      this.db.log('warning', 'simulation', `Injected signal power drop for PRN ${targetPrn}`);
    } else {
      sat.gradualDrift += 0.8;
      this.db.log('warning', 'simulation', `Injected gradual drift for PRN ${targetPrn}, total: ${sat.gradualDrift.toFixed(2)}m`);
    }
  }

  detectSpoofing() {
    const detectedAnomalies = new Map();

    this.satellites.forEach((sat, prn) => {
      const jumpAnomaly = this.detectPseudorangeJump(prn);
      if (jumpAnomaly) {
        detectedAnomalies.set(`${prn}_jump`, jumpAnomaly);
      }

      const powerAnomaly = this.detectSignalPowerAnomaly(prn);
      if (powerAnomaly) {
        detectedAnomalies.set(`${prn}_power`, powerAnomaly);
      }

      if (this.config.enableCUSUM) {
        const cusumResult = this.detector.updateCUSUM(prn, sat.pseudorange);
        if (cusumResult.alarm) {
          const anomaly = {
            type: 'gradual_pseudorange_drift',
            severity: 'medium',
            satellite_prn: prn,
            description: `PRN ${prn}: CUSUM检测到伪距缓慢漂移 (CUSUM值=${cusumResult.value.toFixed(2)})`,
            value_before: null,
            value_after: cusumResult.value,
            threshold: this.detector.config.cusumThreshold,
            timestamp: new Date().toISOString(),
            detectionMethod: 'CUSUM',
            isMultipath: sat.isMultipath,
            multipathConfidence: sat.multipathConfidence
          };
          detectedAnomalies.set(`${prn}_cusum`, anomaly);
        }
      }

      if (this.config.enableEWMA) {
        const ewmaResult = this.detector.updateEWMA(prn, sat.snr);
        if (ewmaResult.alarm && Math.abs(ewmaResult.deviation) > 3) {
          const anomaly = {
            type: 'gradual_signal_drift',
            severity: ewmaResult.deviation > 5 ? 'high' : 'medium',
            satellite_prn: prn,
            description: `PRN ${prn}: EWMA检测到信号功率漂移 (偏离${ewmaResult.deviation.toFixed(2)}dB)`,
            value_before: ewmaResult.value - ewmaResult.deviation,
            value_after: ewmaResult.value,
            threshold: 3,
            timestamp: new Date().toISOString(),
            detectionMethod: 'EWMA',
            isMultipath: sat.isMultipath,
            multipathConfidence: sat.multipathConfidence
          };
          detectedAnomalies.set(`${prn}_ewma`, anomaly);
        }
      }

      const stabilityAnomaly = this.detectClockConsistency(prn);
      if (stabilityAnomaly) {
        detectedAnomalies.set(`${prn}_stability`, stabilityAnomaly);
      }
    });

    if (this.config.enableCrossCheck && this.satellites.size >= 4) {
      const inconsistencies = this.detector.checkSatelliteConsistency(this.satellites);
      inconsistencies.forEach((inc, idx) => {
        const anomaly = {
          type: inc.type,
          severity: inc.confidence > 0.7 ? 'high' : 'medium',
          satellite_prn: inc.prn || null,
          description: inc.description,
          value_before: null,
          value_after: inc.confidence,
          threshold: 0.4,
          timestamp: new Date().toISOString(),
          detectionMethod: 'cross_validation',
          confidence: inc.confidence
        };
        detectedAnomalies.set(`cross_${idx}`, anomaly);
      });
    }

    detectedAnomalies.forEach((anomaly, key) => {
      if (this.config.enableMultipathMitigation && anomaly.isMultipath && anomaly.multipathConfidence > 0.5) {
        if (anomaly.type === 'signal_power_drop' || anomaly.type === 'signal_power_spike') {
          this.db.log('info', 'mitigation', 
            `Multipath mitigation: Suppressed ${anomaly.type} for PRN ${anomaly.satellite_prn} (confidence: ${anomaly.multipathConfidence.toFixed(2)})`);
          return;
        }
        anomaly.severity = 'low';
        anomaly.description += ' [多径影响]';
      }

      this.emit('anomaly-detected', anomaly);
    });
  }

  detectPseudorangeJump(prn) {
    const history = this.pseudorangeHistory.get(prn);
    if (history.length < 15) return null;

    const recent = history.slice(-5);
    const earlier = history.slice(-15, -5);
    
    if (earlier.length === 0) return null;

    const recentAvg = recent.reduce((sum, h) => sum + h.value, 0) / recent.length;
    const earlierAvg = earlier.reduce((sum, h) => sum + h.value, 0) / earlier.length;
    
    const diff = Math.abs(recentAvg - earlierAvg);
    const sat = this.satellites.get(prn);
    
    if (diff > this.config.pseudorangeJumpThreshold) {
      return {
        type: 'pseudorange_jump',
        severity: 'high',
        satellite_prn: prn,
        description: `PRN ${prn}: 伪距突变检测 - 变化量 ${diff.toFixed(2)}m`,
        value_before: earlierAvg,
        value_after: recentAvg,
        threshold: this.config.pseudorangeJumpThreshold,
        timestamp: new Date().toISOString(),
        detectionMethod: 'abrupt_change',
        isMultipath: sat?.isMultipath,
        multipathConfidence: sat?.multipathConfidence || 0
      };
    }
    return null;
  }

  detectSignalPowerAnomaly(prn) {
    const history = this.signalPowerHistory.get(prn);
    if (history.length < 15) return null;

    const recent = history.slice(-5);
    const earlier = history.slice(-15, -5);
    
    if (earlier.length === 0) return null;

    const recentAvg = recent.reduce((sum, h) => sum + h.value, 0) / recent.length;
    const earlierAvg = earlier.reduce((sum, h) => sum + h.value, 0) / earlier.length;
    
    const diff = recentAvg - earlierAvg;
    const sat = this.satellites.get(prn);

    if (diff > this.config.signalPowerRiseThreshold) {
      return {
        type: 'signal_power_spike',
        severity: 'medium',
        satellite_prn: prn,
        description: `PRN ${prn}: 信号功率异常升高 - ${diff.toFixed(2)} dB-Hz`,
        value_before: earlierAvg,
        value_after: recentAvg,
        threshold: this.config.signalPowerRiseThreshold,
        timestamp: new Date().toISOString(),
        detectionMethod: 'abrupt_change',
        isMultipath: sat?.isMultipath,
        multipathConfidence: sat?.multipathConfidence || 0
      };
    } else if (diff < -this.config.signalPowerDropThreshold) {
      return {
        type: 'signal_power_drop',
        severity: 'medium',
        satellite_prn: prn,
        description: `PRN ${prn}: 信号功率异常下降 - ${Math.abs(diff).toFixed(2)} dB-Hz`,
        value_before: earlierAvg,
        value_after: recentAvg,
        threshold: this.config.signalPowerDropThreshold,
        timestamp: new Date().toISOString(),
        detectionMethod: 'abrupt_change',
        isMultipath: sat?.isMultipath,
        multipathConfidence: sat?.multipathConfidence || 0
      };
    }

    if (recentAvg < this.config.cn0Threshold) {
      return {
        type: 'low_cn0',
        severity: 'low',
        satellite_prn: prn,
        description: `PRN ${prn}: 载噪比过低 - ${recentAvg.toFixed(2)} dB-Hz`,
        value_before: earlierAvg,
        value_after: recentAvg,
        threshold: this.config.cn0Threshold,
        timestamp: new Date().toISOString(),
        detectionMethod: 'threshold',
        isMultipath: sat?.isMultipath,
        multipathConfidence: sat?.multipathConfidence || 0
      };
    }

    return null;
  }

  detectClockConsistency(prn) {
    const history = this.pseudorangeHistory.get(prn);
    if (history.length < 30) return null;

    const values = history.slice(-30).map(h => h.value);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    const sat = this.satellites.get(prn);
    
    if (stdDev < 0.8) {
      return {
        type: 'unnatural_stability',
        severity: 'high',
        satellite_prn: prn,
        description: `PRN ${prn}: 信号异常稳定 (σ=${stdDev.toFixed(4)}) - 可能存在欺骗攻击`,
        value_before: null,
        value_after: stdDev,
        threshold: 0.8,
        timestamp: new Date().toISOString(),
        detectionMethod: 'stability',
        isMultipath: sat?.isMultipath,
        multipathConfidence: sat?.multipathConfidence || 0
      };
    }
    return null;
  }

  async startGNSSSDR() {
    return new Promise((resolve, reject) => {
      try {
        const configFile = path.join(__dirname, '../../config/gnss-sdr.conf');
        
        this.gnssSdrProcess = spawn('gnss-sdr', [
          '--config_file=' + configFile
        ]);

        this.gnssSdrProcess.stdout.on('data', (data) => {
          this.parseGNSSSDROutput(data.toString());
        });

        this.gnssSdrProcess.stderr.on('data', (data) => {
          console.error('GNSS-SDR stderr:', data.toString());
        });

        this.gnssSdrProcess.on('close', (code) => {
          this.db.log('info', 'analyzer', `GNSS-SDR exited with code ${code}`);
        });

        resolve(true);
      } catch (err) {
        this.db.log('error', 'analyzer', `Failed to start GNSS-SDR: ${err.message}`);
        reject(err);
      }
    });
  }

  parseGNSSSDROutput(output) {
    const lines = output.split('\n');
    lines.forEach(line => {
      if (line.includes('Pseudorange') && line.includes('PRN')) {
        const prnMatch = line.match(/PRN\s+(\d+)/);
        const rangeMatch = line.match(/Pseudorange:\s*([\d.]+)/);
        const snrMatch = line.match(/SNR:\s*([\d.]+)/);
        
        if (prnMatch && rangeMatch) {
          const prn = parseInt(prnMatch[1]);
          const pseudorange = parseFloat(rangeMatch[1]);
          const snr = snrMatch ? parseFloat(snrMatch[1]) : 40;
          
          if (!this.satellites.has(prn)) {
            this.satellites.set(prn, {
              prn,
              system: 'GPS',
              baseSnr: snr,
              basePseudorange: pseudorange,
              azimuth: 0,
              elevation: 45,
              cn0: snr,
              lock_time: 0,
              gradualDrift: 0,
              multipathConfidence: 0
            });
            this.pseudorangeHistory.set(prn, []);
            this.signalPowerHistory.set(prn, []);
            this.detector.initSatellite(prn);
          }
        }
      }
    });
  }

  getSatelliteCount() {
    return this.satellites.size;
  }

  isRunning() {
    return this.running;
  }

  getDoAData(prn) {
    if (prn) {
      return this.detector.directionFinder.calculateStableDoA(prn);
    }
    const doaData = {};
    this.satellites.forEach((sat, p) => {
      doaData[p] = this.detector.directionFinder.calculateStableDoA(p);
    });
    return doaData;
  }

  getAuthData(prn) {
    const signalData = {
      navBits: Array(60).fill(0).map(() => Math.random() > 0.5 ? 1 : 0),
      nmaBits: Array(100).fill(0).map(() => Math.random() > 0.5 ? 1 : 0)
    };
    
    if (prn) {
      return this.detector.authenticator.verifyCivilianSignal(prn, signalData);
    }
    const authData = {};
    this.satellites.forEach((sat, p) => {
      authData[p] = this.detector.authenticator.verifyCivilianSignal(p, signalData);
    });
    return authData;
  }

  getDetectionConfig() {
    return {
      cusum: {
        enabled: this.config.enableCUSUM,
        threshold: this.detector.config.cusumThreshold,
        drift: this.detector.config.cusumDrift
      },
      ewma: {
        enabled: this.config.enableEWMA,
        alpha: this.detector.config.ewmaAlpha,
        sigma: this.detector.config.ewmaSigma
      },
      multipath: {
        enabled: this.config.enableMultipathMitigation,
        correlationThreshold: this.detector.config.multipathCorrelationThreshold
      },
      directionFinding: {
        enabled: this.detector.config.enableDirectionFinding,
        antennaCount: this.detector.directionFinder.antennaPositions.length,
        aoaThreshold: this.detector.directionFinder.config.aoaThreshold
      },
      signalAuth: {
        enabled: this.detector.config.enableSignalAuth,
        smuThreshold: this.detector.authenticator.config.smuThreshold
      },
      crossValidation: {
        enabled: this.config.enableCrossCheck
      }
    };
  }

  simulateDoAandAuth() {
    this.satellites.forEach((sat, prn) => {
      const carrierPhases = this.detector.directionFinder.antennaPositions.map((_, i) => {
        const basePhase = (sat.pseudorange / 0.1903) % (2 * Math.PI);
        const antennaPhaseOffset = i * 0.3 + (Math.random() - 0.5) * 0.1;
        return basePhase + antennaPhaseOffset;
      });
      
      this.detector.directionFinder.estimateAoA(prn, carrierPhases);
      
      const signalData = {
        navBits: Array(60).fill(0).map(() => Math.random() > 0.5 ? 1 : 0),
        nmaBits: Array(50).fill(0).map(() => Math.random() > 0.5 ? 1 : 0)
      };
      const authResult = this.detector.authenticator.verifyCivilianSignal(prn, signalData);
      
      sat.authScore = authResult.score;
      sat.authWarnings = authResult.warnings;
      sat.doaAvailable = true;
    });

    const doaUpdate = this.getDoAData();
    const authUpdate = this.getAuthData();
    
    this.emit('doa-update', doaUpdate);
    this.emit('auth-update', authUpdate);
  }
}

module.exports = GNSSAnalyzer;