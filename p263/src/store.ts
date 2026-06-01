import { create } from 'zustand';
import type { Cell, SimulationStatus, ReselectionLog, SimulationConfig, CellsResponse } from './types';

interface SimulationStore {
  cells: Cell[];
  servingPci: number;
  mapSize: number;
  status: SimulationStatus | null;
  logs: ReselectionLog[];
  loading: boolean;
  error: string | null;
  fetchCells: () => Promise<void>;
  fetchStatus: () => Promise<void>;
  fetchLogs: () => Promise<void>;
  startSimulation: () => Promise<void>;
  pauseSimulation: () => Promise<void>;
  resetSimulation: () => Promise<void>;
  stepSimulation: () => Promise<void>;
  updateConfig: (config: Partial<SimulationConfig>) => Promise<void>;
  startPolling: (intervalMs?: number) => void;
  stopPolling: () => void;
}

let pollingInterval: number | null = null;

export const useSimulationStore = create<SimulationStore>((set, get) => ({
  cells: [],
  servingPci: 0,
  mapSize: 500,
  status: null,
  logs: [],
  loading: false,
  error: null,

  fetchCells: async () => {
    try {
      set({ loading: true });
      const res = await fetch('/api/cells');
      const data: CellsResponse = await res.json();
      set({
        cells: data.cells,
        servingPci: data.serving_pci,
        mapSize: data.map_size,
        loading: false,
        error: null,
      });
    } catch (e) {
      set({ error: 'Failed to fetch cells', loading: false });
    }
  },

  fetchStatus: async () => {
    try {
      const res = await fetch('/api/simulation/status');
      const data: SimulationStatus = await res.json();
      set({ status: data });
    } catch (e) {
      set({ error: 'Failed to fetch status' });
    }
  },

  fetchLogs: async () => {
    try {
      const res = await fetch('/api/logs');
      const data = await res.json();
      set({ logs: data.logs });
    } catch (e) {
      set({ error: 'Failed to fetch logs' });
    }
  },

  startSimulation: async () => {
    try {
      const res = await fetch('/api/simulation/start', { method: 'POST' });
      const data: SimulationStatus = await res.json();
      set({ status: data });
    } catch (e) {
      set({ error: 'Failed to start simulation' });
    }
  },

  pauseSimulation: async () => {
    try {
      const res = await fetch('/api/simulation/pause', { method: 'POST' });
      const data: SimulationStatus = await res.json();
      set({ status: data });
    } catch (e) {
      set({ error: 'Failed to pause simulation' });
    }
  },

  resetSimulation: async () => {
    try {
      const res = await fetch('/api/simulation/reset', { method: 'POST' });
      const data: SimulationStatus = await res.json();
      set({ status: data, logs: [] });
      await get().fetchCells();
    } catch (e) {
      set({ error: 'Failed to reset simulation' });
    }
  },

  stepSimulation: async () => {
    try {
      const res = await fetch('/api/simulation/step', { method: 'POST' });
      const data: SimulationStatus = await res.json();
      set({ status: data });
      await get().fetchCells();
      await get().fetchLogs();
    } catch (e) {
      set({ error: 'Failed to step simulation' });
    }
  },

  updateConfig: async (config: Partial<SimulationConfig>) => {
    try {
      const res = await fetch('/api/simulation/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data: SimulationStatus = await res.json();
      set({ status: data });
    } catch (e) {
      set({ error: 'Failed to update config' });
    }
  },

  startPolling: (intervalMs: number = 1000) => {
    get().stopPolling();
    pollingInterval = window.setInterval(async () => {
      const { status } = get();
      if (status?.running) {
        await get().fetchCells();
        await get().fetchStatus();
        await get().fetchLogs();
      }
    }, intervalMs);
  },

  stopPolling: () => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
  },
}));
