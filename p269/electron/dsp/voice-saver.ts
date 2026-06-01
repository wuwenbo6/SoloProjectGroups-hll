import * as fs from 'fs';
import * as path from 'path';
import { WaveFile } from 'wavefile';

export interface VoiceSegment {
  slot: number;
  startTime: number;
  endTime: number;
  callType: string;
  talkgroupId?: number;
  sourceId?: number;
  destinationId?: number;
  samples: Float32Array[];
}

export class VoiceSaver {
  private outputDir: string;
  private sampleRate: number;

  constructor(outputDir: string, sampleRate: number = 48000) {
    this.outputDir = outputDir;
    this.sampleRate = sampleRate;
    this.ensureOutputDir();
  }

  private ensureOutputDir(): void {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  private mergeSamples(sampleArrays: Float32Array[]): Float32Array {
    let totalLength = 0;
    for (const arr of sampleArrays) {
      totalLength += arr.length;
    }
    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const arr of sampleArrays) {
      merged.set(arr, offset);
      offset += arr.length;
    }
    return merged;
  }

  private generateFileName(segment: VoiceSegment, index: number): string {
    const timeStr = this.formatTime(segment.startTime);
    const tgStr = segment.talkgroupId ? `_TG${segment.talkgroupId}` : '';
    const slotStr = `_SL${segment.slot}`;
    const typeStr = `_${segment.callType}`;
    return `call_${index.toString().padStart(4, '0')}${timeStr}${slotStr}${tgStr}${typeStr}.wav`;
  }

  private formatTime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    return `_${hours.toString().padStart(2, '0')}${(minutes % 60).toString().padStart(2, '0')}${(seconds % 60).toString().padStart(2, '0')}`;
  }

  saveVoiceSegment(segment: VoiceSegment, index: number): string | null {
    if (segment.samples.length === 0) return null;

    try {
      const mergedSamples = this.mergeSamples(segment.samples);
      const intSamples = new Int16Array(mergedSamples.length);
      
      for (let i = 0; i < mergedSamples.length; i++) {
        const sample = Math.max(-1, Math.min(1, mergedSamples[i]));
        intSamples[i] = Math.round(sample * 32767);
      }

      const wav = new WaveFile();
      wav.fromScratch(1, this.sampleRate, '16', intSamples);

      const fileName = this.generateFileName(segment, index);
      const filePath = path.join(this.outputDir, fileName);
      
      fs.writeFileSync(filePath, wav.toBuffer());
      
      return filePath;
    } catch (error) {
      console.error('Failed to save voice segment:', error);
      return null;
    }
  }

  saveAllVoiceSegments(segments: VoiceSegment[]): Array<{ index: number; filePath: string | null }> {
    const results: Array<{ index: number; filePath: string | null }> = [];
    
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      if (segment.samples.length > 0) {
        const filePath = this.saveVoiceSegment(segment, i + 1);
        results.push({ index: i + 1, filePath });
      }
    }
    
    return results;
  }

  getOutputDir(): string {
    return this.outputDir;
  }
}
