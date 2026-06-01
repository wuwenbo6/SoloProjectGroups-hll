import { create } from "zustand";
import type { Vnfd, VnfInstance, VirtualLink, Event, Stats, RouteTable, InstantiateRequest, AutoScalingConfig, VnfMetrics } from "@/types";
import { api } from "@/api";

interface ManoStore {
  vnfds: Vnfd[];
  vnfs: VnfInstance[];
  links: VirtualLink[];
  events: Event[];
  stats: Stats;
  routeTables: Record<string, RouteTable>;
  autoScalingConfigs: Record<string, AutoScalingConfig>;
  metrics: Record<string, VnfMetrics[]>;
  selectedVnfId: string | null;
  isLoading: boolean;

  fetchAll: () => Promise<void>;
  fetchVnfds: () => Promise<void>;
  fetchVnfs: () => Promise<void>;
  fetchLinks: () => Promise<void>;
  fetchEvents: () => Promise<void>;
  fetchStats: () => Promise<void>;
  fetchRouteTable: (vnfId: string) => Promise<void>;
  fetchAutoScalingConfig: (vnfId: string) => Promise<void>;
  fetchMetrics: (vnfId: string) => Promise<void>;

  selectVnf: (id: string | null) => void;

  instantiateVnf: (data: { vnfdId: string; name: string; positionX: number; positionY: number; dependsOn?: string[] }) => Promise<void>;
  batchInstantiateVnfs: (vnfs: Omit<InstantiateRequest, "positionX" | "positionY">[]) => Promise<void>;
  scaleVnf: (id: string, data: { replicaCount: number }) => Promise<void>;
  terminateVnf: (id: string) => Promise<void>;
  updateAutoScalingConfig: (id: string, config: Partial<AutoScalingConfig>) => Promise<void>;
  exportToscaTemplate: (id: string) => Promise<string>;
  createLink: (sourceId: string, targetId: string, bandwidth: number) => Promise<void>;
  deleteLink: (id: string) => Promise<void>;
}

const defaultStats: Stats = {
  totalVnfs: 0,
  runningVnfs: 0,
  stoppedVnfs: 0,
  errorVnfs: 0,
  totalCpu: 0,
  totalMemory: 0,
  totalBandwidth: 0,
};

export const useManoStore = create<ManoStore>((set, get) => ({
  vnfds: [],
  vnfs: [],
  links: [],
  events: [],
  stats: defaultStats,
  routeTables: {},
  autoScalingConfigs: {},
  metrics: {},
  selectedVnfId: null,
  isLoading: false,

  fetchAll: async () => {
    set({ isLoading: true });
    try {
      const [vnfds, vnfs, links, events, stats] = await Promise.all([
        api.getVnfds(),
        api.getVnfs(),
        api.getLinks(),
        api.getEvents(),
        api.getStats(),
      ]);
      set({ vnfds, vnfs, links, events, stats });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchVnfds: async () => {
    const vnfds = await api.getVnfds();
    set({ vnfds });
  },

  fetchVnfs: async () => {
    const vnfs = await api.getVnfs();
    set({ vnfs });
  },

  fetchLinks: async () => {
    const links = await api.getLinks();
    set({ links });
  },

  fetchEvents: async () => {
    const events = await api.getEvents();
    set({ events });
  },

  fetchStats: async () => {
    const stats = await api.getStats();
    set({ stats });
  },

  fetchRouteTable: async (vnfId: string) => {
    try {
      const rt = await api.getRouteTable(vnfId);
      set((state) => ({
        routeTables: { ...state.routeTables, [vnfId]: rt },
      }));
    } catch {
    }
  },

  fetchAutoScalingConfig: async (vnfId: string) => {
    try {
      const config = await api.getAutoScalingConfig(vnfId);
      set((state) => ({
        autoScalingConfigs: { ...state.autoScalingConfigs, [vnfId]: config },
      }));
    } catch {
    }
  },

  fetchMetrics: async (vnfId: string) => {
    try {
      const m = await api.getMetrics(vnfId, 20);
      set((state) => ({
        metrics: { ...state.metrics, [vnfId]: m },
      }));
    } catch {
    }
  },

  selectVnf: (id) => set({ selectedVnfId: id }),

  instantiateVnf: async (data) => {
    const vnfd = get().vnfds.find((v) => v.id === data.vnfdId);
    await api.instantiateVnf({
      vnfdId: data.vnfdId,
      name: data.name,
      positionX: data.positionX,
      positionY: data.positionY,
      dependsOn: data.dependsOn,
      cpu: vnfd?.defaultCpu,
      memory: vnfd?.defaultMemory,
      bandwidth: vnfd?.defaultBandwidth,
      replicaCount: 1,
    });
    await get().fetchAll();
    setTimeout(() => get().fetchAll(), 3000);
  },

  batchInstantiateVnfs: async (vnfs) => {
    const vnfds = get().vnfds;
    const requests = vnfs.map((v, i) => {
      const vnfd = vnfds.find((d) => d.id === v.vnfdId);
      return {
        ...v,
        positionX: 300 + i * 200,
        positionY: 200 + (i % 2) * 150,
        cpu: vnfd?.defaultCpu || 2,
        memory: vnfd?.defaultMemory || 4096,
        bandwidth: vnfd?.defaultBandwidth || 10000,
        replicaCount: 1,
      };
    });
    await api.batchInstantiateVnfs({ vnfs: requests });
    await get().fetchAll();
    setTimeout(() => get().fetchAll(), 5000);
  },

  scaleVnf: async (id, data) => {
    await api.scaleVnf(id, data);
    await get().fetchAll();
    setTimeout(() => get().fetchAll(), 4000);
  },

  terminateVnf: async (id) => {
    await api.terminateVnf(id);
    set({ selectedVnfId: null });
    await get().fetchAll();
    setTimeout(() => get().fetchAll(), 3000);
  },

  updateAutoScalingConfig: async (id, config) => {
    await api.updateAutoScalingConfig(id, config);
    await get().fetchAutoScalingConfig(id);
  },

  exportToscaTemplate: async (id) => {
    return api.exportToscaTemplate(id);
  },

  createLink: async (sourceId, targetId, bandwidth) => {
    await api.createLink({ sourceId, targetId, bandwidth });
    await get().fetchLinks();
  },

  deleteLink: async (id) => {
    await api.deleteLink(id);
    await get().fetchLinks();
  },
}));
