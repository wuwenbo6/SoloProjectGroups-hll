export interface SMPTETime {
  hours: number;
  minutes: number;
  seconds: number;
  frames: number;
  userBits?: number[];
  dropFrame?: boolean;
  colorFrame?: boolean;
  binaryGroupFlags?: number;
}

export type FrameRate = '24' | '25' | '30' | '30drop';

export const FRAME_RATE_CONFIG: Record<FrameRate, { fps: number; bitsPerFrame: number; dropFrame: boolean }> = {
  '24': { fps: 24, bitsPerFrame: 80, dropFrame: false },
  '25': { fps: 25, bitsPerFrame: 100, dropFrame: false },
  '30': { fps: 30, bitsPerFrame: 100, dropFrame: false },
  '30drop': { fps: 30, bitsPerFrame: 100, dropFrame: true },
};

export function encodeBCD(value: number, digits: number): number[] {
  const result: number[] = [];
  const str = value.toString().padStart(digits, '0');
  for (let i = digits - 1; i >= 0; i--) {
    const digit = parseInt(str[i]);
    for (let b = 0; b < 4; b++) {
      result.push((digit >> b) & 1);
    }
  }
  return result;
}

export function parseSMPTEFromDate(date: Date, frameRate: FrameRate = '25'): SMPTETime {
  const config = FRAME_RATE_CONFIG[frameRate];
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();
  const milliseconds = date.getMilliseconds();
  const frames = Math.floor((milliseconds / 1000) * config.fps) % config.fps;

  return {
    hours,
    minutes,
    seconds,
    frames,
    dropFrame: config.dropFrame,
  };
}

export function encodeLTCFrame(time: SMPTETime, frameRate: FrameRate = '25'): number[] {
  const bits: number[] = [];

  const frameUnits = time.frames % 10;
  const frameTens = Math.floor(time.frames / 10);
  const secondUnits = time.seconds % 10;
  const secondTens = Math.floor(time.seconds / 10);
  const minuteUnits = time.minutes % 10;
  const minuteTens = Math.floor(time.minutes / 10);
  const hourUnits = time.hours % 10;
  const hourTens = Math.floor(time.hours / 10);

  for (let i = 0; i < 4; i++) bits.push((frameUnits >> i) & 1);
  bits.push(time.dropFrame ? 1 : 0);
  bits.push(time.colorFrame ? 1 : 0);
  for (let i = 0; i < 2; i++) bits.push((frameTens >> i) & 1);
  for (let i = 0; i < 4; i++) bits.push(0);

  for (let i = 0; i < 4; i++) bits.push((secondUnits >> i) & 1);
  bits.push(0);
  for (let i = 0; i < 3; i++) bits.push((secondTens >> i) & 1);
  for (let i = 0; i < 4; i++) bits.push(0);

  for (let i = 0; i < 4; i++) bits.push((minuteUnits >> i) & 1);
  bits.push(0);
  for (let i = 0; i < 3; i++) bits.push((minuteTens >> i) & 1);
  for (let i = 0; i < 4; i++) bits.push(0);

  for (let i = 0; i < 4; i++) bits.push((hourUnits >> i) & 1);
  bits.push(0);
  for (let i = 0; i < 2; i++) bits.push((hourTens >> i) & 1);
  bits.push(time.binaryGroupFlags ? 1 : 0);
  bits.push(0);
  for (let i = 0; i < 4; i++) bits.push(0);

  for (let i = 0; i < 16; i++) bits.push(0);

  const syncWord = [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1];
  bits.push(...syncWord);

  return bits;
}

export function biphaseMarkEncode(bits: number[]): number[] {
  const encoded: number[] = [];
  let previousState = 0;

  for (const bit of bits) {
    encoded.push(1 - previousState);
    previousState = 1 - previousState;

    if (bit === 1) {
      encoded.push(1 - previousState);
      previousState = 1 - previousState;
    }
  }

  return encoded;
}

export function generateLTCAudio(
  bits: number[],
  sampleRate: number = 48000,
  frequency: number = 2400,
  amplitude: number = 0.5
): Float32Array {
  const bitRate = 2400;
  const samplesPerBit = sampleRate / bitRate;
  const totalSamples = Math.floor(bits.length * samplesPerBit * 2);
  const samples = new Float32Array(totalSamples);

  let phase = 0;
  let bitIndex = 0;
  let transitionCount = 0;

  for (let i = 0; i < totalSamples; i++) {
    const currentBitPosition = (i / samplesPerBit) % 2;

    if (currentBitPosition < 1) {
      transitionCount = 0;
    }

    const bit = bits[bitIndex % bits.length];
    const shouldTransition = currentBitPosition < 0.01 || (bit === 1 && currentBitPosition > 0.49 && currentBitPosition < 0.51);

    if (shouldTransition && transitionCount < 2) {
      phase += Math.PI;
      transitionCount++;
    }

    const sample = Math.sin(phase) * amplitude;
    samples[i] = sample;

    phase += (2 * Math.PI * frequency) / sampleRate;

    if (currentBitPosition > 1.99) {
      bitIndex++;
    }
  }

  return samples;
}

export function generateLTCFromTime(
  time: SMPTETime,
  frameRate: FrameRate = '25',
  sampleRate: number = 48000,
  durationSeconds: number = 1
): Float32Array {
  const config = FRAME_RATE_CONFIG[frameRate];
  const totalFrames = Math.ceil(config.fps * durationSeconds);
  const allSamples: number[] = [];

  let currentTime = { ...time };

  for (let f = 0; f < totalFrames; f++) {
    const bits = encodeLTCFrame(currentTime, frameRate);
    const biphaseBits = biphaseMarkEncode(bits);
    const audio = generateLTCAudio(biphaseBits, sampleRate);
    allSamples.push(...Array.from(audio));

    currentTime.frames++;
    if (currentTime.frames >= config.fps) {
      currentTime.frames = 0;
      currentTime.seconds++;
      if (currentTime.seconds >= 60) {
        currentTime.seconds = 0;
        currentTime.minutes++;
        if (currentTime.minutes >= 60) {
          currentTime.minutes = 0;
          currentTime.hours++;
          if (currentTime.hours >= 24) {
            currentTime.hours = 0;
          }
        }
      }
    }
  }

  return new Float32Array(allSamples);
}

export function generateLTCFromDate(
  date: Date,
  frameRate: FrameRate = '25',
  sampleRate: number = 48000,
  durationSeconds: number = 1
): Float32Array {
  const smpteTime = parseSMPTEFromDate(date, frameRate);
  return generateLTCFromTime(smpteTime, frameRate, sampleRate, durationSeconds);
}

export function formatSMPTETime(time: SMPTETime, frameRate: FrameRate = '25'): string {
  const h = time.hours.toString().padStart(2, '0');
  const m = time.minutes.toString().padStart(2, '0');
  const s = time.seconds.toString().padStart(2, '0');
  const f = time.frames.toString().padStart(2, '0');
  const separator = time.dropFrame ? ';' : ':';
  return `${h}:${m}:${s}${separator}${f}`;
}

export function generateLTCWAV(
  samples: Float32Array,
  sampleRate: number = 48000
): ArrayBuffer {
  const numChannels = 1;
  const bytesPerSample = 2;
  const byteRate = sampleRate * numChannels * bytesPerSample;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = samples.length * bytesPerSample;
  const bufferSize = 44 + dataSize;

  const buffer = new ArrayBuffer(bufferSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    const intSample = Math.round(sample * 32767);
    view.setInt16(offset, intSample, true);
    offset += 2;
  }

  return buffer;
}

export function downloadWAV(buffer: ArrayBuffer, filename: string = 'ltc_output.wav'): void {
  const blob = new Blob([buffer], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export class LTCAudioPlayer {
  private audioContext: AudioContext | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private isPlaying: boolean = false;

  async play(samples: Float32Array, sampleRate: number = 48000, loop: boolean = false): Promise<void> {
    this.stop();

    this.audioContext = new AudioContext({ sampleRate });
    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.value = 0.5;
    this.gainNode.connect(this.audioContext.destination);

    const audioBuffer = this.audioContext.createBuffer(1, samples.length, sampleRate);
    audioBuffer.copyToChannel(samples, 0);

    this.sourceNode = this.audioContext.createBufferSource();
    this.sourceNode.buffer = audioBuffer;
    this.sourceNode.loop = loop;
    this.sourceNode.connect(this.gainNode);

    this.sourceNode.onended = () => {
      this.isPlaying = false;
    };

    this.sourceNode.start();
    this.isPlaying = true;
  }

  stop(): void {
    if (this.sourceNode) {
      try {
        this.sourceNode.stop();
      } catch (e) {}
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.isPlaying = false;
  }

  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  setVolume(volume: number): void {
    if (this.gainNode) {
      this.gainNode.gain.value = Math.max(0, Math.min(1, volume));
    }
  }
}

export const ltcPlayer = new LTCAudioPlayer();
