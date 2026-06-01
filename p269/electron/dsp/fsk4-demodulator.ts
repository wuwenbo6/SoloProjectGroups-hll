import type { DemodulationConfig, DemodulationResult } from './types';

const SYMBOL_MAP = [-3, -1, 1, 3];

export class Fsk4Demodulator {
  private config: DemodulationConfig;
  private sampleRate: number;
  private samplesPerSymbol: number;

  constructor(config: DemodulationConfig, sampleRate: number) {
    this.config = config;
    this.sampleRate = sampleRate;
    this.samplesPerSymbol = sampleRate / config.symbolRate;
  }

  demodulate(samples: Float64Array): DemodulationResult {
    const normalized = this.normalize(samples);
    const frequencyShifted = this.frequencyShift(normalized);
    const filtered = this.lowPassFilter(frequencyShifted);
    const discriminator = this.frequencyDiscriminator(filtered);
    const symbols = this.symbolDecision(discriminator);
    const syncedSymbols = this.symbolSynchronization(symbols, discriminator);

    const snr = this.estimateSNR(filtered);
    const freqOffset = this.estimateFrequencyOffset(discriminator);
    const ser = this.estimateSER(syncedSymbols);
    const qualityScore = this.calculateQualityScore(snr, ser);

    return {
      symbols: syncedSymbols,
      snr,
      frequencyOffset: freqOffset,
      symbolErrorRate: ser,
      qualityScore,
    };
  }

  private normalize(samples: Float64Array): Float64Array {
    let max = 0;
    for (let i = 0; i < samples.length; i++) {
      const abs = Math.abs(samples[i]);
      if (abs > max) max = abs;
    }
    if (max === 0) return samples;

    const result = new Float64Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      result[i] = samples[i] / max;
    }
    return result;
  }

  private frequencyShift(samples: Float64Array): Float64Array {
    const { centerFrequency } = this.config;
    if (centerFrequency === 0) return samples;

    const result = new Float64Array(samples.length);
    const phaseStep = (2 * Math.PI * centerFrequency) / this.sampleRate;

    for (let i = 0; i < samples.length; i++) {
      const phase = i * phaseStep;
      result[i] = samples[i] * Math.cos(phase);
    }

    return result;
  }

  private lowPassFilter(samples: Float64Array): Float64Array {
    const cutoff = this.config.symbolRate * 1.5;
    const filterLength = Math.floor(this.samplesPerSymbol * 4) | 1;
    const halfLength = (filterLength - 1) / 2;

    const coefficients = new Float64Array(filterLength);
    const fc = cutoff / this.sampleRate;

    for (let i = 0; i < filterLength; i++) {
      const n = i - halfLength;
      if (n === 0) {
        coefficients[i] = 2 * Math.PI * fc;
      } else {
        coefficients[i] = Math.sin(2 * Math.PI * fc * n) / n;
      }
      coefficients[i] *= 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (filterLength - 1));
    }

    let sum = 0;
    for (let i = 0; i < filterLength; i++) {
      sum += coefficients[i];
    }
    for (let i = 0; i < filterLength; i++) {
      coefficients[i] /= sum;
    }

    const result = new Float64Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      let acc = 0;
      for (let j = 0; j < filterLength; j++) {
        const idx = i - j + halfLength;
        if (idx >= 0 && idx < samples.length) {
          acc += samples[idx] * coefficients[j];
        }
      }
      result[i] = acc;
    }

    return result;
  }

  private frequencyDiscriminator(samples: Float64Array): Float64Array {
    const result = new Float64Array(samples.length);
    const delayLine = new Float64Array(Math.floor(this.samplesPerSymbol));

    for (let i = 0; i < samples.length; i++) {
      const delayed = delayLine[i % delayLine.length];
      delayLine[i % delayLine.length] = samples[i];

      if (i >= delayLine.length) {
        const phaseDiff = Math.atan2(
          samples[i] * delayed - 0,
          samples[i] * delayed + 0
        );
        result[i] = phaseDiff;
      }
    }

    return this.differentiate(result);
  }

  private differentiate(samples: Float64Array): Float64Array {
    const result = new Float64Array(samples.length);
    for (let i = 1; i < samples.length; i++) {
      result[i] = samples[i] - samples[i - 1];
    }
    result[0] = result[1] || 0;
    return result;
  }

  private symbolDecision(discriminator: Float64Array): number[] {
    const symbols: number[] = [];
    const step = Math.floor(this.samplesPerSymbol);

    for (let i = 0; i < discriminator.length; i += step) {
      let sum = 0;
      let count = 0;
      for (let j = 0; j < step && i + j < discriminator.length; j++) {
        sum += discriminator[i + j];
        count++;
      }
      const avg = sum / count;
      symbols.push(this.quantize(avg));
    }

    return symbols;
  }

  private quantize(value: number): number {
    const threshold = this.config.frequencyDeviation / 2;
    if (value > threshold * 1.5) return 3;
    if (value > 0) return 1;
    if (value > -threshold * 1.5) return -1;
    return -3;
  }

  private symbolSynchronization(symbols: number[], discriminator: Float64Array): number[] {
    const sps = Math.floor(this.samplesPerSymbol);
    let bestOffset = 0;
    let maxQuality = -Infinity;

    for (let offset = 0; offset < sps; offset++) {
      let quality = 0;
      for (let i = offset; i < discriminator.length - sps; i += sps) {
        const peak = Math.abs(discriminator[i + Math.floor(sps / 2)]);
        quality += peak;
      }
      if (quality > maxQuality) {
        maxQuality = quality;
        bestOffset = offset;
      }
    }

    const synced: number[] = [];
    for (let i = bestOffset; i < discriminator.length; i += sps) {
      let sum = 0;
      let count = 0;
      for (let j = 0; j < sps && i + j < discriminator.length; j++) {
        sum += discriminator[i + j];
        count++;
      }
      if (count > 0) {
        synced.push(this.quantize(sum / count));
      }
    }

    return synced;
  }

  private estimateSNR(samples: Float64Array): number {
    let signalPower = 0;
    let noisePower = 0;

    for (let i = 0; i < samples.length; i++) {
      signalPower += samples[i] * samples[i];
    }
    signalPower /= samples.length;

    for (let i = 1; i < samples.length; i++) {
      const diff = samples[i] - samples[i - 1];
      noisePower += diff * diff;
    }
    noisePower /= samples.length;

    if (noisePower === 0) return 30;
    return 10 * Math.log10(signalPower / noisePower);
  }

  private estimateFrequencyOffset(discriminator: Float64Array): number {
    let sum = 0;
    for (let i = 0; i < discriminator.length; i++) {
      sum += discriminator[i];
    }
    return (sum / discriminator.length) * (this.sampleRate / (2 * Math.PI));
  }

  private estimateSER(symbols: number[]): number {
    let transitions = 0;
    for (let i = 1; i < symbols.length; i++) {
      if (symbols[i] !== symbols[i - 1]) {
        transitions++;
      }
    }
    return Math.min(0.5, transitions / symbols.length);
  }

  private calculateQualityScore(snr: number, ser: number): number {
    const snrScore = Math.min(100, Math.max(0, (snr + 5) * 5));
    const serScore = Math.min(100, Math.max(0, (1 - ser * 2) * 100));
    return Math.round((snrScore + serScore) / 2);
  }

  static generateTestSymbols(length: number): number[] {
    const symbols: number[] = [];
    for (let i = 0; i < length; i++) {
      symbols.push(SYMBOL_MAP[Math.floor(Math.random() * 4)]);
    }
    return symbols;
  }

  static modulate(symbols: number[], sampleRate: number, symbolRate: number, freqDev: number): Float64Array {
    const sps = Math.floor(sampleRate / symbolRate);
    const samples = new Float64Array(symbols.length * sps);
    let phase = 0;

    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];
      const freq = (symbol / 3) * freqDev;
      const phaseStep = (2 * Math.PI * freq) / sampleRate;

      for (let j = 0; j < sps; j++) {
        const idx = i * sps + j;
        samples[idx] = Math.sin(phase);
        phase += phaseStep;
      }
    }

    return samples;
  }
}
