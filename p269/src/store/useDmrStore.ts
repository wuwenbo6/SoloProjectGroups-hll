import { create } from 'zustand';
import type { WavFileInfo, DemodulationConfig, AnalysisResult, AnalysisProgress, CallType } from '@/types';
import { DEFAULT_DEMOD_CONFIG } from '@/types';

interface DmrState {
  fileInfo: WavFileInfo | null;
  config: DemodulationConfig;
  isAnalyzing: boolean;
  progress: AnalysisProgress | null;
  result: AnalysisResult | null;
  error: string | null;
  selectedCallType: CallType | 'all';
  selectedSlot: 1 | 2 | 'all';

  setFileInfo: (info: WavFileInfo | null) => void;
  setConfig: (config: Partial<DemodulationConfig>) => void;
  setIsAnalyzing: (analyzing: boolean) => void;
  setProgress: (progress: AnalysisProgress | null) => void;
  setResult: (result: AnalysisResult | null) => void;
  setError: (error: string | null) => void;
  setSelectedCallType: (type: CallType | 'all') => void;
  setSelectedSlot: (slot: 1 | 2 | 'all') => void;
  reset: () => void;
}

export const useDmrStore = create<DmrState>((set) => ({
  fileInfo: null,
  config: { ...DEFAULT_DEMOD_CONFIG },
  isAnalyzing: false,
  progress: null,
  result: null,
  error: null,
  selectedCallType: 'all',
  selectedSlot: 'all',

  setFileInfo: (info) => set({ fileInfo: info }),
  setConfig: (newConfig) =>
    set((state) => ({
      config: { ...state.config, ...newConfig },
    })),
  setIsAnalyzing: (analyzing) => set({ isAnalyzing: analyzing }),
  setProgress: (progress) => set({ progress }),
  setResult: (result) => set({ result }),
  setError: (error) => set({ error }),
  setSelectedCallType: (type) => set({ selectedCallType: type }),
  setSelectedSlot: (slot) => set({ selectedSlot: slot }),
  reset: () =>
    set({
      fileInfo: null,
      isAnalyzing: false,
      progress: null,
      result: null,
      error: null,
    }),
}));
