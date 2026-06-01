import { create } from 'zustand';
import {
  AppState,
  IRIGBTime,
  AccuracyData,
  SymbolData,
  AudioState,
  DecoderState,
  FormatInfo,
  TimeSource,
  TimeReading,
  TimeSourceComparison,
  LTCState,
  FrameRate,
  SMPTETime,
} from '../types';
import { calculateDeviationStats } from '../utils/timeUtils';
import { TIME_SOURCES } from '../utils/timeSources';

const initialAudioState: AudioState = {
  isRecording: false,
  sampleRate: 48000,
  volume: 0,
  deviceId: null,
  devices: [],
  bufferSize: 2048,
};

const initialAccuracy: AccuracyData = {
  deviation: 0,
  avgDeviation: 0,
  maxDeviation: 0,
  minDeviation: 0,
  stdDeviation: 0,
  history: [],
};

const initialDecoder: DecoderState = {
  symbols: [],
  frameData: [],
  isFrameLocked: false,
  frameStartIndex: -1,
  formatInfo: null,
};

const initialLTCState: LTCState = {
  isPlaying: false,
  frameRate: '25',
  volume: 0.5,
  isLoop: true,
  durationSeconds: 10,
  currentTime: null,
};

interface AppStore extends AppState {
  setRecording: (isRecording: boolean) => void;
  setSampleRate: (sampleRate: number) => void;
  setVolume: (volume: number) => void;
  setDeviceId: (deviceId: string | null) => void;
  setDevices: (devices: MediaDeviceInfo[]) => void;
  setBufferSize: (bufferSize: number) => void;
  setDecodedTime: (time: IRIGBTime | null) => void;
  setSymbols: (symbols: SymbolData[]) => void;
  setFrameLocked: (locked: boolean) => void;
  setWaveformData: (data: number[]) => void;
  setError: (error: string | null) => void;
  setFormatInfo: (info: FormatInfo | null) => void;
  addAccuracySample: (deviation: number) => void;
  resetAccuracy: () => void;
  resetDecoder: () => void;
  setTimeSourceEnabled: (sourceId: string, enabled: boolean) => void;
  setTimeReadings: (readings: Map<string, TimeReading>) => void;
  setTimeComparisons: (comparisons: TimeSourceComparison[]) => void;
  setLTCPlaying: (isPlaying: boolean) => void;
  setLTCFrameRate: (frameRate: FrameRate) => void;
  setLTCVolume: (volume: number) => void;
  setLTCLoop: (isLoop: boolean) => void;
  setLTCDuration: (duration: number) => void;
  setLTCTime: (time: SMPTETime | null) => void;
}

export const useAppStore = create<AppStore>((set, get) => ({
  audio: initialAudioState,
  decodedTime: null,
  accuracy: initialAccuracy,
  decoder: initialDecoder,
  waveformData: [],
  isLocked: false,
  error: null,
  timeSources: TIME_SOURCES.map((s) => ({ ...s })),
  timeReadings: new Map(),
  timeComparisons: [],
  ltc: initialLTCState,

  setRecording: (isRecording: boolean) => {
    set((state) => ({ audio: { ...state.audio, isRecording } }));
  },

  setSampleRate: (sampleRate: number) => {
    set((state) => ({ audio: { ...state.audio, sampleRate } }));
  },

  setVolume: (volume: number) => {
    set((state) => ({ audio: { ...state.audio, volume } }));
  },

  setDeviceId: (deviceId: string | null) => {
    set((state) => ({ audio: { ...state.audio, deviceId } }));
  },

  setDevices: (devices: MediaDeviceInfo[]) => {
    set((state) => ({ audio: { ...state.audio, devices } }));
  },

  setBufferSize: (bufferSize: number) => {
    set((state) => ({ audio: { ...state.audio, bufferSize } }));
  },

  setDecodedTime: (decodedTime: IRIGBTime | null) => {
    set({ decodedTime, isLocked: decodedTime !== null });
  },

  setSymbols: (symbols: SymbolData[]) => {
    set((state) => ({ decoder: { ...state.decoder, symbols } }));
  },

  setFrameLocked: (isFrameLocked: boolean) => {
    set((state) => ({ decoder: { ...state.decoder, isFrameLocked } }));
  },

  setWaveformData: (waveformData: number[]) => {
    set({ waveformData });
  },

  setError: (error: string | null) => {
    set({ error });
  },

  setFormatInfo: (formatInfo: FormatInfo | null) => {
    set((state) => ({ decoder: { ...state.decoder, formatInfo } }));
  },

  addAccuracySample: (deviation: number) => {
    set((state) => {
      const history = [...state.accuracy.history, { time: new Date().toLocaleTimeString('zh-CN'), deviation }];
      if (history.length > 100) {
        history.shift();
      }

      const deviations = history.map((h) => h.deviation);
      const stats = calculateDeviationStats(deviations);

      return {
        accuracy: {
          deviation,
          avgDeviation: stats.avg,
          maxDeviation: stats.max,
          minDeviation: stats.min,
          stdDeviation: stats.std,
          history,
        },
      };
    });
  },

  resetAccuracy: () => {
    set({ accuracy: initialAccuracy });
  },

  resetDecoder: () => {
    set({
      decoder: initialDecoder,
      decodedTime: null,
      isLocked: false,
    });
  },

  setTimeSourceEnabled: (sourceId: string, enabled: boolean) => {
    set((state) => {
      const timeSources = state.timeSources.map((s) =>
        s.id === sourceId ? { ...s, isEnabled: enabled } : s
      );
      return { timeSources };
    });
  },

  setTimeReadings: (timeReadings: Map<string, TimeReading>) => {
    set({ timeReadings });
  },

  setTimeComparisons: (timeComparisons: TimeSourceComparison[]) => {
    set({ timeComparisons });
  },

  setLTCPlaying: (isPlaying: boolean) => {
    set((state) => ({ ltc: { ...state.ltc, isPlaying } }));
  },

  setLTCFrameRate: (frameRate: FrameRate) => {
    set((state) => ({ ltc: { ...state.ltc, frameRate } }));
  },

  setLTCVolume: (volume: number) => {
    set((state) => ({ ltc: { ...state.ltc, volume } }));
  },

  setLTCLoop: (isLoop: boolean) => {
    set((state) => ({ ltc: { ...state.ltc, isLoop } }));
  },

  setLTCDuration: (durationSeconds: number) => {
    set((state) => ({ ltc: { ...state.ltc, durationSeconds } }));
  },

  setLTCTime: (currentTime: SMPTETime | null) => {
    set((state) => ({ ltc: { ...state.ltc, currentTime } }));
  },
}));
