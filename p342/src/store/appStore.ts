import { create } from "zustand";
import type {
  ConnectRequest,
  ConnectResponse,
  StatusResponse,
  StoragePool,
  StorageVolume,
  MaskingView,
  TopologyResponse,
  ProviderInfo,
  CreateLUNRequest,
  CreateLUNResponse,
  CreateMaskingViewRequest,
  CreateMaskingViewResponse,
} from "@/types";

interface AppState {
  connected: boolean;
  providerInfo: ProviderInfo | null;
  connecting: boolean;
  error: string | null;
  pools: StoragePool[];
  volumes: StorageVolume[];
  maskingViews: MaskingView[];
  topologyData: TopologyResponse | null;
  loading: boolean;

  connect: (request: ConnectRequest) => Promise<void>;
  fetchStatus: () => Promise<void>;
  fetchPools: () => Promise<void>;
  fetchVolumes: () => Promise<void>;
  fetchMaskingViews: () => Promise<void>;
  fetchTopology: () => Promise<void>;
  fetchAll: () => Promise<void>;
  createLUN: (request: CreateLUNRequest) => Promise<CreateLUNResponse>;
  createMaskingView: (request: CreateMaskingViewRequest) => Promise<CreateMaskingViewResponse>;
  exportXML: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  connected: false,
  providerInfo: null,
  connecting: false,
  error: null,
  pools: [],
  volumes: [],
  maskingViews: [],
  topologyData: null,
  loading: false,

  connect: async (request: ConnectRequest) => {
    set({ connecting: true, error: null });
    try {
      const res = await fetch("/api/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const data: ConnectResponse = await res.json();
      if (data.success) {
        set({
          connected: true,
          providerInfo: data.provider_info || null,
          connecting: false,
          error: null,
        });
      } else {
        set({
          connected: false,
          connecting: false,
          error: data.message,
        });
      }
    } catch (err) {
      set({
        connected: false,
        connecting: false,
        error: err instanceof Error ? err.message : "Connection failed",
      });
    }
  },

  fetchStatus: async () => {
    try {
      const res = await fetch("/api/status");
      const data: StatusResponse = await res.json();
      set({
        connected: data.connected,
        providerInfo: data.provider_info || null,
      });
    } catch {
      set({ connected: false });
    }
  },

  fetchPools: async () => {
    try {
      const res = await fetch("/api/storage-pools");
      const data = await res.json();
      set({ pools: data.pools || [] });
    } catch {
      set({ pools: [] });
    }
  },

  fetchVolumes: async () => {
    try {
      const res = await fetch("/api/storage-volumes");
      const data = await res.json();
      set({ volumes: data.volumes || [] });
    } catch {
      set({ volumes: [] });
    }
  },

  fetchMaskingViews: async () => {
    try {
      const res = await fetch("/api/masking-views");
      const data = await res.json();
      set({ maskingViews: data.views || [] });
    } catch {
      set({ maskingViews: [] });
    }
  },

  fetchTopology: async () => {
    try {
      const res = await fetch("/api/topology");
      const data: TopologyResponse = await res.json();
      set({ topologyData: data });
    } catch {
      set({ topologyData: null });
    }
  },

  fetchAll: async () => {
    set({ loading: true });
    const { fetchPools, fetchVolumes, fetchMaskingViews, fetchTopology } = get();
    await Promise.all([fetchPools(), fetchVolumes(), fetchMaskingViews(), fetchTopology()]);
    set({ loading: false });
  },

  createLUN: async (request: CreateLUNRequest): Promise<CreateLUNResponse> => {
    try {
      const res = await fetch("/api/create-lun", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const data: CreateLUNResponse = await res.json();
      if (data.success) {
        await get().fetchAll();
      }
      return data;
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : "Failed to create LUN",
        volume_id: "",
        volume_name: "",
      };
    }
  },

  createMaskingView: async (request: CreateMaskingViewRequest): Promise<CreateMaskingViewResponse> => {
    try {
      const res = await fetch("/api/create-masking-view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const data: CreateMaskingViewResponse = await res.json();
      if (data.success) {
        await get().fetchAll();
      }
      return data;
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : "Failed to create masking view",
        view_id: "",
        view_name: "",
      };
    }
  },

  exportXML: async () => {
    try {
      const res = await fetch("/api/export-xml");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "storage_config.xml";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // silently fail
    }
  },
}));
