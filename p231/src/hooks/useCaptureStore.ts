import { create } from "zustand";
import {
  api,
  CaptureStatus,
  NetworkInfo,
  RouteEntry,
  PacketEntry,
  AarpResponse,
  NbpResponse,
} from "@/lib/api";

interface CaptureStore {
  status: CaptureStatus | null;
  networks: Record<string, NetworkInfo>;
  routes: RouteEntry[];
  packets: PacketEntry[];
  aarp: AarpResponse;
  nbp: NbpResponse;
  interfaces: string[];
  loading: boolean;
  error: string | null;
  startCapture: (iface: string) => Promise<void>;
  stopCapture: () => Promise<void>;
  refresh: () => Promise<void>;
  loadInterfaces: () => Promise<void>;
}

export const useCaptureStore = create<CaptureStore>((set) => ({
  status: null,
  networks: {},
  routes: [],
  packets: [],
  aarp: { mappings: [], recent_packets: [] },
  nbp: { devices: [], recent_packets: [] },
  interfaces: [],
  loading: false,
  error: null,

  startCapture: async (iface: string) => {
    set({ loading: true, error: null });
    try {
      await api.startCapture(iface);
      const [status, networks, routes, packets, aarp, nbp] = await Promise.all([
        api.getStatus(),
        api.getNetworks(),
        api.getRoutes(),
        api.getPackets(),
        api.getAarp(),
        api.getNbp(),
      ]);
      set({ status, networks, routes, packets, aarp, nbp, loading: false });
    } catch (e: unknown) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  stopCapture: async () => {
    set({ loading: true, error: null });
    try {
      await api.stopCapture();
      const status = await api.getStatus();
      set({ status, loading: false });
    } catch (e: unknown) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  refresh: async () => {
    try {
      const [status, networks, routes, packets, aarp, nbp] = await Promise.all([
        api.getStatus(),
        api.getNetworks(),
        api.getRoutes(),
        api.getPackets(),
        api.getAarp(),
        api.getNbp(),
      ]);
      set({ status, networks, routes, packets, aarp, nbp, error: null });
    } catch (e: unknown) {
      set({ error: (e as Error).message });
    }
  },

  loadInterfaces: async () => {
    try {
      const res = await api.getInterfaces();
      set({ interfaces: res.interfaces });
    } catch {
      set({ interfaces: [] });
    }
  },
}));
