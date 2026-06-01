export interface IRIGBTime {
  year: number;
  fullYear: number;
  dayOfYear: number;
  hour: number;
  minute: number;
  second: number;
  milliseconds: number;
  timestamp: number;
  signalQuality: number;
}

export type IRIGBFormat = 'B000' | 'B001' | 'B002' | 'unknown';

export interface FormatInfo {
  format: IRIGBFormat;
  symbolDuration: number;
  confidence: number;
  description: string;
  bufferSize: number;
}

export interface AudioState {
  isRecording: boolean;
  sampleRate: number;
  volume: number;
  deviceId: string | null;
  devices: MediaDeviceInfo[];
  bufferSize: number;
}

export interface AccuracyData {
  deviation: number;
  avgDeviation: number;
  maxDeviation: number;
  minDeviation: number;
  stdDeviation: number;
  history: { time: string; deviation: number }[];
}

export interface SymbolData {
  type: '0' | '1' | 'P' | 'unknown';
  startTime: number;
  duration: number;
  amplitude: number;
}

export interface DecoderState {
  symbols: SymbolData[];
  frameData: number[];
  isFrameLocked: boolean;
  frameStartIndex: number;
  formatInfo: FormatInfo | null;
}

export type TimeSourceType = 'irigb' | 'system' | 'performance' | 'ntp' | 'http';

export interface TimeSource {
  id: string;
  name: string;
  type: TimeSourceType;
  description: string;
  isAvailable: boolean;
  isEnabled: boolean;
  priority: number;
}

export interface TimeReading {
  sourceId: string;
  timestamp: number;
  rawTime: number;
  uncertaintyMs: number;
}

export interface TimeSourceComparison {
  sourceId: string;
  sourceName: string;
  timestamp: number;
  offsetMs: number;
  uncertaintyMs: number;
}

export type FrameRate = '24' | '25' | '30' | '30drop';

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

export interface LTCState {
  isPlaying: boolean;
  frameRate: FrameRate;
  volume: number;
  isLoop: boolean;
  durationSeconds: number;
  currentTime: SMPTETime | null;
}

export interface AppState {
  audio: AudioState;
  decodedTime: IRIGBTime | null;
  accuracy: AccuracyData;
  decoder: DecoderState;
  waveformData: number[];
  isLocked: boolean;
  error: string | null;
  timeSources: TimeSource[];
  timeReadings: Map<string, TimeReading>;
  timeComparisons: TimeSourceComparison[];
  ltc: LTCState;
}
