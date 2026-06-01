import { create } from 'zustand';
import { TrajectoryMessage } from './types';

interface AppState {
  isConnected: boolean;
  isRunning: boolean;
  trajectoryHistory: TrajectoryMessage[];
  currentMessage: TrajectoryMessage | null;
  wsError: string | null;
  setConnected: (val: boolean) => void;
  setRunning: (val: boolean) => void;
  addMessage: (msg: TrajectoryMessage) => void;
  setError: (err: string | null) => void;
  reset: () => void;
}

const MAX_HISTORY = 5000;

export const useAppStore = create<AppState>((set) => ({
  isConnected: false,
  isRunning: false,
  trajectoryHistory: [],
  currentMessage: null,
  wsError: null,
  setConnected: (val) => set({ isConnected: val }),
  setRunning: (val) => set({ isRunning: val }),
  addMessage: (msg) => set((state) => ({
    currentMessage: msg,
    trajectoryHistory: state.trajectoryHistory.length >= MAX_HISTORY
      ? [...state.trajectoryHistory.slice(1), msg]
      : [...state.trajectoryHistory, msg],
  })),
  setError: (err) => set({ wsError: err }),
  reset: () => set({
    trajectoryHistory: [],
    currentMessage: null,
    wsError: null,
  }),
}));
