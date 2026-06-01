import os

# Update dpdkStore.ts
store_content = '''import { create } from 'zustand'

export interface SimConfig {
  packetCount: number
  packetSize: number
  forwardMode: 'cut_through' | 'store_forward'
  baseLatencyNs: number
  jitterNs: number
}

export interface SimStats {
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

export interface PortStats {
  vport0: { received: number; sent: number }
  vport1: { received: number; sent: number }
}

export interface HistogramBucket {
  start: number
  end: number
  count: number
}

export interface SimResult {
  testId: string
  config: SimConfig
  stats: SimStats
  portStats: PortStats
  throughputPps: number
  totalTimeS: number
  histogram: {
    buckets: HistogramBucket[]
  }
  latencies: number[]
}

type TestStatus = 'idle' | 'running' | 'completed'

interface DpdkState {
  status: TestStatus
  config: SimConfig
  result: SimResult | null
  multiSizeResults: SimResult[]
  selectedSizeIndex: number | null
  error: string | null

  setConfig: (config: Partial<SimConfig>) => void
  setStatus: (status: TestStatus) => void
  setResult: (result: SimResult | null) => void
  setMultiSizeResults: (results: SimResult[]) => void
  setSelectedSizeIndex: (index: number | null) => void
  setError: (error: string | null) => void
  reset: () => void
}

const defaultConfig: SimConfig = {
  packetCount: 5000,
  packetSize: 64,
  forwardMode: 'store_forward',
  baseLatencyNs: 5000,
  jitterNs: 2000,
}

export const useDpdkStore = create<DpdkState>((set) => ({
  status: 'idle',
  config: { ...defaultConfig },
  result: null,
  multiSizeResults: [],
  selectedSizeIndex: null,
  error: null,

  setConfig: (partial) =>
    set((state) => ({ config: { ...state.config, ...partial } })),

  setStatus: (status) => set({ status }),

  setResult: (result) => set({ result }),

  setMultiSizeResults: (results) => set({ multiSizeResults: results }),

  setSelectedSizeIndex: (index) => set({ selectedSizeIndex: index }),

  setError: (error) => set({ error }),

  reset: () =>
    set({
      status: 'idle',
      config: { ...defaultConfig },
      result: null,
      multiSizeResults: [],
      selectedSizeIndex: null,
      error: null,
    }),
}))
'''

with open('src/store/dpdkStore.ts', 'w') as f:
    f.write(store_content)
print('Updated src/store/dpdkStore.ts')
