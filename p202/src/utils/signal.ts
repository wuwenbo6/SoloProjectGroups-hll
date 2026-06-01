import { Complex, fft, ifft } from "./fft";

export type ModulationType = "QPSK" | "16QAM" | "64QAM";
export type ModulationFormat = 'qpsk' | '16qam' | '64qam';

export function getBitsPerSymbol(modulation: ModulationType | ModulationFormat): number {
  switch (modulation) {
    case "QPSK":
    case "qpsk":
      return 2;
    case "16QAM":
    case "16qam":
      return 4;
    case "64QAM":
    case "64qam":
      return 6;
  }
}

function grayToIndex(gray: number, bits: number): number {
  let bin = gray;
  for (let i = 1; i < bits; i++) {
    bin ^= (gray >> i);
  }
  return bin;
}

function indexToGray(index: number, bits: number): number {
  return index ^ (index >> 1);
}

function getQamAmplitude(level: number, bits: number): number {
  const maxLevel = (1 << bits) - 1;
  const amplitude = 2 * level - maxLevel;
  const norm = Math.sqrt((1 << (2 * bits - 2)) * (2 * (1 << bits) - 1) / 3);
  return amplitude / norm;
}

function demodulateQamSymbol(s: Complex, bitsPerAxis: number): number {
  const maxLevel = (1 << bitsPerAxis) - 1;
  const norm = Math.sqrt((1 << (2 * bitsPerAxis - 2)) * (2 * (1 << bitsPerAxis) - 1) / 3);

  const levelI = Math.round((s.re * norm + maxLevel) / 2);
  const levelQ = Math.round((s.im * norm + maxLevel) / 2);

  const clampedI = Math.max(0, Math.min(maxLevel, levelI));
  const clampedQ = Math.max(0, Math.min(maxLevel, levelQ));

  const grayI = indexToGray(clampedI, bitsPerAxis);
  const grayQ = indexToGray(clampedQ, bitsPerAxis);

  return (grayI << bitsPerAxis) | grayQ;
}

export function qpskModulate(bits: number[]): Complex[] {
  const symbols: Complex[] = [];
  const sqrt2_2 = Math.SQRT1_2;
  for (let i = 0; i < bits.length; i += 2) {
    const b0 = bits[i];
    const b1 = bits[i + 1];
    symbols.push({
      re: (1 - 2 * b0) * sqrt2_2,
      im: (1 - 2 * b1) * sqrt2_2,
    });
  }
  return symbols;
}

export function qpskDemodulate(symbols: Complex[]): number[] {
  const bits: number[] = [];
  for (const s of symbols) {
    bits.push(s.re < 0 ? 1 : 0);
    bits.push(s.im < 0 ? 1 : 0);
  }
  return bits;
}

export function qam16Modulate(bits: number[]): Complex[] {
  const symbols: Complex[] = [];
  const bitsPerAxis = 2;
  const norm = Math.sqrt(1 / 10);

  const grayMapI = [0, 1, 3, 2];
  const levels = [-3, -1, 1, 3];

  for (let i = 0; i < bits.length; i += 4) {
    let word = 0;
    for (let j = 0; j < 4 && i + j < bits.length; j++) {
      word = (word << 1) | (bits[i + j] || 0);
    }

    const grayI = (word >> 2) & 0x3;
    const grayQ = word & 0x3;

    const levelI = levels[grayMapI.indexOf(grayI)];
    const levelQ = levels[grayMapI.indexOf(grayQ)];

    symbols.push({
      re: levelI * norm,
      im: levelQ * norm,
    });
  }
  return symbols;
}

export function qam16Demodulate(symbols: Complex[]): number[] {
  const bits: number[] = [];
  const norm = Math.sqrt(1 / 10);
  const thresholds = [-2, 0, 2].map(t => t * norm);
  const grayMapI = [0, 1, 3, 2];
  const levels = [-3, -1, 1, 3];

  for (const s of symbols) {
    let levelI = 0;
    if (s.re < thresholds[0]) levelI = -3;
    else if (s.re < thresholds[1]) levelI = -1;
    else if (s.re < thresholds[2]) levelI = 1;
    else levelI = 3;

    let levelQ = 0;
    if (s.im < thresholds[0]) levelQ = -3;
    else if (s.im < thresholds[1]) levelQ = -1;
    else if (s.im < thresholds[2]) levelQ = 1;
    else levelQ = 3;

    const grayI = grayMapI[levels.indexOf(levelI)];
    const grayQ = grayMapI[levels.indexOf(levelQ)];

    const word = (grayI << 2) | grayQ;
    for (let j = 3; j >= 0; j--) {
      bits.push((word >> j) & 1);
    }
  }
  return bits;
}

export function qam64Modulate(bits: number[]): Complex[] {
  const symbols: Complex[] = [];
  const norm = Math.sqrt(1 / 42);

  const grayMapI = [0, 1, 3, 2, 6, 7, 5, 4];
  const levels = [-7, -5, -3, -1, 1, 3, 5, 7];

  for (let i = 0; i < bits.length; i += 6) {
    let word = 0;
    for (let j = 0; j < 6 && i + j < bits.length; j++) {
      word = (word << 1) | (bits[i + j] || 0);
    }

    const grayI = (word >> 3) & 0x7;
    const grayQ = word & 0x7;

    const levelI = levels[grayMapI.indexOf(grayI)];
    const levelQ = levels[grayMapI.indexOf(grayQ)];

    symbols.push({
      re: levelI * norm,
      im: levelQ * norm,
    });
  }
  return symbols;
}

export function qam64Demodulate(symbols: Complex[]): number[] {
  const bits: number[] = [];
  const norm = Math.sqrt(1 / 42);
  const thresholds = [-6, -4, -2, 0, 2, 4, 6].map(t => t * norm);
  const grayMapI = [0, 1, 3, 2, 6, 7, 5, 4];
  const levels = [-7, -5, -3, -1, 1, 3, 5, 7];

  for (const s of symbols) {
    let levelI = -7;
    if (s.re >= thresholds[6]) levelI = 7;
    else if (s.re >= thresholds[5]) levelI = 5;
    else if (s.re >= thresholds[4]) levelI = 3;
    else if (s.re >= thresholds[3]) levelI = 1;
    else if (s.re >= thresholds[2]) levelI = -1;
    else if (s.re >= thresholds[1]) levelI = -3;
    else if (s.re >= thresholds[0]) levelI = -5;

    let levelQ = -7;
    if (s.im >= thresholds[6]) levelQ = 7;
    else if (s.im >= thresholds[5]) levelQ = 5;
    else if (s.im >= thresholds[4]) levelQ = 3;
    else if (s.im >= thresholds[3]) levelQ = 1;
    else if (s.im >= thresholds[2]) levelQ = -1;
    else if (s.im >= thresholds[1]) levelQ = -3;
    else if (s.im >= thresholds[0]) levelQ = -5;

    const grayI = grayMapI[levels.indexOf(levelI)];
    const grayQ = grayMapI[levels.indexOf(levelQ)];

    const word = (grayI << 3) | grayQ;
    for (let j = 5; j >= 0; j--) {
      bits.push((word >> j) & 1);
    }
  }
  return bits;
}

export function modulate(bits: number[], modulation: ModulationType | ModulationFormat): Complex[] {
  switch (modulation) {
    case "QPSK":
    case "qpsk":
      return qpskModulate(bits);
    case "16QAM":
    case "16qam":
      return qam16Modulate(bits);
    case "64QAM":
    case "64qam":
      return qam64Modulate(bits);
  }
}

export function demodulate(symbols: Complex[], modulation: ModulationType | ModulationFormat): number[] {
  switch (modulation) {
    case "QPSK":
    case "qpsk":
      return qpskDemodulate(symbols);
    case "16QAM":
    case "16qam":
      return qam16Demodulate(symbols);
    case "64QAM":
    case "64qam":
      return qam64Demodulate(symbols);
  }
}

export function getIdealConstellation(modulation: ModulationType): Complex[] {
  const points: Complex[] = [];
  const bitsPerSymbol = getBitsPerSymbol(modulation);
  const bitsPerAxis = bitsPerSymbol / 2;
  const numPoints = 1 << bitsPerAxis;

  for (let i = 0; i < numPoints; i++) {
    for (let j = 0; j < numPoints; j++) {
      const levelI = grayToIndex(i, bitsPerAxis);
      const levelQ = grayToIndex(j, bitsPerAxis);
      points.push({
        re: getQamAmplitude(levelI, bitsPerAxis),
        im: getQamAmplitude(levelQ, bitsPerAxis),
      });
    }
  }
  return points;
}

export function getIdealConstellationPoints(format: ModulationFormat): Complex[] {
  const points: Complex[] = [];

  if (format === 'qpsk') {
    const sqrt2_2 = Math.SQRT1_2;
    points.push({ re: sqrt2_2, im: sqrt2_2 });
    points.push({ re: -sqrt2_2, im: sqrt2_2 });
    points.push({ re: -sqrt2_2, im: -sqrt2_2 });
    points.push({ re: sqrt2_2, im: -sqrt2_2 });
  } else if (format === '16qam') {
    const norm = Math.sqrt(1 / 10);
    const levels = [-3, -1, 1, 3];
    for (const i of levels) {
      for (const q of levels) {
        points.push({ re: i * norm, im: q * norm });
      }
    }
  } else if (format === '64qam') {
    const norm = Math.sqrt(1 / 42);
    const levels = [-7, -5, -3, -1, 1, 3, 5, 7];
    for (const i of levels) {
      for (const q of levels) {
        points.push({ re: i * norm, im: q * norm });
      }
    }
  }

  return points;
}

export function generateBits(count: number): number[] {
  const bits: number[] = new Array(count);
  for (let i = 0; i < count; i++) {
    bits[i] = Math.random() < 0.5 ? 0 : 1;
  }
  return bits;
}

export function ofdmModulate(
  symbols: Complex[],
  fftSize: number,
  pilotInterval: number = 4
): { timeDomain: Complex[]; pilotIndices: number[]; pilotValues: Complex[] } {
  const input: Complex[] = new Array(fftSize);
  for (let i = 0; i < fftSize; i++) {
    input[i] = { re: 0, im: 0 };
  }
  const half = fftSize / 2;
  const maxData = half - 1;

  const pilotIndices: number[] = [];
  const pilotValues: Complex[] = [];

  let symIdx = 0;
  const sqrt2_2 = Math.SQRT1_2;
  for (let i = 1; i <= maxData && symIdx < symbols.length; i++) {
    if (i % pilotInterval === 1 || i === 1) {
      const pilot: Complex = { re: sqrt2_2, im: sqrt2_2 };
      input[i] = pilot;
      input[fftSize - i] = { re: pilot.re, im: -pilot.im };
      pilotIndices.push(i);
      pilotValues.push(pilot);
    } else {
      input[i] = symbols[symIdx];
      input[fftSize - i] = { re: symbols[symIdx].re, im: -symbols[symIdx].im };
      symIdx++;
    }
  }

  return {
    timeDomain: ifft(input),
    pilotIndices,
    pilotValues,
  };
}

export function channelEstimateAndEqualize(
  freqSignal: Complex[],
  pilotIndices: number[],
  pilotValues: Complex[],
  fftSize: number
): Complex[] {
  const half = fftSize / 2;
  const channelEst: (Complex | null)[] = new Array(half).fill(null);

  for (let i = 0; i < pilotIndices.length; i++) {
    const idx = pilotIndices[i];
    if (idx >= half) continue;
    const pilotRx = freqSignal[idx];
    const pilotTx = pilotValues[i];
    const denom = pilotTx.re * pilotTx.re + pilotTx.im * pilotTx.im;
    if (denom === 0) continue;
    channelEst[idx] = {
      re: (pilotRx.re * pilotTx.re + pilotRx.im * pilotTx.im) / denom,
      im: (pilotRx.im * pilotTx.re - pilotRx.re * pilotTx.im) / denom,
    };
  }

  const filledChannel: Complex[] = linearInterpolateChannel(channelEst, half);

  const equalized: Complex[] = new Array(freqSignal.length);
  for (let i = 0; i < freqSignal.length; i++) {
    const ch = i < half ? filledChannel[i] : { re: 1, im: 0 };
    const denom = ch.re * ch.re + ch.im * ch.im;
    if (denom < 1e-10) {
      equalized[i] = { ...freqSignal[i] };
    } else {
      equalized[i] = {
        re: (freqSignal[i].re * ch.re + freqSignal[i].im * ch.im) / denom,
        im: (freqSignal[i].im * ch.re - freqSignal[i].re * ch.im) / denom,
      };
    }
  }

  return equalized;
}

function linearInterpolateChannel(
  channelEst: (Complex | null)[],
  length: number
): Complex[] {
  const result: Complex[] = new Array(length);
  for (let i = 0; i < length; i++) {
    result[i] = { re: 1, im: 0 };
  }

  const knownIndices: number[] = [];
  for (let i = 0; i < length; i++) {
    if (channelEst[i] !== null) knownIndices.push(i);
  }

  if (knownIndices.length === 0) return result;

  for (let i = 0; i < length; i++) {
    if (channelEst[i] !== null) {
      result[i] = { ...(channelEst[i] as Complex) };
      continue;
    }

    let prevIdx = -1;
    let nextIdx = -1;
    for (const k of knownIndices) {
      if (k < i) prevIdx = k;
      if (k > i && nextIdx === -1) nextIdx = k;
    }

    if (prevIdx === -1 && nextIdx !== -1) {
      result[i] = { ...(channelEst[nextIdx] as Complex) };
    } else if (nextIdx === -1 && prevIdx !== -1) {
      result[i] = { ...(channelEst[prevIdx] as Complex) };
    } else if (prevIdx !== -1 && nextIdx !== -1) {
      const alpha = (i - prevIdx) / (nextIdx - prevIdx);
      const prev = channelEst[prevIdx] as Complex;
      const next = channelEst[nextIdx] as Complex;
      result[i] = {
        re: prev.re + alpha * (next.re - prev.re),
        im: prev.im + alpha * (next.im - prev.im),
      };
    }
  }

  return result;
}

export function extractDataSubcarriersWithPilots(
  freqSignal: Complex[],
  numData: number,
  pilotInterval: number
): Complex[] {
  const data: Complex[] = [];
  const half = freqSignal.length / 2;
  let symIdx = 0;
  for (let i = 1; i < half && symIdx < numData; i++) {
    if (i % pilotInterval === 1 || i === 1) continue;
    data.push(freqSignal[i]);
    symIdx++;
  }
  return data;
}

export function addCp(signal: Complex[], cpLength: number): Complex[] {
  const cp: Complex[] = signal.slice(signal.length - cpLength);
  return [...cp, ...signal];
}

export function addAwgn(signal: Complex[], snrDb: number): Complex[] {
  const signalPower =
    signal.reduce((sum, s) => sum + s.re * s.re + s.im * s.im, 0) /
    signal.length;
  const snrLinear = Math.pow(10, snrDb / 10);
  const noisePower = signalPower / snrLinear;
  const noiseStd = Math.sqrt(noisePower / 2);
  return signal.map((s) => ({
    re: s.re + noiseStd * boxMullerRandom(),
    im: s.im + noiseStd * boxMullerRandom(),
  }));
}

function boxMullerRandom(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return (
    Math.sqrt(-2 * Math.log(u1 || 1e-10)) * Math.cos(2 * Math.PI * u2)
  );
}

export function removeCp(
  signal: Complex[],
  cpLength: number,
  fftSize: number
): Complex[] {
  return signal.slice(cpLength, cpLength + fftSize);
}

export function ofdmDemodulate(signal: Complex[]): Complex[] {
  return fft(signal);
}

export function calculateBer(txBits: number[], rxBits: number[]): number {
  let errors = 0;
  const len = Math.min(txBits.length, rxBits.length);
  for (let i = 0; i < len; i++) {
    if (txBits[i] !== rxBits[i]) errors++;
  }
  return errors / len;
}

export function computeSpectrum(signal: Complex[]): Float64Array {
  const N = signal.length;
  const freq = fft(signal);
  const mag = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    mag[i] =
      Math.sqrt(freq[i].re * freq[i].re + freq[i].im * freq[i].im) / N;
  }
  return mag;
}
