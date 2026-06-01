import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import type { SimulationState, WALEvent, ConflictLog, LatencyStats, LuaScriptInfo } from '@/types';

interface SimStore {
  state: SimulationState | null;
  socket: Socket | null;
  isConnected: boolean;
  error: string | null;
  luaScript: LuaScriptInfo | null;
  latencyStats: LatencyStats | null;
  initSocket: () => void;
  disconnectSocket: () => void;
  fetchState: () => Promise<void>;
  insertRecord: (id?: number, data?: string) => Promise<void>;
  updateRecord: (id: number, data?: string) => Promise<void>;
  triggerConflict: (id: number) => Promise<void>;
  startSimulation: (interval?: number, conflictRate?: number) => Promise<void>;
  stopSimulation: () => Promise<void>;
  resetSimulation: () => Promise<void>;
  fetchLuaScript: () => Promise<void>;
  updateLuaScript: (script: string) => Promise<{ success: boolean; error?: string }>;
  resetLuaScript: () => Promise<void>;
  validateLuaScript: (script: string) => Promise<{ valid: boolean; error?: string }>;
  fetchLatencyStats: () => Promise<void>;
  exportLatency: (format: 'json' | 'csv') => Promise<void>;
}

const initialLatencyStats: LatencyStats = {
  count: 0,
  avg_ms: 0,
  min_ms: 0,
  max_ms: 0,
  p50_ms: 0,
  p95_ms: 0,
  p99_ms: 0,
};

const initialState: SimulationState = {
  is_running: false,
  publisher_data: [],
  subscriber_data: [],
  conflict_count: 0,
  resolved_incoming: 0,
  resolved_existing: 0,
  conflict_logs: [],
  audit_logs: [],
  wal_events: [],
  latency_stats: initialLatencyStats,
  lua_enabled: false,
  resolver_type: 'timestamp',
};

export const useSimStore = create<SimStore>((set, get) => ({
  state: null,
  socket: null,
  isConnected: false,
  error: null,
  luaScript: null,
  latencyStats: null,

  initSocket: () => {
    if (get().socket) return;

    const socket = io({
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      set({ isConnected: true, error: null });
    });

    socket.on('disconnect', () => {
      set({ isConnected: false });
    });

    socket.on('state', (state: SimulationState) => {
      set({ state, latencyStats: state.latency_stats || null });
    });

    socket.on('wal', (event: WALEvent) => {
      const current = get().state;
      if (current) {
        set({
          state: {
            ...current,
            wal_events: [...current.wal_events.slice(-99), event],
          },
        });
      }
    });

    socket.on('conflict', (log: ConflictLog) => {
      const current = get().state;
      if (current) {
        set({
          state: {
            ...current,
            conflict_count: current.conflict_count + 1,
            resolved_incoming: log.resolved_to === 'incoming'
              ? current.resolved_incoming + 1
              : current.resolved_incoming,
            resolved_existing: log.resolved_to === 'existing'
              ? current.resolved_existing + 1
              : current.resolved_existing,
            conflict_logs: [...current.conflict_logs.slice(-99), log],
          },
        });
      }
    });

    socket.on('latency', (stats: LatencyStats) => {
      set({ latencyStats: stats });
    });

    socket.on('connect_error', (err) => {
      set({ error: `Connection error: ${err.message}`, isConnected: false });
    });

    set({ socket });
  },

  disconnectSocket: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null, isConnected: false });
    }
  },

  fetchState: async () => {
    try {
      const res = await fetch('/api/state');
      const data = await res.json();
      set({ state: data, error: null, latencyStats: data.latency_stats || null });
    } catch {
      set({ error: 'Failed to fetch state' });
    }
  },

  insertRecord: async (id, data) => {
    try {
      await fetch('/api/insert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, data }),
      });
    } catch {
      set({ error: 'Failed to insert record' });
    }
  },

  updateRecord: async (id, data) => {
    try {
      await fetch('/api/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, data }),
      });
    } catch {
      set({ error: 'Failed to update record' });
    }
  },

  triggerConflict: async (id) => {
    try {
      await fetch('/api/trigger-conflict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
    } catch {
      set({ error: 'Failed to trigger conflict' });
    }
  },

  startSimulation: async (interval = 1.0, conflictRate = 0.3) => {
    try {
      await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', interval, conflict_rate: conflictRate }),
      });
    } catch {
      set({ error: 'Failed to start simulation' });
    }
  },

  stopSimulation: async () => {
    try {
      await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' }),
      });
    } catch {
      set({ error: 'Failed to stop simulation' });
    }
  },

  resetSimulation: async () => {
    try {
      await fetch('/api/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch {
      set({ error: 'Failed to reset simulation' });
    }
  },

  fetchLuaScript: async () => {
    try {
      const res = await fetch('/api/lua-script');
      const data = await res.json();
      set({ luaScript: data });
    } catch {
      set({ error: 'Failed to fetch Lua script' });
    }
  },

  updateLuaScript: async (script: string) => {
    try {
      const res = await fetch('/api/lua-script', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script }),
      });
      const data = await res.json();
      if (data.success) {
        await get().fetchLuaScript();
      }
      return data;
    } catch {
      return { success: false, error: 'Failed to update Lua script' };
    }
  },

  resetLuaScript: async () => {
    try {
      await fetch('/api/lua-script/reset', { method: 'POST' });
      await get().fetchLuaScript();
    } catch {
      set({ error: 'Failed to reset Lua script' });
    }
  },

  validateLuaScript: async (script: string) => {
    try {
      const res = await fetch('/api/lua-script/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script }),
      });
      return await res.json();
    } catch {
      return { valid: false, error: 'Validation request failed' };
    }
  },

  fetchLatencyStats: async () => {
    try {
      const res = await fetch('/api/latency');
      const data = await res.json();
      set({ latencyStats: data.stats });
    } catch {
      set({ error: 'Failed to fetch latency stats' });
    }
  },

  exportLatency: async (format: 'json' | 'csv') => {
    try {
      const url = `/api/latency/export?format=${format}`;
      const a = document.createElement('a');
      a.href = url;
      a.download = format === 'csv' ? 'latency_trend.csv' : 'latency_trend.json';
      a.click();
    } catch {
      set({ error: 'Failed to export latency data' });
    }
  },
}));
