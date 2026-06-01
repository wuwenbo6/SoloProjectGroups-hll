import * as fs from 'fs';
import * as path from 'path';
import { WaveFile } from 'wavefile';
import type { WavFileInfo } from './types';

export interface WavData {
  info: WavFileInfo;
  samples: Float64Array;
  sampleRate: number;
}

export class WavReader {
  static readFile(filePath: string): WavData {
    const stats = fs.statSync(filePath);
    const buffer = fs.readFileSync(filePath);
    const wav = new WaveFile(buffer) as any;

    const sampleRate = wav.fmt.sampleRate as number;
    const channels = wav.fmt.numChannels as number;
    const bitsPerSample = wav.fmt.bitsPerSample as number;
    const samples = wav.getSamples(false, Float64Array) as Float64Array;

    const monoSamples = channels > 1
      ? this.toMono(samples, channels)
      : samples;

    const duration = monoSamples.length / sampleRate;

    return {
      info: {
        path: filePath,
        name: path.basename(filePath),
        sampleRate,
        channels,
        bitsPerSample,
        duration,
        size: stats.size,
      },
      samples: monoSamples,
      sampleRate,
    };
  }

  private static toMono(samples: Float64Array, channels: number): Float64Array {
    const monoLength = Math.floor(samples.length / channels);
    const mono = new Float64Array(monoLength);

    for (let i = 0; i < monoLength; i++) {
      let sum = 0;
      for (let ch = 0; ch < channels; ch++) {
        sum += samples[i * channels + ch];
      }
      mono[i] = sum / channels;
    }

    return mono;
  }

  static normalize(samples: Float64Array): Float64Array {
    let max = 0;
    for (let i = 0; i < samples.length; i++) {
      const abs = Math.abs(samples[i]);
      if (abs > max) max = abs;
    }

    if (max === 0) return samples;

    const normalized = new Float64Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      normalized[i] = samples[i] / max;
    }

    return normalized;
  }
}
