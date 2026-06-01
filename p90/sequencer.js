class DNASequencerSimulator {
  constructor() {
    this.isConnected = false;
    this.isRunning = false;
    this.currentSequence = '';
    this.signalData = {
      A: [],
      T: [],
      C: [],
      G: []
    };
  }

  connect() {
    return new Promise((resolve) => {
      setTimeout(() => {
        this.isConnected = true;
        resolve({ success: true, device: 'DNASeq-2000 Simulator' });
      }, 1000);
    });
  }

  disconnect() {
    this.isConnected = false;
    this.isRunning = false;
    return { success: true };
  }

  generateRandomSequence(length = 100) {
    const bases = ['A', 'T', 'C', 'G'];
    let sequence = '';
    for (let i = 0; i < length; i++) {
      sequence += bases[Math.floor(Math.random() * 4)];
    }
    return sequence;
  }

  generateElectrophoresisSignal(sequence) {
    const signals = {
      A: [],
      T: [],
      C: [],
      G: []
    };
    
    const baseToChannel = { 'A': 'A', 'T': 'T', 'C': 'C', 'G': 'G' };
    const noiseLevel = 80;
    const baseSpacing = 20;
    
    const driftFactor = 0.02;
    const peakWidthIncrease = 0.005;
    
    for (let i = 0; i < sequence.length * baseSpacing * 1.5; i++) {
      const drift = i * driftFactor;
      
      Object.keys(signals).forEach(channel => {
        let signal = Math.random() * noiseLevel;
        
        for (let baseIndex = 0; baseIndex < sequence.length; baseIndex++) {
          const expectedPosition = baseIndex * baseSpacing + baseSpacing / 2 + drift;
          const distance = Math.abs(i - expectedPosition);
          
          if (distance < baseSpacing) {
            const currentBase = sequence[baseIndex];
            const peakHeight = (300 + Math.random() * 200) * (1 - baseIndex * 0.001);
            const sigma = 3 + baseIndex * peakWidthIncrease;
            
            const gaussian = (x, mean, s) => {
              return Math.exp(-Math.pow(x - mean, 2) / (2 * Math.pow(s, 2)));
            };
            
            if (baseToChannel[currentBase] === channel) {
              signal += peakHeight * gaussian(i, expectedPosition, sigma);
            }
            
            if (Math.random() < 0.15) {
              const otherBases = Object.keys(baseToChannel).filter(b => b !== currentBase);
              const otherBase = otherBases[Math.floor(Math.random() * otherBases.length)];
              if (baseToChannel[otherBase] === channel) {
                signal += peakHeight * 0.2 * gaussian(i, expectedPosition, sigma);
              }
            }
          }
        }
        
        signals[channel].push(Math.round(Math.max(0, signal)));
      });
    }
    
    return signals;
  }

  startSequencing(sequenceLength = 100, onData) {
    if (!this.isConnected) {
      return { success: false, error: 'Device not connected' };
    }

    this.isRunning = true;
    this.currentSequence = this.generateRandomSequence(sequenceLength);
    this.signalData = { A: [], T: [], C: [], G: [] };
    
    const fullSignals = this.generateElectrophoresisSignal(this.currentSequence);
    let dataIndex = 0;
    const chunkSize = 20;

    const interval = setInterval(() => {
      if (!this.isRunning || dataIndex >= fullSignals.A.length) {
        clearInterval(interval);
        this.isRunning = false;
        if (onData) {
          onData({ type: 'complete', sequence: this.currentSequence });
        }
        return;
      }

      const chunk = {
        A: fullSignals.A.slice(dataIndex, dataIndex + chunkSize),
        T: fullSignals.T.slice(dataIndex, dataIndex + chunkSize),
        C: fullSignals.C.slice(dataIndex, dataIndex + chunkSize),
        G: fullSignals.G.slice(dataIndex, dataIndex + chunkSize)
      };

      Object.keys(this.signalData).forEach(channel => {
        this.signalData[channel] = this.signalData[channel].concat(chunk[channel]);
      });

      dataIndex += chunkSize;

      if (onData) {
        onData({ type: 'data', data: chunk, progress: dataIndex / fullSignals.A.length });
      }
    }, 50);

    return { success: true };
  }

  stopSequencing() {
    this.isRunning = false;
    return { success: true };
  }

  getSignalData() {
    return this.signalData;
  }

  getFullSignalData() {
    return this.signalData;
  }
}

class PeakDetector {
  constructor(signals) {
    this.signals = signals;
    this.bases = ['A', 'T', 'C', 'G'];
    this.expectedPeakSpacing = 20;
    this.peakSpacingTolerance = 8;
  }

  estimateBaseline(signal, windowSize = 50) {
    const baseline = [];
    for (let i = 0; i < signal.length; i++) {
      const start = Math.max(0, i - windowSize);
      const end = Math.min(signal.length - 1, i + windowSize);
      const window = signal.slice(start, end + 1).sort((a, b) => a - b);
      const median = window[Math.floor(window.length / 2)];
      baseline.push(median * 0.5);
    }
    return baseline;
  }

  removeBaseline(signal, baseline) {
    return signal.map((val, i) => Math.max(0, val - baseline[i]));
  }

  smoothSignal(signal, windowSize = 3) {
    const smoothed = [];
    const kernel = [0.1, 0.2, 0.4, 0.2, 0.1];
    const kLen = kernel.length;
    const kMid = Math.floor(kLen / 2);
    
    for (let i = 0; i < signal.length; i++) {
      let sum = 0;
      let weightSum = 0;
      for (let j = 0; j < kLen; j++) {
        const idx = i + j - kMid;
        if (idx >= 0 && idx < signal.length) {
          sum += signal[idx] * kernel[j];
          weightSum += kernel[j];
        }
      }
      smoothed.push(sum / weightSum);
    }
    return smoothed;
  }

  findPeaks(signal, threshold = 80) {
    const peaks = [];
    const baseline = this.estimateBaseline(signal);
    const corrected = this.removeBaseline(signal, baseline);
    const smoothed = this.smoothSignal(corrected);
    
    for (let i = 3; i < smoothed.length - 3; i++) {
      if (smoothed[i] > threshold &&
          smoothed[i] > smoothed[i-1] &&
          smoothed[i] > smoothed[i-2] &&
          smoothed[i] > smoothed[i-3] &&
          smoothed[i] > smoothed[i+1] &&
          smoothed[i] > smoothed[i+2] &&
          smoothed[i] > smoothed[i+3]) {
        
        const leftSlope = smoothed[i] - smoothed[i-3];
        const rightSlope = smoothed[i] - smoothed[i+3];
        
        if (leftSlope > 10 && rightSlope > 10) {
          peaks.push({
            position: i,
            height: smoothed[i],
            rawHeight: signal[i]
          });
        }
      }
    }
    
    return peaks;
  }

  calculateQualityScore(peakHeight, channelMax, noiseLevel = 30) {
    const normalizedHeight = peakHeight / (channelMax || 1);
    const snr = peakHeight / noiseLevel;
    const q = Math.round(10 * Math.log10(snr * snr) * normalizedHeight);
    return Math.max(0, Math.min(60, q));
  }

  resolveOverlappingPeaks(peaksAtPosition) {
    if (peaksAtPosition.length === 0) return null;
    if (peaksAtPosition.length === 1) return peaksAtPosition[0];
    
    peaksAtPosition.sort((a, b) => b.height - a.height);
    const primary = peaksAtPosition[0];
    const secondary = peaksAtPosition[1];
    const ratio = secondary.height / primary.height;
    
    if (ratio > 0.8) {
      primary.ambiguous = true;
      primary.secondaryBase = secondary.base;
      primary.quality = Math.max(10, primary.quality - 20);
    } else if (ratio > 0.5) {
      primary.quality = Math.max(0, primary.quality - 10);
    }
    
    return primary;
  }

  detectPeakSpacing(peaks) {
    if (peaks.length < 10) return this.expectedPeakSpacing;
    
    const spacings = [];
    for (let i = 1; i < Math.min(peaks.length, 50); i++) {
      spacings.push(peaks[i].position - peaks[i-1].position);
    }
    spacings.sort((a, b) => a - b);
    const median = spacings[Math.floor(spacings.length / 2)];
    
    return median || this.expectedPeakSpacing;
  }

  callBases() {
    const allPeaks = {};
    const channelMax = {};
    
    this.bases.forEach(base => {
      allPeaks[base] = this.findPeaks(this.signals[base]);
      channelMax[base] = Math.max(...this.signals[base], 1);
    });

    const mergedPeaks = [];
    this.bases.forEach(base => {
      allPeaks[base].forEach(peak => {
        mergedPeaks.push({
          ...peak,
          base: base,
          quality: this.calculateQualityScore(peak.height, channelMax[base])
        });
      });
    });

    mergedPeaks.sort((a, b) => a.position - b.position);

    const detectedSpacing = this.detectPeakSpacing(mergedPeaks);
    const minSpacing = detectedSpacing - this.peakSpacingTolerance;
    const maxSpacing = detectedSpacing + this.peakSpacingTolerance;

    const clusteredPeaks = [];
    let currentCluster = [];
    let clusterStart = 0;

    mergedPeaks.forEach(peak => {
      if (currentCluster.length === 0) {
        currentCluster.push(peak);
        clusterStart = peak.position;
      } else if (peak.position - clusterStart < minSpacing) {
        currentCluster.push(peak);
      } else {
        if (currentCluster.length > 0) {
          const resolved = this.resolveOverlappingPeaks(currentCluster);
          if (resolved) {
            clusteredPeaks.push(resolved);
          }
        }
        currentCluster = [peak];
        clusterStart = peak.position;
      }
    });

    if (currentCluster.length > 0) {
      const resolved = this.resolveOverlappingPeaks(currentCluster);
      if (resolved) {
        clusteredPeaks.push(resolved);
      }
    }

    const finalPeaks = [];
    let expectedPosition = clusteredPeaks.length > 0 ? clusteredPeaks[0].position : 0;
    
    clusteredPeaks.forEach((peak, idx) => {
      if (idx === 0) {
        finalPeaks.push(peak);
        expectedPosition = peak.position;
      } else {
        const distanceToExpected = peak.position - expectedPosition;
        
        if (distanceToExpected > maxSpacing * 1.5) {
          const numInserted = Math.round(distanceToExpected / detectedSpacing) - 1;
          for (let i = 0; i < numInserted; i++) {
            finalPeaks.push({ base: 'N', position: expectedPosition + detectedSpacing, height: 0, quality: 0 });
            expectedPosition += detectedSpacing;
          }
        }
        
        if (distanceToExpected >= minSpacing * 0.5) {
          finalPeaks.push(peak);
          expectedPosition += detectedSpacing;
        }
      }
    });

    const calledBases = finalPeaks.map(p => p.ambiguous ? 'N' : p.base);
    const qualityScores = finalPeaks.map(p => p.quality);

    return {
      sequence: calledBases.join(''),
      qualityScores: qualityScores,
      peaks: finalPeaks,
      detectedSpacing: detectedSpacing
    };
  }
}

class MixedSampleDemultiplexer {
  constructor(peaks, signals) {
    this.peaks = peaks;
    this.signals = signals;
    this.bases = ['A', 'T', 'C', 'G'];
  }

  extractSignalAtPosition(position, windowSize = 5) {
    const signals = {};
    this.bases.forEach(base => {
      let sum = 0;
      let count = 0;
      for (let i = Math.max(0, position - windowSize); i <= Math.min(this.signals[base].length - 1, position + windowSize); i++) {
        sum += this.signals[base][i];
        count++;
      }
      signals[base] = count > 0 ? sum / count : 0;
    });
    return signals;
  }

  clusterPeaksByRatio(numClusters = 2) {
    const peakVectors = this.peaks.map(peak => {
      const signals = this.extractSignalAtPosition(peak.position);
      const total = Object.values(signals).reduce((a, b) => a + b, 1);
      return {
        peak: peak,
        ratios: this.bases.map(b => signals[b] / total),
        signals: signals
      };
    });

    const centroids = [];
    for (let i = 0; i < numClusters; i++) {
      const idx = Math.floor(i * peakVectors.length / numClusters);
      centroids.push([...peakVectors[idx].ratios]);
    }

    for (let iter = 0; iter < 50; iter++) {
      const clusters = Array.from({ length: numClusters }, () => []);
      
      peakVectors.forEach(pv => {
        let minDist = Infinity;
        let bestCluster = 0;
        for (let c = 0; c < numClusters; c++) {
          const dist = this.euclideanDistance(pv.ratios, centroids[c]);
          if (dist < minDist) {
            minDist = dist;
            bestCluster = c;
          }
        }
        clusters[bestCluster].push(pv);
      });

      let converged = true;
      for (let c = 0; c < numClusters; c++) {
        if (clusters[c].length > 0) {
          const newCentroid = new Array(4).fill(0);
          clusters[c].forEach(pv => {
            for (let i = 0; i < 4; i++) {
              newCentroid[i] += pv.ratios[i];
            }
          });
          for (let i = 0; i < 4; i++) {
            newCentroid[i] /= clusters[c].length;
          }
          if (this.euclideanDistance(newCentroid, centroids[c]) > 0.001) {
            converged = false;
          }
          centroids[c] = newCentroid;
        }
      }

      if (converged) break;
    }

    const clusters = Array.from({ length: numClusters }, () => []);
    peakVectors.forEach(pv => {
      let minDist = Infinity;
      let bestCluster = 0;
      for (let c = 0; c < numClusters; c++) {
        const dist = this.euclideanDistance(pv.ratios, centroids[c]);
        if (dist < minDist) {
          minDist = dist;
          bestCluster = c;
        }
      }
      pv.cluster = bestCluster;
      clusters[bestCluster].push(pv);
    });

    return clusters;
  }

  euclideanDistance(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += Math.pow(a[i] - b[i], 2);
    }
    return Math.sqrt(sum);
  }

  demultiplex(numSamples = 2) {
    const clusters = this.clusterPeaksByRatio(numSamples);
    const results = [];

    clusters.forEach((cluster, clusterIdx) => {
      cluster.sort((a, b) => a.peak.position - b.peak.position);
      
      const sequence = [];
      const qualities = [];
      const positions = [];

      cluster.forEach(pv => {
        const dominantBase = this.bases[pv.ratios.indexOf(Math.max(...pv.ratios))];
        const quality = this.calculateClusterQuality(pv);
        
        sequence.push(dominantBase);
        qualities.push(quality);
        positions.push(pv.peak.position);
      });

      results.push({
        clusterId: clusterIdx,
        sequence: sequence.join(''),
        qualityScores: qualities,
        positions: positions,
        peakCount: cluster.length,
        confidence: this.calculateClusterConfidence(cluster)
      });
    });

    return results.sort((a, b) => b.peakCount - a.peakCount);
  }

  calculateClusterQuality(pv) {
    const sortedRatios = [...pv.ratios].sort((a, b) => b - a);
    const ratio = sortedRatios[0] / (sortedRatios[1] || 0.1);
    const q = Math.round(10 * Math.log10(ratio * ratio));
    return Math.max(0, Math.min(60, q));
  }

  calculateClusterConfidence(cluster) {
    if (cluster.length === 0) return 0;
    const avgQuality = cluster.reduce((sum, pv) => sum + this.calculateClusterQuality(pv), 0) / cluster.length;
    return avgQuality / 60;
  }
}

class PhredQualityCalibrator {
  constructor(qualityScores, sequence, knownSequence = null) {
    this.qualityScores = qualityScores;
    this.sequence = sequence;
    this.knownSequence = knownSequence;
  }

  calculateEmpiricalErrorRates() {
    if (!this.knownSequence || this.knownSequence.length !== this.sequence.length) {
      return null;
    }

    const errorsByQuality = {};
    const totalsByQuality = {};

    for (let i = 0; i < this.sequence.length; i++) {
      const q = this.qualityScores[i];
      const isError = this.sequence[i] !== this.knownSequence[i] && this.sequence[i] !== 'N';
      
      if (!totalsByQuality[q]) {
        totalsByQuality[q] = 0;
        errorsByQuality[q] = 0;
      }
      totalsByQuality[q]++;
      if (isError) errorsByQuality[q]++;
    }

    const empiricalRates = {};
    Object.keys(totalsByQuality).forEach(q => {
      empiricalRates[q] = totalsByQuality[q] > 0 
        ? errorsByQuality[q] / totalsByQuality[q] 
        : 0;
    });

    return empiricalRates;
  }

  buildCalibrationTable() {
    const empiricalRates = this.calculateEmpiricalErrorRates();
    if (!empiricalRates) {
      return this.estimateCalibrationFromDistribution();
    }

    const calibrationTable = {};
    Object.keys(empiricalRates).forEach(q => {
      const nominalQ = parseInt(q);
      const empiricalP = empiricalRates[q];
      const empiricalQ = empiricalP > 0 ? Math.round(-10 * Math.log10(empiricalP)) : 60;
      calibrationTable[nominalQ] = Math.max(0, Math.min(60, empiricalQ));
    });

    return calibrationTable;
  }

  estimateCalibrationFromDistribution() {
    const histogram = {};
    this.qualityScores.forEach(q => {
      histogram[q] = (histogram[q] || 0) + 1;
    });

    const meanQ = this.qualityScores.reduce((a, b) => a + b, 0) / this.qualityScores.length;
    const stdQ = Math.sqrt(this.qualityScores.reduce((sum, q) => sum + Math.pow(q - meanQ, 2), 0) / this.qualityScores.length);

    const calibrationTable = {};
    for (let q = 0; q <= 60; q++) {
      const zScore = stdQ > 0 ? (q - meanQ) / stdQ : 0;
      const correction = Math.round(zScore * 2);
      calibrationTable[q] = Math.max(0, Math.min(60, q + correction));
    }

    return calibrationTable;
  }

  calibrate() {
    const calibrationTable = this.buildCalibrationTable();
    
    const calibratedScores = this.qualityScores.map(q => {
      return calibrationTable[q] !== undefined ? calibrationTable[q] : q;
    });

    return {
      originalScores: this.qualityScores,
      calibratedScores: calibratedScores,
      calibrationTable: calibrationTable,
      meanOriginal: (this.qualityScores.reduce((a, b) => a + b, 0) / this.qualityScores.length).toFixed(2),
      meanCalibrated: (calibratedScores.reduce((a, b) => a + b, 0) / calibratedScores.length).toFixed(2)
    };
  }
}

class ABIFileGenerator {
  constructor(sampleData) {
    this.sampleName = sampleData.name || 'Unknown';
    this.sequence = sampleData.sequence || '';
    this.qualityScores = sampleData.qualityScores || [];
    this.signals = sampleData.signals || { A: [], T: [], C: [], G: [] };
    this.peaks = sampleData.peaks || [];
  }

  generateABIFormat() {
    const traceData = this.encodeTraceData();
    const baseOrder = this.peaks.map(p => p.position);
    
    return {
      format: 'ABI',
      version: '1.0',
      sampleName: this.sampleName,
      baseCaller: 'DNASeq-2000',
      date: new Date().toISOString(),
      sequence: this.sequence,
      quality: this.qualityScores,
      peaks: baseOrder,
      traces: {
        A: traceData.A,
        T: traceData.T,
        C: traceData.C,
        G: traceData.G
      },
      comments: [
        'Generated by DNA Sequencing Analyzer',
        `Sequence length: ${this.sequence.length} bp`,
        `Average quality: ${this.calculateAvgQuality()}`
      ]
    };
  }

  encodeTraceData() {
    const encoded = {};
    const maxPoints = 10000;
    
    ['A', 'T', 'C', 'G'].forEach(base => {
      const signal = this.signals[base] || [];
      const step = Math.max(1, Math.floor(signal.length / maxPoints));
      const sampled = [];
      
      for (let i = 0; i < signal.length; i += step) {
        sampled.push(Math.round(signal[i]));
      }
      
      encoded[base] = sampled;
    });
    
    return encoded;
  }

  calculateAvgQuality() {
    if (this.qualityScores.length === 0) return 0;
    return Math.round(this.qualityScores.reduce((a, b) => a + b, 0) / this.qualityScores.length);
  }

  toBinaryString() {
    const abiData = this.generateABIFormat();
    let binary = '';
    
    binary += this.writeString('ABIF');
    binary += this.writeInt16(101);
    binary += this.writeString(this.sampleName.padEnd(20, '\0'));
    binary += this.writeInt32(this.sequence.length);
    binary += this.writeInt32(this.qualityScores.length);
    binary += this.writeInt32(abiData.traces.A.length);
    
    return btoa(binary);
  }

  writeString(str) {
    return str;
  }

  writeInt16(value) {
    return String.fromCharCode((value >> 8) & 0xFF, value & 0xFF);
  }

  writeInt32(value) {
    return String.fromCharCode(
      (value >> 24) & 0xFF,
      (value >> 16) & 0xFF,
      (value >> 8) & 0xFF,
      value & 0xFF
    );
  }

  exportToFile(format = 'json') {
    if (format === 'json') {
      return JSON.stringify(this.generateABIFormat(), null, 2);
    } else if (format === 'binary') {
      return this.toBinaryString();
    }
    return this.generateABIFormat();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { 
    DNASequencerSimulator, 
    PeakDetector,
    MixedSampleDemultiplexer,
    PhredQualityCalibrator,
    ABIFileGenerator
  };
}
