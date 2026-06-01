import { create } from 'zustand';
import type {
  Topology,
  TrafficEdge,
  MulticastGroup,
  SimEvent,
  PresetType,
  JoinRequest,
  PruneRequest,
  SwitchSPTRequest,
  RegisterRequest,
} from '@/types/simulator';
import * as api from '@/api/simulator';

interface AnimationPacket {
  id: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  progress: number;
  treeType: 'rpt' | 'spt';
}

interface SimulatorState {
  topology: Topology | null;
  selectedRouterId: string | null;
  trafficEdges: TrafficEdge[];
  groups: MulticastGroup[];
  events: SimEvent[];
  isLoading: boolean;
  error: string | null;
  animationPackets: AnimationPacket[];
  activePreset: PresetType | null;
}

interface SimulatorActions {
  fetchTopology: () => Promise<void>;
  loadPreset: (preset: PresetType) => Promise<void>;
  selectRouter: (id: string | null) => void;
  sendJoin: (req: JoinRequest) => Promise<void>;
  sendPrune: (req: PruneRequest) => Promise<void>;
  switchSPT: (req: SwitchSPTRequest) => Promise<void>;
  registerSource: (req: RegisterRequest) => Promise<void>;
  updateTraffic: (edges: TrafficEdge[]) => void;
  addEvent: (event: SimEvent) => void;
  setError: (error: string | null) => void;
  setAnimationPackets: (packets: AnimationPacket[]) => void;
  refreshTrafficEdges: () => Promise<void>;
}

function extractTrafficEdges(groupsData: { groups: Array<Record<string, unknown>> }): TrafficEdge[] {
  const edges: TrafficEdge[] = [];
  for (const g of groupsData.groups) {
    const paths = g.traffic_path as Array<{ from: string; to: string; tree_type: string }> | undefined;
    if (paths) {
      for (const p of paths) {
        edges.push({
          from: p.from,
          to: p.to,
          tree_type: p.tree_type as 'rpt' | 'spt',
        });
      }
    }
  }
  return edges;
}

export const useSimulatorStore = create<SimulatorState & SimulatorActions>((set, get) => ({
  topology: null,
  selectedRouterId: null,
  trafficEdges: [],
  groups: [],
  events: [],
  isLoading: false,
  error: null,
  animationPackets: [],
  activePreset: null,

  fetchTopology: async () => {
    set({ isLoading: true, error: null });
    try {
      const topology = await api.fetchTopology();
      set({ topology, isLoading: false });
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false });
    }
  },

  loadPreset: async (preset: PresetType) => {
    set({ isLoading: true, error: null, selectedRouterId: null, trafficEdges: [], animationPackets: [] });
    try {
      const topology = await api.loadPreset(preset);
      let trafficEdges: TrafficEdge[] = [];
      try {
        const groupsData = await api.fetchGroups();
        trafficEdges = extractTrafficEdges(groupsData);
      } catch {
        // groups may not be available yet
      }
      set({ topology, trafficEdges, activePreset: preset, isLoading: false });
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false });
    }
  },

  selectRouter: (id) => {
    set({ selectedRouterId: id });
  },

  sendJoin: async (req: JoinRequest) => {
    set({ error: null });
    try {
      await api.sendJoin(req);
      await get().refreshTrafficEdges();
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  sendPrune: async (req: PruneRequest) => {
    set({ error: null });
    try {
      await api.sendPrune(req);
      await get().refreshTrafficEdges();
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  switchSPT: async (req: SwitchSPTRequest) => {
    set({ error: null });
    try {
      await api.switchSPT(req);
      await get().refreshTrafficEdges();
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  registerSource: async (req: RegisterRequest) => {
    set({ error: null });
    try {
      await api.registerSource(req);
      await get().refreshTrafficEdges();
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  updateTraffic: (edges: TrafficEdge[]) => {
    set({ trafficEdges: edges });
  },

  addEvent: (event: SimEvent) => {
    set((state) => {
      const next = [...state.events, event];
      return { events: next.length > 200 ? next.slice(-200) : next };
    });
  },

  setError: (error) => {
    set({ error });
  },

  setAnimationPackets: (packets) => {
    set({ animationPackets: packets });
  },

  refreshTrafficEdges: async () => {
    try {
      const groupsData = await api.fetchGroups();
      const trafficEdges = extractTrafficEdges(groupsData);
      set({ trafficEdges });
    } catch {
      // ignore
    }
  },
}));
