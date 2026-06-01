import { create } from 'zustand'
import type {
  SimConfig,
  SimState,
  ImageProgress,
  LatencyData,
  ConsistencyData,
  ClusterStatusData,
  LogEntry,
  FlushStatusData,
  RoleSwitchData,
  SnapshotData,
  OrphanCleanupData,
  ConflictData,
  HistogramData,
  Conflict,
} from '@/types'

interface SimulatorStore {
  simState: SimState
  config: SimConfig
  images: ImageProgress[]
  latencyHistory: Array<LatencyData & { timestamp: number }>
  consistencyData: ConsistencyData | null
  clusterStatus: ClusterStatusData | null
  logs: LogEntry[]
  tickCount: number
  pendingSyncQueue: number
  pendingWritesBlocked: boolean
  flushing: boolean
  flushStatus: FlushStatusData | null
  roleSwitchData: RoleSwitchData | null
  orphanCleanupData: OrphanCleanupData | null
  snapshotData: SnapshotData | null
  conflictData: ConflictData | null
  conflicts: Conflict[]
  histogramData: HistogramData | null

  setSimState: (state: SimState) => void
  setConfig: (config: SimConfig) => void
  setImages: (images: ImageProgress[]) => void
  addLatencyData: (data: LatencyData) => void
  setConsistencyData: (data: ConsistencyData) => void
  setClusterStatus: (data: ClusterStatusData) => void
  addLogs: (entries: LogEntry[]) => void
  setTickCount: (count: number) => void
  setPendingSyncQueue: (count: number) => void
  setPendingWritesBlocked: (blocked: boolean) => void
  setFlushing: (flushing: boolean) => void
  setFlushStatus: (status: FlushStatusData | null) => void
  setRoleSwitchData: (data: RoleSwitchData | null) => void
  setOrphanCleanupData: (data: OrphanCleanupData | null) => void
  setSnapshotData: (data: SnapshotData | null) => void
  setConflictData: (data: ConflictData | null) => void
  setConflicts: (conflicts: Conflict[]) => void
  setHistogramData: (data: HistogramData | null) => void
  reset: () => void
}

const defaultConfig: SimConfig = {
  blockSize: 4096,
  imageSize: 1024,
  imageCount: 3,
  baseLatency: 50,
  jitterRange: 30,
  packetLossRate: 0.02,
  bandwidth: 100,
  primaryOsds: 6,
  backupOsds: 6,
  consistencyInterval: 5,
  orphanCleanupInterval: 10,
  snapshotInterval: 8,
  replicationMode: 'async_primary_backup',
  conflictResolution: 'last_write_wins',
  conflictDetectionInterval: 3,
  histogramBucketCount: 10,
  histogramMaxLatency: 200,
}

export const useSimulatorStore = create<SimulatorStore>((set) => ({
  simState: 'idle',
  config: defaultConfig,
  images: [],
  latencyHistory: [],
  consistencyData: null,
  clusterStatus: null,
  logs: [],
  tickCount: 0,
  pendingSyncQueue: 0,
  pendingWritesBlocked: false,
  flushing: false,
  flushStatus: null,
  roleSwitchData: null,
  orphanCleanupData: null,
  snapshotData: null,
  conflictData: null,
  conflicts: [],
  histogramData: null,

  setSimState: (state) => set({ simState: state }),
  setConfig: (config) => set({ config }),
  setImages: (images) => set({ images }),
  addLatencyData: (data) =>
    set((s) => ({
      latencyHistory: [...s.latencyHistory.slice(-59), { ...data, timestamp: Date.now() }],
    })),
  setConsistencyData: (data) => set({ consistencyData: data }),
  setClusterStatus: (data) => set({ clusterStatus: data }),
  addLogs: (entries) =>
    set((s) => ({
      logs: [...s.logs, ...entries].slice(-200),
    })),
  setTickCount: (count) => set({ tickCount: count }),
  setPendingSyncQueue: (count) => set({ pendingSyncQueue: count }),
  setPendingWritesBlocked: (blocked) => set({ pendingWritesBlocked: blocked }),
  setFlushing: (flushing) => set({ flushing }),
  setFlushStatus: (status) => set({ flushStatus: status }),
  setRoleSwitchData: (data) => set({ roleSwitchData: data }),
  setOrphanCleanupData: (data) => set({ orphanCleanupData: data }),
  setSnapshotData: (data) => set({ snapshotData: data }),
  setConflictData: (data) => set({ conflictData: data }),
  setConflicts: (conflicts) => set({ conflicts }),
  setHistogramData: (data) => set({ histogramData: data }),
  reset: () =>
    set({
      simState: 'idle',
      images: [],
      latencyHistory: [],
      consistencyData: null,
      clusterStatus: null,
      logs: [],
      tickCount: 0,
      pendingSyncQueue: 0,
      pendingWritesBlocked: false,
      flushing: false,
      flushStatus: null,
      roleSwitchData: null,
      orphanCleanupData: null,
      snapshotData: null,
      conflictData: null,
      conflicts: [],
      histogramData: null,
    }),
}))
