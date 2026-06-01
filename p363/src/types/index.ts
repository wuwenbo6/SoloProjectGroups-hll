export interface SimConfig {
  blockSize: number
  imageSize: number
  imageCount: number
  baseLatency: number
  jitterRange: number
  packetLossRate: number
  bandwidth: number
  primaryOsds: number
  backupOsds: number
  consistencyInterval: number
  orphanCleanupInterval: number
  snapshotInterval: number
  replicationMode: ReplicationMode
  conflictResolution: ConflictResolution
  conflictDetectionInterval: number
  histogramBucketCount: number
  histogramMaxLatency: number
}

export type ReplicationMode = 'async_primary_backup' | 'active_active'
export type ConflictResolution = 'last_write_wins' | 'manual' | 'merge'

export type SimState = 'idle' | 'running' | 'paused' | 'flushing' | 'switching'

export interface ImageProgress {
  image_id: string
  image_name: string
  total_blocks: number
  synced_blocks: number
  progress: number
}

export interface LatencyData {
  base_ms: number
  jitter_ms: number
  packet_loss_rate: number
  bandwidth_mbs: number
}

export interface BlockMismatch {
  block_index: number
  primary_hash: string
  backup_hash: string
}

export interface ImageConsistencyResult {
  image_id: string
  image_name: string
  mismatches: BlockMismatch[]
  mismatch_count: number
}

export interface ConsistencyData {
  timestamp: number
  results: ImageConsistencyResult[]
  total_mismatches: number
}

export interface Conflict {
  id: string
  image_id: string
  block_index: number
  cluster_a_hash: string
  cluster_b_hash: string
  cluster_a_version: number
  cluster_b_version: number
  detected_at: number
  resolved: boolean
  resolution?: string
  winner?: string
}

export interface ConflictData {
  total: number
  unresolved: number
  new_conflicts: Array<{
    id: string
    image_id: string
    block_index: number
  }>
}

export interface HistogramData {
  bucket_count: number
  bucket_edges: number[]
  buckets: number[]
  total_samples: number
  min_ms: number
  max_ms: number
  avg_ms: number
  p50_ms: number
  p95_ms: number
  p99_ms: number
}

export interface ClusterInfo {
  id: string
  name: string
  role: 'primary' | 'backup' | 'active'
  osd_count: number
  osds: string[]
  pool_count: number
  snapshot_count: number
  orphan_count?: number
}

export interface ClusterStatusData {
  replication_mode: ReplicationMode
  primary: ClusterInfo
  backup: ClusterInfo
  conflict_count: number
  unresolved_conflict_count: number
}

export interface LogEntry {
  timestamp: number
  event: string
  detail: string
  level: string
}

export interface FlushStatusData {
  status: 'flushing' | 'completed' | 'error'
  pending_count?: number
  flushed_count?: number
  message?: string
}

export interface RoleSwitchData {
  new_primary: string
  new_backup: string
}

export interface SnapshotData {
  count: number
  snapshots: Array<{ id: string; image_name: string }>
}

export interface OrphanCleanupData {
  found: number
  cleaned: number
  orphans: Array<{ image_id: string; block_index: number }>
}

export interface WSMessage {
  type:
    | 'sync_progress'
    | 'latency'
    | 'consistency'
    | 'log'
    | 'cluster_status'
    | 'flush_status'
    | 'role_switch'
    | 'snapshot'
    | 'orphan_cleanup'
    | 'conflict'
    | 'histogram'
  data: unknown
}
