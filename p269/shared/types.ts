export interface WavFileInfo {
  path: string;
  name: string;
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  duration: number;
  size: number;
}

export interface DemodulationConfig {
  symbolRate: number;
  frequencyDeviation: number;
  centerFrequency: number;
}

export interface DemodulationResult {
  symbols: number[];
  snr: number;
  frequencyOffset: number;
  symbolErrorRate: number;
  qualityScore: number;
}

export type DmrSlot = 1 | 2;

export type CallType =
  | 'group_voice'
  | 'private_voice'
  | 'group_data'
  | 'private_data'
  | 'csbk'
  | 'unknown';

export type SyncPatternType = 'voice_sync' | 'data_sync' | 'ms_sync' | 'bs_sync' | 'unknown';

export interface DmrFrame {
  slot: DmrSlot;
  timestamp: number;
  frameType: 'voice' | 'data' | 'csbk' | 'sync';
  callType: CallType;
  sourceId?: number;
  destinationId?: number;
  talkgroupId?: number;
  colorCode?: number;
  rawData?: Uint8Array;
  syncPattern?: SyncPatternType;
  crcValid?: boolean;
  crcValue?: number;
  voiceSamples?: Float32Array;
}

export interface TimeSlotOccupancy {
  slot: DmrSlot;
  startTime: number;
  endTime: number;
  callType: CallType;
  sourceId?: number;
  destinationId?: number;
  talkgroupId?: number;
  duration: number;
  voiceFile?: string;
  frameCount?: number;
}

export interface AnalysisResult {
  fileInfo: WavFileInfo;
  demodulation: DemodulationResult;
  frames: DmrFrame[];
  timeSlots: TimeSlotOccupancy[];
  callStatistics: {
    totalCalls: number;
    byType: Record<CallType, number>;
    bySlot: Record<DmrSlot, number>;
    totalDuration: number;
  };
  voiceOutputDir?: string;
}

export interface AnalysisProgress {
  phase: 'reading' | 'demodulating' | 'parsing' | 'complete';
  progress: number;
}

export const CALL_TYPE_LABELS: Record<CallType, string> = {
  group_voice: '组呼语音',
  private_voice: '单呼语音',
  group_data: '组数据',
  private_data: '单数据',
  csbk: '控制信令',
  unknown: '未知'
};

export const CALL_TYPE_COLORS: Record<CallType, string> = {
  group_voice: '#00ff88',
  private_voice: '#00d4ff',
  group_data: '#ffd700',
  private_data: '#ff6b35',
  csbk: '#ff3366',
  unknown: '#6b7280'
};

export const DEFAULT_DEMOD_CONFIG: DemodulationConfig = {
  symbolRate: 4800,
  frequencyDeviation: 2400,
  centerFrequency: 0
};
