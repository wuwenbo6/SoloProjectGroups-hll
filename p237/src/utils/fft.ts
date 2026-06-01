export interface FFTResult {
  magnitude: Float64Array;
  frequency: Float64Array;
  snr: number;
  signalPowerDb: number;
  noiseFloorDb: number;
  peakFreq: number;
  inbandNoisePower: Float64Array;
  cumulativeNoise: Float64Array;
  signalBandEndIdx: number;
  totalInbandNoiseDb: number;
  maxIdx: number;
}

function hannWindow(N: number): Float64Array {
  const w = new Float64Array(N);
  for (let n = 0; n < N; n++) {
    w[n] = 0.5 * (1 - Math.cos((2 * Math.PI * n) / (N - 1)));
  }
  return w;
}

function bitReverse(n: number, bits: number): number {
  let reversed = 0;
  for (let i = 0; i < bits; i++) {
    reversed = (reversed << 1) | (n & 1);
    n >>= 1;
  }
  return reversed;
}

function fft(re: Float64Array, im: Float64Array): void {
  const N = re.length;
  const bits = Math.round(Math.log2(N));

  for (let i = 0; i < N; i++) {
    const j = bitReverse(i, bits);
    if (j > i) {
      let temp = re[i]; re[i] = re[j]; re[j] = temp;
      temp = im[i]; im[i] = im[j]; im[j] = temp;
    }
  }

  for (let size = 2; size <= N; size *= 2) {
    const halfSize = size / 2;
    const angle = (-2 * Math.PI) / size;
    for (let i = 0; i < N; i += size) {
      for (let j = 0; j < halfSize; j++) {
        const theta = angle * j;
        const wr = Math.cos(theta);
        const wi = Math.sin(theta);
        const idx1 = i + j;
        const idx2 = i + j + halfSize;
        const tr = wr * re[idx2] - wi * im[idx2];
        const ti = wr * im[idx2] + wi * re[idx2];
        re[idx2] = re[idx1] - tr;
        im[idx2] = im[idx1] - ti;
        re[idx1] += tr;
        im[idx1] += ti;
      }
    }
  }
}

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

export function computeFFT(
  signal: Float64Array,
  sampleRate: number,
  oversampleRatio: number
): FFTResult {
  const N = nextPow2(signal.length);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const window = hannWindow(signal.length);

  for (let i = 0; i < signal.length; i++) {
    re[i] = signal[i] * window[i];
    im[i] = 0;
  }

  fft(re, im);

  const halfN = N / 2;
  const magnitude = new Float64Array(halfN);
  const frequency = new Float64Array(halfN);

  for (let k = 0; k < halfN; k++) {
    const reSq = re[k] * re[k];
    const imSq = im[k] * im[k];
    magnitude[k] = (2 * Math.sqrt(reSq + imSq)) / N;
    frequency[k] = (k * sampleRate) / N;
  }

  let maxIdx = 0;
  let maxMag = 0;
  for (let k = 1; k < halfN; k++) {
    if (magnitude[k] > maxMag) {
      maxMag = magnitude[k];
      maxIdx = k;
    }
  }
  const peakFreq = frequency[maxIdx];

  const signalBinWidth = 5;
  const sigStart = Math.max(1, maxIdx - signalBinWidth);
  const sigEnd = Math.min(halfN - 1, maxIdx + signalBinWidth);

  let signalPower = 0;
  for (let k = sigStart; k <= sigEnd; k++) {
    signalPower += magnitude[k] * magnitude[k];
  }

  const bandwidthIdx = Math.floor(halfN / oversampleRatio);
  const bwEnd = Math.max(bandwidthIdx, sigEnd + 1);

  let totalPower = 0;
  for (let k = 1; k < bwEnd; k++) {
    totalPower += magnitude[k] * magnitude[k];
  }

  const noisePower = totalPower - signalPower;
  const snr = noisePower > 0 ? 10 * Math.log10(signalPower / noisePower) : 120;

  const signalPowerDb = 10 * Math.log10(signalPower + 1e-30);
  let noiseFloorSum = 0;
  let noiseFloorCount = 0;
  for (let k = sigEnd + 1; k < bwEnd && k < halfN; k++) {
    const p = magnitude[k] * magnitude[k];
    if (p > 1e-30) {
      noiseFloorSum += 10 * Math.log10(p);
      noiseFloorCount++;
    }
  }
  const noiseFloorDb = noiseFloorCount > 0 ? noiseFloorSum / noiseFloorCount : -150;

  const signalBandEndIdx = bwEnd;
  const inbandNoisePower = new Float64Array(signalBandEndIdx);
  const cumulativeNoise = new Float64Array(signalBandEndIdx);

  let cumNoise = 0;
  for (let k = 0; k < signalBandEndIdx; k++) {
    if (k >= sigStart && k <= sigEnd) {
      inbandNoisePower[k] = 0;
    } else {
      inbandNoisePower[k] = magnitude[k] * magnitude[k];
    }
    cumNoise += inbandNoisePower[k];
    cumulativeNoise[k] = cumNoise;
  }

  const totalInbandNoiseDb = noisePower > 0 ? 10 * Math.log10(noisePower + 1e-30) : -150;

  return { magnitude, frequency, snr, signalPowerDb, noiseFloorDb, peakFreq, inbandNoisePower, cumulativeNoise, signalBandEndIdx, totalInbandNoiseDb, maxIdx };
}

export function magnitudeToDb(magnitude: Float64Array): Float64Array {
  const db = new Float64Array(magnitude.length);
  for (let i = 0; i < magnitude.length; i++) {
    const p = magnitude[i] * magnitude[i];
    db[i] = 10 * Math.log10(p + 1e-30);
  }
  return db;
}
