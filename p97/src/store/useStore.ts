import { create } from 'zustand';
import { EEGData } from '../hooks/useBluetooth';
import { DetectionResult } from '../hooks/useWebSocket';

interface EEGStore {
  eegBuffer: EEGData[];
  detectionHistory: DetectionResult[];
  isRecording: boolean;
  recordingStartTime: number | null;
  seizureCount: number;
  alarmMuted: boolean;
  alarmThreshold: number;
  artifactThreshold: number;
  
  addEEGData: (data: EEGData) => void;
  addDetectionResult: (result: DetectionResult) => void;
  setIsRecording: (recording: boolean) => void;
  setRecordingStartTime: (time: number | null) => void;
  incrementSeizureCount: () => void;
  resetSeizureCount: () => void;
  setAlarmMuted: (muted: boolean) => void;
  setAlarmThreshold: (threshold: number) => void;
  setArtifactThreshold: (threshold: number) => void;
  clearBuffer: () => void;
}

const MAX_BUFFER_SIZE = 1000;
const MAX_DETECTION_HISTORY = 100;

export const useStore = create<EEGStore>((set) => ({
  eegBuffer: [],
  detectionHistory: [],
  isRecording: false,
  recordingStartTime: null,
  seizureCount: 0,
  alarmMuted: false,
  alarmThreshold: 0.7,
  artifactThreshold: 0.6,

  addEEGData: (data) =>
    set((state) => ({
      eegBuffer: [...state.eegBuffer, data].slice(-MAX_BUFFER_SIZE)
    })),

  addDetectionResult: (result) =>
    set((state) => ({
      detectionHistory: [...state.detectionHistory, result].slice(-MAX_DETECTION_HISTORY)
    })),

  setIsRecording: (recording) =>
    set({ isRecording: recording }),

  setRecordingStartTime: (time) =>
    set({ recordingStartTime: time }),

  incrementSeizureCount: () =>
    set((state) => ({ seizureCount: state.seizureCount + 1 })),

  resetSeizureCount: () =>
    set({ seizureCount: 0 }),

  setAlarmMuted: (muted) =>
    set({ alarmMuted: muted }),

  setAlarmThreshold: (threshold) =>
    set({ alarmThreshold: threshold }),

  setArtifactThreshold: (threshold) =>
    set({ artifactThreshold: threshold }),

  clearBuffer: () =>
    set({ eegBuffer: [], detectionHistory: [] })
}));
