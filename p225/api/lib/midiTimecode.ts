import type { MidiTimeCode } from '../../shared/types.js';

type MtcRate = MidiTimeCode['rate'];

const RATE_MAP: Record<number, MtcRate> = {
  0: '24',
  1: '25',
  2: '30drop',
  3: '30',
};

const RATE_VALUES: Record<MtcRate, number> = {
  '24': 24,
  '25': 25,
  '30drop': 29.97,
  '30': 30,
};

export class MidiTimeCodeParser {
  private lastFullTime: MidiTimeCode = {
    hours: 0,
    minutes: 0,
    seconds: 0,
    frames: 0,
    rate: '25',
    full: '00:00:00:00',
  };

  private quarterFrameBuffer: number[] = new Array(8).fill(0);
  private quarterFrameCount = 0;

  parseMidiMessage(data: Uint8Array): MidiTimeCode | null {
    if (data.length < 2) return null;

    const status = data[0];
    const byte1 = data[1];

    if (status === 0xf1) {
      return this.parseQuarterFrame(byte1);
    }

    if (status === 0xf0 && data.length >= 10) {
      return this.parseSysExFullFrame(data);
    }

    return null;
  }

  private parseQuarterFrame(data: number): MidiTimeCode | null {
    const piece = (data >> 4) & 0x07;
    const value = data & 0x0f;

    this.quarterFrameBuffer[piece] = value;
    this.quarterFrameCount++;

    if (piece === 7 && this.quarterFrameCount >= 8) {
      this.quarterFrameCount = 0;
      return this.assembleFromQuarterFrames();
    }

    return null;
  }

  private assembleFromQuarterFrames(): MidiTimeCode {
    const buf = this.quarterFrameBuffer;

    const frames = buf[0] | ((buf[1] & 0x01) << 4);
    const seconds = (buf[1] >> 1) | ((buf[2] & 0x03) << 3);
    const minutes = (buf[2] >> 2) | ((buf[3] & 0x03) << 2);
    const hours = (buf[3] >> 2) | ((buf[7] & 0x01) << 1);
    const rateIndex = (buf[7] >> 1) & 0x03;

    const rate = RATE_MAP[rateIndex] || '25';
    const full = this.formatTime(hours, minutes, seconds, frames);

    this.lastFullTime = { hours, minutes, seconds, frames, rate, full };
    return this.lastFullTime;
  }

  private parseSysExFullFrame(data: Uint8Array): MidiTimeCode | null {
    if (data.length < 10) return null;
    if (data[0] !== 0xf0 || data[1] !== 0x7f) return null;
    if (data[3] !== 0x01 || data[4] !== 0x01) return null;

    const rateIndex = (data[5] >> 5) & 0x03;
    const hours = data[5] & 0x1f;
    const minutes = data[6];
    const seconds = data[7];
    const frames = data[8];

    const rate = RATE_MAP[rateIndex] || '25';
    const full = this.formatTime(hours, minutes, seconds, frames);

    this.lastFullTime = { hours, minutes, seconds, frames, rate, full };
    return this.lastFullTime;
  }

  private formatTime(
    h: number,
    m: number,
    s: number,
    f: number
  ): string {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
  }

  getLastTime(): MidiTimeCode {
    return { ...this.lastFullTime };
  }
}

export class SimulatedMtcGenerator {
  private startTime = Date.now();
  private rate: MtcRate = '25';
  private offsetMs = 0;
  private paused = false;
  private pauseTime = 0;

  setRate(rate: MtcRate): void {
    this.rate = rate;
  }

  pause(): void {
    if (!this.paused) {
      this.paused = true;
      this.pauseTime = Date.now();
    }
  }

  resume(): void {
    if (this.paused) {
      this.paused = false;
      this.offsetMs += Date.now() - this.pauseTime;
    }
  }

  reset(): void {
    this.startTime = Date.now();
    this.offsetMs = 0;
    this.paused = false;
  }

  getTime(): MidiTimeCode {
    const now = this.paused ? this.pauseTime : Date.now();
    const elapsedMs = now - this.startTime - this.offsetMs;
    const frameRate = RATE_VALUES[this.rate];

    const totalFrames = Math.floor((elapsedMs / 1000) * frameRate);
    const framesPerHour = Math.floor(frameRate * 3600);
    const framesPerMinute = Math.floor(frameRate * 60);
    const framesPerSecond = Math.floor(frameRate);

    const hours = Math.floor(totalFrames / framesPerHour);
    const remainingAfterHours = totalFrames % framesPerHour;
    const minutes = Math.floor(remainingAfterHours / framesPerMinute);
    const remainingAfterMinutes = remainingAfterHours % framesPerMinute;
    const seconds = Math.floor(remainingAfterMinutes / framesPerSecond);
    const frames = remainingAfterMinutes % framesPerSecond;

    const full = `${String(hours % 24).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;

    return {
      hours: hours % 24,
      minutes,
      seconds,
      frames,
      rate: this.rate,
      full,
    };
  }
}

export function timecodeToMs(timecode: MidiTimeCode): number {
  const frameRate = RATE_VALUES[timecode.rate];
  return (
    (timecode.hours * 3600 + timecode.minutes * 60 + timecode.seconds) * 1000 +
    (timecode.frames / frameRate) * 1000
  );
}

export function msToTimecode(ms: number, rate: MtcRate = '25'): MidiTimeCode {
  const frameRate = RATE_VALUES[rate];
  const totalFrames = Math.floor((ms / 1000) * frameRate);
  const framesPerHour = Math.floor(frameRate * 3600);
  const framesPerMinute = Math.floor(frameRate * 60);
  const framesPerSecond = Math.floor(frameRate);

  const hours = Math.floor(totalFrames / framesPerHour);
  const remainingAfterHours = totalFrames % framesPerHour;
  const minutes = Math.floor(remainingAfterHours / framesPerMinute);
  const remainingAfterMinutes = remainingAfterHours % framesPerMinute;
  const seconds = Math.floor(remainingAfterMinutes / framesPerSecond);
  const frames = remainingAfterMinutes % framesPerSecond;

  const full = `${String(hours % 24).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;

  return { hours: hours % 24, minutes, seconds, frames, rate, full };
}
