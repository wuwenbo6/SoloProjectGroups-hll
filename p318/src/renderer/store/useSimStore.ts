import { create } from 'zustand';
import type {
  NodeConfig,
  NodeState,
  BusConfig,
  BusState,
  LogEntry,
  TimelineEvent,
  BusUtilizationStats,
  BusMode,
} from '../../shared/types';
import { DEFAULT_BUS_CONFIG } from '../../shared/types';
import { events, simAPI, nodeAPI, busAPI } from '../ipc/renderer';

const DEFAULT_UTILIZATION: BusUtilizationStats = {
  currentUtilization: 0,
  avgUtilization: 0,
  peakUtilization: 0,
  totalBusyTime: 0,
  totalIdleTime: 0,
  totalRuntime: 0,
  samples: [],
  perNodeStats: {},
};

interface SimStore {
  nodeConfigs: Record<string, NodeConfig>;
  nodeStates: Record<string, NodeState>;
  busConfig: BusConfig;
  busState: BusState;
  logs: LogEntry[];
  timeline: TimelineEvent[];
  startTime: number | null;
  currentTime: number;
  isInitialized: boolean;
  utilization: BusUtilizationStats;

  init: () => Promise<void>;
  startSimulation: () => Promise<void>;
  pauseSimulation: () => Promise<void>;
  resetSimulation: () => Promise<void>;
  addNode: (config?: Partial<NodeConfig>) => Promise<void>;
  removeNode: (nodeId: string) => Promise<void>;
  updateNode: (nodeId: string, config: Partial<NodeConfig>) => Promise<void>;
  manualSend: (nodeId: string) => Promise<void>;
  updateBusConfig: (config: Partial<BusConfig>) => Promise<void>;
  setBusMode: (mode: BusMode) => Promise<void>;
  exportData: () => Promise<{ success: boolean; path?: string; message?: string }>;
  clearLogs: () => void;
}

export const useSimStore = create<SimStore>((set, get) => ({
  nodeConfigs: {},
  nodeStates: {},
  busConfig: DEFAULT_BUS_CONFIG,
  busState: {
    isBusy: false,
    currentSender: null,
    conflictDetected: false,
    isRunning: false,
    mode: 'csma',
  },
  logs: [],
  timeline: [],
  startTime: null,
  currentTime: Date.now(),
  isInitialized: false,
  utilization: DEFAULT_UTILIZATION,

  init: async () => {
    if (get().isInitialized) return;

    const state = await simAPI.getState();
    const busConfig = await busAPI.getConfig();

    set({
      nodeConfigs: state.nodes as Record<string, NodeConfig>,
      busConfig,
      busState: state.busState,
      startTime: state.startTime,
      utilization: state.utilization || DEFAULT_UTILIZATION,
      isInitialized: true,
    });

    events.onStateUpdate(({ nodes, bus, utilization }) => {
      set({
        nodeStates: nodes,
        busState: bus,
        utilization: utilization || DEFAULT_UTILIZATION,
        currentTime: Date.now(),
      });
    });

    events.onLog((log) => {
      set((state) => ({
        logs: [...state.logs.slice(-500), log],
      }));
    });

    events.onTimelineEvent((event) => {
      set((state) => ({
        timeline: [...state.timeline.slice(-200), event],
      }));
    });
  },

  startSimulation: async () => {
    await simAPI.start(get().busConfig);
  },

  pauseSimulation: async () => {
    await simAPI.pause();
  },

  resetSimulation: async () => {
    await simAPI.reset();
    set({
      logs: [],
      timeline: [],
      startTime: null,
      utilization: DEFAULT_UTILIZATION,
    });
  },

  addNode: async (config) => {
    const result = await nodeAPI.add(config);
    if (result.success && result.config) {
      set((state) => ({
        nodeConfigs: {
          ...state.nodeConfigs,
          [result.config!.id]: result.config!,
        },
      }));
    }
  },

  removeNode: async (nodeId) => {
    await nodeAPI.remove(nodeId);
    set((state) => {
      const { [nodeId]: _, ...restConfigs } = state.nodeConfigs;
      const { [nodeId]: __, ...restStates } = state.nodeStates;
      return {
        nodeConfigs: restConfigs,
        nodeStates: restStates,
      };
    });
  },

  updateNode: async (nodeId, config) => {
    await nodeAPI.update(nodeId, config);
    set((state) => ({
      nodeConfigs: {
        ...state.nodeConfigs,
        [nodeId]: { ...state.nodeConfigs[nodeId], ...config },
      },
    }));
  },

  manualSend: async (nodeId) => {
    await nodeAPI.manualSend(nodeId);
  },

  updateBusConfig: async (config) => {
    await busAPI.updateConfig(config);
    set((state) => ({
      busConfig: { ...state.busConfig, ...config },
    }));
  },

  setBusMode: async (mode) => {
    await busAPI.setMode(mode);
    set((state) => ({
      busConfig: { ...state.busConfig, mode },
      busState: { ...state.busState, mode },
    }));
  },

  exportData: async () => {
    const result = await busAPI.exportData();
    return result as { success: boolean; path?: string; message?: string };
  },

  clearLogs: () => {
    set({ logs: [] });
  },
}));
