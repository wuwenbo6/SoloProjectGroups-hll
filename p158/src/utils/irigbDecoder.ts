import { IRIGBTime, SymbolData } from '../types';

export const SYMBOL_DURATION_MS = 10;
export const PULSE_0_WIDTH_MS = 2;
export const PULSE_1_WIDTH_MS = 5;
export const PULSE_P_WIDTH_MS = 8;
export const SYMBOLS_PER_FRAME = 100;

export type IRIGBFormat = 'B000' | 'B001' | 'B002' | 'unknown';

export interface FormatDetectionResult {
  format: IRIGBFormat;
  symbolDuration: number;
  confidence: number;
  description: string;
}

export function detectFormat(
  symbols: SymbolData[],
  sampleRate: number
): FormatDetectionResult {
  if (symbols.length < 10) {
    return { format: 'unknown', symbolDuration: 10, confidence: 0, description: '数据不足' };
  }

  const durations: number[] = [];
  for (let i = 1; i < symbols.length; i++) {
    const interval = symbols[i].startTime - symbols[i - 1].startTime;
    if (interval > 0 && interval < 20) {
      durations.push(interval);
    }
  }

  if (durations.length < 5) {
    return { format: 'unknown', symbolDuration: 10, confidence: 0, description: '有效间隔不足' };
  }

  const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

  let format: IRIGBFormat = 'unknown';
  let confidence = 0;
  let description = '';

  if (Math.abs(avgDuration - 10) < 1.5) {
    format = 'B000';
    confidence = 0.9;
    description = 'IRIG-B B000 - 直流电平(DC) 100pps';
  } else if (Math.abs(avgDuration - 1) < 0.5) {
    format = 'B001';
    confidence = 0.7;
    description = 'IRIG-B B001 - 调制交流(AC) 1000pps';
  } else if (Math.abs(avgDuration - 100) < 10) {
    format = 'B002';
    confidence = 0.6;
    description = 'IRIG-B B002 - 1pps 秒脉冲';
  } else {
    format = 'unknown';
    confidence = 0.3;
    description = `未知格式 - 平均间隔: ${avgDuration.toFixed(2)}ms`;
  }

  return { format, symbolDuration: avgDuration, confidence, description };
}

export function classifySymbol(pulseWidthMs: number): '0' | '1' | 'P' | 'unknown' {
  const tolerance = 1.5;

  if (Math.abs(pulseWidthMs - PULSE_0_WIDTH_MS) < tolerance) {
    return '0';
  } else if (Math.abs(pulseWidthMs - PULSE_1_WIDTH_MS) < tolerance) {
    return '1';
  } else if (Math.abs(pulseWidthMs - PULSE_P_WIDTH_MS) < tolerance) {
    return 'P';
  }
  return 'unknown';
}

export function detectEdges(
  samples: Float32Array,
  sampleRate: number,
  threshold: number = 0.3
): { risingEdges: number[]; fallingEdges: number[] } {
  const risingEdges: number[] = [];
  const fallingEdges: number[] = [];

  let prevSample = samples[0];
  let inPulse = prevSample > threshold;

  for (let i = 1; i < samples.length; i++) {
    const sample = samples[i];

    if (!inPulse && sample > threshold && prevSample <= threshold) {
      risingEdges.push(i);
      inPulse = true;
    } else if (inPulse && sample < -threshold && prevSample >= -threshold) {
      fallingEdges.push(i);
      inPulse = false;
    }

    prevSample = sample;
  }

  return { risingEdges, fallingEdges };
}

export function detectEdgesDC(
  samples: Float32Array,
  sampleRate: number,
  threshold: number = 0.3
): { risingEdges: number[]; fallingEdges: number[] } {
  const risingEdges: number[] = [];
  const fallingEdges: number[] = [];

  let prevSample = samples[0];
  let inPulse = prevSample > threshold;

  for (let i = 1; i < samples.length; i++) {
    const sample = samples[i];

    if (!inPulse && sample > threshold && prevSample <= threshold) {
      risingEdges.push(i);
      inPulse = true;
    } else if (inPulse && sample < threshold * 0.5 && prevSample >= threshold * 0.5) {
      fallingEdges.push(i);
      inPulse = false;
    }

    prevSample = sample;
  }

  return { risingEdges, fallingEdges };
}

export function extractSymbols(
  risingEdges: number[],
  fallingEdges: number[],
  sampleRate: number
): SymbolData[] {
  const symbols: SymbolData[] = [];

  for (let i = 0; i < risingEdges.length; i++) {
    const risingIdx = risingEdges[i];

    let fallingIdx = -1;
    for (let j = 0; j < fallingEdges.length; j++) {
      if (fallingEdges[j] > risingIdx) {
        fallingIdx = fallingEdges[j];
        break;
      }
    }

    if (fallingIdx === -1) continue;

    const durationSamples = fallingIdx - risingIdx;
    const durationMs = (durationSamples / sampleRate) * 1000;
    const startTimeMs = (risingIdx / sampleRate) * 1000;

    const type = classifySymbol(durationMs);

    symbols.push({
      type,
      startTime: startTimeMs,
      duration: durationMs,
      amplitude: 1,
    });
  }

  return symbols;
}

export function findFrameSync(symbols: SymbolData[], symbolDurationMs: number = 10): number {
  for (let i = 0; i < symbols.length - 10; i++) {
    let pCount = 0;
    let validSequence = true;

    for (let j = 0; j < 10 && i + j < symbols.length; j++) {
      const symbol = symbols[i + j];
      if (j === 0 && symbol.type === 'P') {
        pCount++;
      } else if (j > 0) {
        const expectedInterval = j * symbolDurationMs;
        const actualInterval = symbol.startTime - symbols[i].startTime;

        if (Math.abs(actualInterval - expectedInterval) < symbolDurationMs * 0.2) {
          if (symbol.type === 'P') {
            pCount++;
          }
        } else {
          validSequence = false;
          break;
        }
      }
    }

    if (validSequence && pCount >= 2) {
      return i;
    }
  }

  return -1;
}

export function extractBCD(
  symbols: SymbolData[],
  startIndex: number,
  bitIndices: number[]
): number {
  let value = 0;
  for (let i = 0; i < bitIndices.length; i++) {
    const symbolIndex = startIndex + bitIndices[i];
    if (symbolIndex < symbols.length && symbols[symbolIndex].type === '1') {
      value += Math.pow(2, i);
    }
  }
  return value;
}

export function calculateFullYear(yearTwoDigit: number): number {
  const currentYear = new Date().getFullYear();
  const currentCentury = Math.floor(currentYear / 100) * 100;
  const currentTwoDigit = currentYear % 100;

  let fullYear = currentCentury + yearTwoDigit;

  if (fullYear > currentYear + 50) {
    fullYear -= 100;
  } else if (fullYear < currentYear - 50) {
    fullYear += 100;
  }

  if (fullYear >= 2000 && fullYear <= 2099) {
    return fullYear;
  }

  return Math.max(2000, Math.min(2099, fullYear));
}

export function decodeFrame(symbols: SymbolData[], frameStartIndex: number): IRIGBTime | null {
  if (frameStartIndex + SYMBOLS_PER_FRAME > symbols.length) {
    return null;
  }

  const secondUnits = extractBCD(symbols, frameStartIndex, [1, 2, 3, 4]);
  const secondTens = extractBCD(symbols, frameStartIndex, [6, 7, 8]);
  const second = secondTens * 10 + secondUnits;

  const minuteUnits = extractBCD(symbols, frameStartIndex, [10, 11, 12, 13]);
  const minuteTens = extractBCD(symbols, frameStartIndex, [15, 16, 17]);
  const minute = minuteTens * 10 + minuteUnits;

  const hourUnits = extractBCD(symbols, frameStartIndex, [20, 21, 22, 23]);
  const hourTens = extractBCD(symbols, frameStartIndex, [25, 26]);
  const hour = hourTens * 10 + hourUnits;

  const dayUnits = extractBCD(symbols, frameStartIndex, [30, 31, 32, 33]);
  const dayTens = extractBCD(symbols, frameStartIndex, [35, 36, 37, 38]);
  const dayHundreds = extractBCD(symbols, frameStartIndex, [40, 41]);
  const dayOfYear = dayHundreds * 100 + dayTens * 10 + dayUnits;

  const yearUnits = extractBCD(symbols, frameStartIndex, [50, 51, 52, 53]);
  const yearTens = extractBCD(symbols, frameStartIndex, [55, 56, 57, 58]);
  const yearTwoDigit = yearTens * 10 + yearUnits;

  const year = calculateFullYear(yearTwoDigit);

  if (second > 59 || minute > 59 || hour > 23 || dayOfYear < 1 || dayOfYear > 366) {
    return null;
  }

  if (yearTwoDigit > 99) {
    return null;
  }

  let validSymbols = 0;
  for (let i = 0; i < SYMBOLS_PER_FRAME && frameStartIndex + i < symbols.length; i++) {
    if (symbols[frameStartIndex + i].type !== 'unknown') {
      validSymbols++;
    }
  }
  const signalQuality = Math.round((validSymbols / SYMBOLS_PER_FRAME) * 100);

  return {
    year: yearTwoDigit,
    fullYear: year,
    dayOfYear,
    hour,
    minute,
    second,
    milliseconds: 0,
    timestamp: Date.now(),
    signalQuality,
  };
}

export function normalizeSamples(samples: Float32Array): Float32Array {
  const result = new Float32Array(samples.length);

  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i];
  }
  const dcOffset = sum / samples.length;

  let maxAbs = 0;
  for (let i = 0; i < samples.length; i++) {
    result[i] = samples[i] - dcOffset;
    maxAbs = Math.max(maxAbs, Math.abs(result[i]));
  }

  if (maxAbs > 0) {
    for (let i = 0; i < samples.length; i++) {
      result[i] /= maxAbs;
    }
  }

  return result;
}

export function calculateOptimalBufferSize(
  sampleRate: number,
  symbolDurationMs: number,
  symbolsToBuffer: number = 200
): number {
  const samplesPerSymbol = (symbolDurationMs / 1000) * sampleRate;
  const optimalSize = Math.ceil(samplesPerSymbol * symbolsToBuffer);

  const validBufferSizes = [512, 1024, 2048, 4096, 8192, 16384];
  let bestSize = 2048;

  for (const size of validBufferSizes) {
    if (size >= optimalSize) {
      bestSize = size;
      break;
    }
  }

  return bestSize;
}

export function generateTestSignal(sampleRate: number, durationSeconds: number): Float32Array {
  const numSamples = sampleRate * durationSeconds;
  const samples = new Float32Array(numSamples);
  const samplesPerSymbol = Math.floor((SYMBOL_DURATION_MS / 1000) * sampleRate);

  const now = new Date();
  const year = now.getFullYear() % 100;
  const dayOfYear = Math.floor(
    (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24)
  );
  const hour = now.getHours();
  const minute = now.getMinutes();
  const second = now.getSeconds();

  const frameData: string[] = new Array(100).fill('0');

  const setBCD = (startIdx: number, value: number, digits: number) => {
    const str = value.toString().padStart(digits, '0');
    for (let d = 0; d < digits; d++) {
      const digit = parseInt(str[digits - 1 - d]);
      for (let b = 0; b < 4; b++) {
        if (startIdx + d * 10 + b < 100) {
          frameData[startIdx + d * 10 + b] = (digit & (1 << b)) ? '1' : '0';
        }
      }
    }
  };

  for (let i = 0; i < 10; i++) {
    frameData[i * 10] = 'P';
  }

  setBCD(1, second, 2);
  setBCD(10, minute, 2);
  setBCD(20, hour, 2);
  setBCD(30, dayOfYear, 3);
  setBCD(50, year, 2);

  for (let s = 0; s < 100; s++) {
    const symbolType = frameData[s];
    let pulseWidthSamples: number;

    if (symbolType === 'P') {
      pulseWidthSamples = Math.floor((PULSE_P_WIDTH_MS / 1000) * sampleRate);
    } else if (symbolType === '1') {
      pulseWidthSamples = Math.floor((PULSE_1_WIDTH_MS / 1000) * sampleRate);
    } else {
      pulseWidthSamples = Math.floor((PULSE_0_WIDTH_MS / 1000) * sampleRate);
    }

    const startSample = s * samplesPerSymbol;

    for (let i = 0; i < samplesPerSymbol && startSample + i < numSamples; i++) {
      if (i < pulseWidthSamples) {
        samples[startSample + i] = 0.8;
      } else {
        samples[startSample + i] = 0;
      }
    }
  }

  return samples;
}
