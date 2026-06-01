import { create } from "zustand";
import { SimulateResponse, PcieVersion, NumaMode } from "@/types";
import { fetchSimulation } from "@/api/simulation";

interface SimulationState {
  data: SimulateResponse | null;
  loading: boolean;
  error: string | null;
  iterations: number;
  includeTraditional: boolean;
  pcieVersion: PcieVersion;
  gpuCount: number;
  numaMode: NumaMode;
  setIterations: (v: number) => void;
  setIncludeTraditional: (v: boolean) => void;
  setPcieVersion: (v: PcieVersion) => void;
  setGpuCount: (v: number) => void;
  setNumaMode: (v: NumaMode) => void;
  runSimulation: () => Promise<void>;
}

export const useSimulationStore = create<SimulationState>((set, get) => ({
  data: null,
  loading: false,
  error: null,
  iterations: 100,
  includeTraditional: true,
  pcieVersion: "gen4",
  gpuCount: 1,
  numaMode: "local",
  setIterations: (v) => set({ iterations: v }),
  setIncludeTraditional: (v) => set({ includeTraditional: v }),
  setPcieVersion: (v) => set({ pcieVersion: v }),
  setGpuCount: (v) => set({ gpuCount: Math.max(1, Math.min(8, v)) }),
  setNumaMode: (v) => set({ numaMode: v }),
  runSimulation: async () => {
    const { iterations, includeTraditional, pcieVersion, gpuCount, numaMode } = get();
    set({ loading: true, error: null });
    try {
      const data = await fetchSimulation(iterations, includeTraditional, pcieVersion, gpuCount, numaMode);
      set({ data, loading: false });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      set({ error: msg, loading: false });
    }
  },
}));
