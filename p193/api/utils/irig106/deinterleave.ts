import type { PcmDeinterleaveConfig, PcmDeinterleaveResult, DeinterleavedChannel } from '../../../shared/types';

export function deinterleavePcmData(
  dataBuffer: Buffer,
  config: PcmDeinterleaveConfig
): PcmDeinterleaveResult {
  const errors: string[] = [];
  const { channelCount, frameSize } = config;

  if (channelCount < 1) {
    return {
      success: false,
      channels: [],
      totalSamplesPerChannel: 0,
      errors: ['Channel count must be at least 1']
    };
  }

  if (frameSize < channelCount * 2) {
    errors.push(`Frame size (${frameSize}) too small for ${channelCount} channels (need ${channelCount * 2} bytes)`);
  }

  const samplesPerFrame = Math.floor(frameSize / 2);
  const totalSamples = Math.floor(dataBuffer.length / 2);
  const totalFrames = Math.floor(totalSamples / samplesPerFrame);
  const totalSamplesPerChannel = totalFrames * Math.floor(samplesPerFrame / channelCount);

  if (totalFrames === 0) {
    return {
      success: false,
      channels: [],
      totalSamplesPerChannel: 0,
      errors: ['Not enough data for even one frame']
    };
  }

  const channels: DeinterleavedChannel[] = [];
  const sampleSize = 2;

  for (let ch = 0; ch < channelCount; ch++) {
    const samples: number[] = [];
    let minSample = Infinity;
    let maxSample = -Infinity;
    let sum = 0;

    for (let frame = 0; frame < totalFrames; frame++) {
      const sampleInFrame = Math.floor(samplesPerFrame / channelCount);
      for (let s = 0; s < sampleInFrame; s++) {
        const sampleIndex = frame * samplesPerFrame + s * channelCount + ch;
        if (sampleIndex * sampleSize + sampleSize <= dataBuffer.length) {
          const sample = dataBuffer.readInt16LE(sampleIndex * sampleSize);
          samples.push(sample);
          minSample = Math.min(minSample, sample);
          maxSample = Math.max(maxSample, sample);
          sum += sample;
        }
      }
    }

    channels.push({
      channelIndex: ch,
      channelName: config.channelNames?.[ch] || `Channel ${ch + 1}`,
      samples,
      sampleCount: samples.length,
      minSample: minSample === Infinity ? 0 : minSample,
      maxSample: maxSample === -Infinity ? 0 : maxSample,
      avgSample: samples.length > 0 ? sum / samples.length : 0
    });
  }

  if (config.syncPattern && config.syncPattern.length > 0) {
    const syncErrors = validateSyncPattern(dataBuffer, config.syncPattern);
    errors.push(...syncErrors);
  }

  return {
    success: errors.length === 0 || channels.length > 0,
    channels,
    totalSamplesPerChannel,
    errors
  };
}

function validateSyncPattern(dataBuffer: Buffer, syncPattern: number[]): string[] {
  const errors: string[] = [];
  const syncBytes = Buffer.from(syncPattern);
  let offset = 0;
  let syncFound = 0;

  while (offset < dataBuffer.length - syncBytes.length) {
    const pos = dataBuffer.indexOf(syncBytes, offset);
    if (pos === -1) break;
    syncFound++;
    offset = pos + 1;
  }

  if (syncFound === 0) {
    errors.push('Sync pattern not found in data');
  }

  return errors;
}

export function detectInterleavePattern(
  dataBuffer: Buffer,
  maxChannels: number = 16
): { channelCount: number; frameSize: number; confidence: number } | null {
  const sampleCount = Math.floor(dataBuffer.length / 2);
  if (sampleCount < 100) return null;

  const samples: number[] = [];
  for (let i = 0; i < Math.min(sampleCount, 1024); i++) {
    samples.push(dataBuffer.readInt16LE(i * 2));
  }

  let bestScore = 0;
  let bestConfig = null;

  for (let ch = 1; ch <= maxChannels; ch++) {
    for (let frameWords = ch; frameWords <= ch * 8; frameWords++) {
      const frameSize = frameWords * 2;
      const score = evaluatePattern(samples, ch, frameWords);
      if (score > bestScore) {
        bestScore = score;
        bestConfig = {
          channelCount: ch,
          frameSize,
          confidence: Math.min(score, 1.0)
        };
      }
    }
  }

  return bestConfig;
}

function evaluatePattern(samples: number[], channelCount: number, samplesPerFrame: number): number {
  const channels: number[][] = Array.from({ length: channelCount }, () => []);

  const framesToTest = Math.min(Math.floor(samples.length / samplesPerFrame), 32);

  for (let frame = 0; frame < framesToTest; frame++) {
    const wordsPerCh = Math.floor(samplesPerFrame / channelCount);
    for (let s = 0; s < wordsPerCh; s++) {
      for (let ch = 0; ch < channelCount; ch++) {
        const idx = frame * samplesPerFrame + s * channelCount + ch;
        if (idx < samples.length) {
          channels[ch].push(samples[idx]);
        }
      }
    }
  }

  let totalVariance = 0;
  for (const ch of channels) {
    if (ch.length < 2) continue;
    const mean = ch.reduce((a, b) => a + b, 0) / ch.length;
    const variance = ch.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / ch.length;
    totalVariance += variance;
  }

  const avgVariance = totalVariance / channelCount;
  const score = avgVariance > 0 ? 1 / (1 + avgVariance / 1000000) : 0.5;

  return score;
}

export function serializeDeinterleaveResult(
  result: PcmDeinterleaveResult,
  maxSamplesPerChannel: number = 128
): Record<string, unknown> {
  return {
    success: result.success,
    totalSamplesPerChannel: result.totalSamplesPerChannel,
    errors: result.errors,
    channels: result.channels.map(ch => ({
      ...ch,
      samples: ch.samples.slice(0, maxSamplesPerChannel),
      samplesTruncated: ch.samples.length > maxSamplesPerChannel,
      totalSamples: ch.samples.length
    }))
  };
}
