import { create } from "zustand"

export interface SimConfig {
  packetCount: number
  packetSize: number
  forwardMode: "cut_through" | "store_forward"
  baseLatencyNs: number
  jitterNs: number
}

export interface HistogramBucket {
  start: number
  end: number
  count: number
}

export interface SimResult {
  testId: string
  config: SimConfig
  stats: {
    count: number
    mean: number
    min: number
    max: number
    p50: number
    p90: number
    p99: number
    p999: number
    stddev: number
  }
  portStats: {
    vport0: { received: number; sent: number }
    vport1: { received: number; sent: number }
  }
  throughputPps: number
  totalTimeS: number
  histogram: {
    buckets: HistogramBucket[]
  }
  latencies: number[]
}

interface DpdkState {
  config: SimConfig
  result: SimResult | null
  multiSizeResults: SimResult[]
  selectedPacketSize: number | null
  status: "idle" | "running" | "completed" | "error"
  error: string | null

  setConfig: (config: Partial<SimConfig>) => void
  setResult: (result: SimResult | null) => void
  setMultiSizeResults: (results: SimResult[]) => void
  setSelectedPacketSize: (size: number | null) => void
  setStatus: (status: "idle" | "running" | "completed" | "error") => void
  setError: (error: string | null) => void
  reset: () => void
}

const DEFAULT_CONFIG: SimConfig = {
  packetCount: 10000,
  packetSize: 64,
  forwardMode: "store_forward",
  baseLatencyNs: 5000,
  jitterNs: 2000,
}

export const useDpdkStore = create<DpdkState>((set) => ({
  config: DEFAULT_CONFIG,
  result: null,
  multiSizeResults: [],
  selectedPacketSize: null,
  status: "idle",
  error: null,

  setConfig: (config) =>
    set((state) => ({ config: { ...state.config, ...config } })),
  setResult: (result) => set({ result }),
  setMultiSizeResults: (multiSizeResults) => set({ multiSizeResults }),
  setSelectedPacketSize: (selectedPacketSize) => set({ selectedPacketSize }),
  setStatus: (status) => set({ status }),
  setError: (error) => set({ error }),
  reset: () =>
    set({
      config: DEFAULT_CONFIG,
      result: null,
      multiSizeResults: [],
      selectedPacketSize: null,
      status: "idle",
      error: null,
    }),
}))
    error: null,
  }),
}))
    error: null,
  }),
}))
      result: null,
      error: null,
    }),
}))
