import { create } from 'zustand';
import type {
  SimulationState,
  STA,
  TWTParams,
  PowerData,
  NegotiationLog,
  TWTGroup,
} from '../../shared/types';

interface SimulationStore {
  state: SimulationState | null;
  negotiationLogs: NegotiationLog[];
  isConnected: boolean;
  error: string | null;
  selectedSTAId: string | null;
  viewRange: { start: number; end: number };
  showSleepSlots: boolean;
  showTransitionSlots: boolean;

  setState: (state: SimulationState) => void;
  setNegotiationLogs: (logs: NegotiationLog[]) => void;
  setConnected: (connected: boolean) => void;
  setError: (error: string | null) => void;
  setSelectedSTAId: (id: string | null) => void;
  setViewRange: (range: { start: number; end: number }) => void;
  setShowSleepSlots: (show: boolean) => void;
  setShowTransitionSlots: (show: boolean) => void;

  getSTAById: (id: string) => STA | undefined;
  getPowerDataForSTA: (staId: string) => PowerData | undefined;
  getSTASlots: (staId: string) => SimulationState['timeslots'];
}

export const useSimulationStore = create<SimulationStore>((set, get) => ({
  state: null,
  negotiationLogs: [],
  isConnected: false,
  error: null,
  selectedSTAId: null,
  viewRange: { start: 0, end: 10000 },
  showSleepSlots: true,
  showTransitionSlots: true,

  setState: (state) => set({ state }),
  setNegotiationLogs: (logs) => set({ negotiationLogs: logs }),
  setConnected: (connected) => set({ isConnected: connected }),
  setError: (error) => set({ error }),
  setSelectedSTAId: (id) => set({ selectedSTAId: id }),
  setViewRange: (range) => set({ viewRange: range }),
  setShowSleepSlots: (show) => set({ showSleepSlots: show }),
  setShowTransitionSlots: (show) => set({ showTransitionSlots: show }),

  getSTAById: (id) => {
    const state = get().state;
    return state?.stas.find((s) => s.id === id);
  },

  getPowerDataForSTA: (staId) => {
    const state = get().state;
    return state?.powerStats.find((p) => p.staId === staId);
  },

  getSTASlots: (staId) => {
    const state = get().state;
    if (!state) return [];
    return state.timeslots.filter((s) => s.staId === staId);
  },
}));

export const useAPIService = () => {
  const API_BASE = '/api/twt';

  const fetchState = async (): Promise<SimulationState> => {
    const res = await fetch(`${API_BASE}/state`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  };

  const startSimulation = async (): Promise<SimulationState> => {
    const res = await fetch(`${API_BASE}/start`, { method: 'POST' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  };

  const pauseSimulation = async (): Promise<SimulationState> => {
    const res = await fetch(`${API_BASE}/pause`, { method: 'POST' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  };

  const resetSimulation = async (): Promise<SimulationState> => {
    const res = await fetch(`${API_BASE}/reset`, { method: 'POST' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  };

  const updateConfig = async (config: {
    duration?: number;
    speed?: number;
    staCount?: number;
    defaultTWTParams?: TWTParams;
  }): Promise<SimulationState> => {
    const res = await fetch(`${API_BASE}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  };

  const setSpeed = async (speed: number): Promise<SimulationState> => {
    const res = await fetch(`${API_BASE}/speed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ speed }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  };

  const seekTo = async (time: number): Promise<SimulationState> => {
    const res = await fetch(`${API_BASE}/seek`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ time }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  };

  const negotiate = async (): Promise<{
    state: SimulationState;
    logs: NegotiationLog[];
  }> => {
    const res = await fetch(`${API_BASE}/negotiate`, { method: 'POST' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  };

  const fetchSTAs = async (): Promise<STA[]> => {
    const res = await fetch(`${API_BASE}/stas`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  };

  const addSTA = async (twtParams?: Partial<TWTParams>): Promise<STA> => {
    const res = await fetch(`${API_BASE}/stas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ twtParams }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  };

  const addSTABatch = async (count: number): Promise<SimulationState> => {
    const res = await fetch(`${API_BASE}/stas/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  };

  const updateSTA = async (
    id: string,
    updates: Partial<STA>
  ): Promise<STA> => {
    const res = await fetch(`${API_BASE}/stas/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  };

  const deleteSTA = async (id: string): Promise<SimulationState> => {
    const res = await fetch(`${API_BASE}/stas/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  };

  const fetchLogs = async (): Promise<NegotiationLog[]> => {
    const res = await fetch(`${API_BASE}/logs`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  };

  const createGroup = async (
    name: string,
    twtParams: TWTParams,
    staIds: string[]
  ): Promise<TWTGroup> => {
    const res = await fetch(`${API_BASE}/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, twtParams, staIds }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  };

  const fetchGroups = async (): Promise<TWTGroup[]> => {
    const res = await fetch(`${API_BASE}/groups`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  };

  const deleteGroup = async (groupId: string): Promise<SimulationState> => {
    const res = await fetch(`${API_BASE}/groups/${groupId}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  };

  const exportCurve = (format: 'csv' | 'json' = 'json'): void => {
    window.open(`${API_BASE}/export/curve?format=${format}`, '_blank');
  };

  return {
    fetchState,
    startSimulation,
    pauseSimulation,
    resetSimulation,
    updateConfig,
    setSpeed,
    seekTo,
    negotiate,
    fetchSTAs,
    addSTA,
    addSTABatch,
    updateSTA,
    deleteSTA,
    fetchLogs,
    createGroup,
    fetchGroups,
    deleteGroup,
    exportCurve,
  };
};
