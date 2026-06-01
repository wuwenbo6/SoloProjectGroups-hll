import { create } from "zustand";
import type { AnalysisResult, PIDBitrateHistory } from "../../shared/types";

interface AppState {
  result: AnalysisResult | null;
  loading: boolean;
  error: string | null;
  uploading: boolean;
  uploadProgress: number;
  selectedPid: number | null;
  bitrateHistory: PIDBitrateHistory | null;
  bitrateLoading: boolean;
  setResult: (result: AnalysisResult) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setUploading: (uploading: boolean) => void;
  setUploadProgress: (progress: number) => void;
  setSelectedPid: (pid: number | null) => void;
  setBitrateHistory: (history: PIDBitrateHistory | null) => void;
  setBitrateLoading: (loading: boolean) => void;
  reset: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  result: null,
  loading: false,
  error: null,
  uploading: false,
  uploadProgress: 0,
  selectedPid: null,
  bitrateHistory: null,
  bitrateLoading: false,
  setResult: (result) => set({ result, loading: false, error: null, selectedPid: null, bitrateHistory: null }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),
  setUploading: (uploading) => set({ uploading }),
  setUploadProgress: (uploadProgress) => set({ uploadProgress }),
  setSelectedPid: (selectedPid) => set({ selectedPid }),
  setBitrateHistory: (bitrateHistory) => set({ bitrateHistory, bitrateLoading: false }),
  setBitrateLoading: (bitrateLoading) => set({ bitrateLoading }),
  reset: () =>
    set({
      result: null,
      loading: false,
      error: null,
      uploading: false,
      uploadProgress: 0,
      selectedPid: null,
      bitrateHistory: null,
      bitrateLoading: false,
    }),
}));
