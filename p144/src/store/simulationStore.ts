import { create } from 'zustand';
import {
  SimulationConfig,
  SlotResult,
  SimulationResult,
} from '@shared/types';

interface SimulationState {
  config: SimulationConfig;
  currentSlot: number;
  isRunning: boolean;
  slotResults: SlotResult[];
  summary: SimulationResult['summary'] | null;
  compareResult: SimulationResult['compareResult'] | null;
  isLoading: boolean;
  error: string | null;

  setConfig: (config: Partial<SimulationConfig>) => void;
  initSimulation: () => Promise<void>;
  stepSimulation: () => Promise<void>;
  runSimulation: () => Promise<void>;
  resetSimulation: () => Promise<void>;
  compareAlgorithms: (
    alg1: SimulationConfig['algorithm'],
    alg2: SimulationConfig['algorithm']
  ) => Promise<void>;
  clearCompare: () => void;
  updateSummary: () => Promise<void>;
}

const defaultConfig: SimulationConfig = {
  numUsers: 6,
  numRBs: 24,
  numSlots: 100,
  snrMin: 0,
  snrMax: 20,
  channelModel: {
    type: 'Rayleigh',
    dopplerFreq: 5,
    speed: 30,
  },
  algorithm: 'fair',
  compareMode: false,
  mimoMode: 'SU',
  maxMimoLayers: 2,
  enableBSSColoring: false,
  numBSS: 2,
  enablePowerSave: false,
  psmDutyCycle: 0.5,
};

export const useSimulationStore = create<SimulationState>((set, get) => ({
  config: defaultConfig,
  currentSlot: 0,
  isRunning: false,
  slotResults: [],
  summary: null,
  compareResult: null,
  isLoading: false,
  error: null,

  setConfig: (config) => {
    set((state) => ({
      config: { ...state.config, ...config },
    }));
  },

  initSimulation: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch('/api/simulation/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(get().config),
      });
      if (!response.ok) throw new Error('Failed to init simulation');
      set({
        currentSlot: 0,
        slotResults: [],
        summary: null,
        isLoading: false,
      });
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  stepSimulation: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch('/api/simulation/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Failed to step');

      set((state) => ({
        slotResults: [...state.slotResults, data.result],
        currentSlot: data.currentSlot,
        isLoading: false,
      }));

      await get().updateSummary();
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  runSimulation: async () => {
    set({ isLoading: true, error: null, isRunning: true });
    try {
      const response = await fetch('/api/simulation/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Failed to run');

      set({
        slotResults: data.result.slotResults,
        currentSlot: data.result.currentSlot,
        summary: data.result.summary,
        isRunning: false,
        isLoading: false,
      });
    } catch (error) {
      set({ error: (error as Error).message, isRunning: false, isLoading: false });
    }
  },

  resetSimulation: async () => {
    set({ isLoading: true, error: null });
    try {
      await fetch('/api/simulation/reset', { method: 'POST' });
      set({
        currentSlot: 0,
        slotResults: [],
        summary: null,
        isLoading: false,
      });
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  compareAlgorithms: async (alg1, alg2) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch('/api/simulation/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: get().config,
          algorithm1: alg1,
          algorithm2: alg2,
        }),
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Failed to compare');

      set({
        compareResult: data.result.compareResult,
        slotResults: data.result.slotResults,
        currentSlot: data.result.currentSlot,
        summary: data.result.summary,
        isLoading: false,
      });
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
    }
  },

  clearCompare: () => {
    set({ compareResult: null });
  },

  updateSummary: async () => {
    try {
      const response = await fetch('/api/simulation/result');
      const data = await response.json();
      if (data.success) {
        set({ summary: data.result.summary });
      }
    } catch {
    }
  },
}));
