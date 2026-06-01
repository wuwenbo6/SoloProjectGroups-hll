import { create } from 'zustand';
import { SimulationParams, SimulationState, IsosurfaceData } from '../types';

interface SimulationStore {
  params: Omit<SimulationParams, 'id' | 'name' | 'createdAt'>;
  state: SimulationState;
  isosurfaceData: IsosurfaceData | null;
  savedParams: SimulationParams[];
  error: string | null;

  setParams: (params: Partial<Omit<SimulationParams, 'id' | 'name' | 'createdAt'>>) => void;
  setSimulationState: (state: Partial<SimulationState>) => void;
  setIsosurfaceData: (data: IsosurfaceData | null) => void;
  setSavedParams: (params: SimulationParams[]) => void;
  setError: (error: string | null) => void;
  addEnergyPoint: (step: number, energy: number) => void;
  resetSimulation: () => void;
}

const defaultParams = {
  undercooling: 0.5,
  anisotropy: 0.04,
  anisotropyMode: 4,
  interfaceWidth: 3.0,
  mobility: 1.0,
  numGrains: 1,
  grainRadius: 3,
  randomOrientation: true,
  exportObj: false,
};

const defaultState = {
  isRunning: false,
  isPaused: false,
  currentStep: 0,
  totalSteps: 200,
  progress: 0,
  freeEnergy: 0,
  energyHistory: [],
};

export const useSimulationStore = create<SimulationStore>((set, get) => ({
  params: defaultParams,
  state: defaultState,
  isosurfaceData: null,
  savedParams: [],
  error: null,

  setParams: (params) => set((state) => ({
    params: { ...state.params, ...params },
  })),

  setSimulationState: (state) => set((prev) => ({
    state: { ...prev.state, ...state },
  })),

  setIsosurfaceData: (data) => set({ isosurfaceData: data }),

  setSavedParams: (params) => set({ savedParams: params }),

  setError: (error) => set({ error }),

  addEnergyPoint: (step, energy) => set((state) => ({
    state: {
      ...state.state,
      energyHistory: [...state.state.energyHistory.slice(-100), { step, energy }],
    },
  })),

  resetSimulation: () => set({
    state: defaultState,
    isosurfaceData: null,
    error: null,
  }),
}));
