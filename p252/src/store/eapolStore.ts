import { create } from "zustand";
import type { AnalyzeResponse, EapMessage } from "@/types/eapol";

interface EapolState {
  analysis: AnalyzeResponse | null;
  selectedMessage: EapMessage | null;
  loading: boolean;
  error: string | null;
  setAnalysis: (data: AnalyzeResponse) => void;
  selectMessage: (msg: EapMessage | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useEapolStore = create<EapolState>((set) => ({
  analysis: null,
  selectedMessage: null,
  loading: false,
  error: null,
  setAnalysis: (data) => set({ analysis: data, error: null, loading: false }),
  selectMessage: (msg) => set({ selectedMessage: msg }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),
  reset: () =>
    set({ analysis: null, selectedMessage: null, loading: false, error: null }),
}));
