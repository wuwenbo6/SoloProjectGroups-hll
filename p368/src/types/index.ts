export type PathID = "pathA" | "pathB"

export interface PathStatus {
  id: PathID
  connected: boolean
  active: boolean
  priority: number
  queue_depth: number
  weight: number
  latency_ms: number
  iops_read: number
  iops_write: number
  bandwidth_mbps: number
}

export interface RetryQueueStatus {
  queue_size: number
  total_queued: number
  total_retried: number
  total_succeeded: number
  total_expired: number
}

export interface LoadBalancerStatus {
  mode: string
  path_a_weight: number
  path_b_weight: number
  path_a_depth: number
  path_b_depth: number
  path_a_ratio: string
  path_b_ratio: string
}

export interface SwitchLatencyRecord {
  timestamp: string
  from_path: PathID
  to_path: PathID
  latency_ms: number
  reason: string
}

export interface LatencyStats {
  count: number
  min_ms: number
  max_ms: number
  avg_ms: number
  p50_ms: number
  p95_ms: number
  p99_ms: number
  recent_records: SwitchLatencyRecord[]
}

export interface SimulatorStatus {
  paths: PathStatus[]
  active_path: PathID
  switch_count: number
  last_switch_time: string | null
  last_switch_direction: string | null
  auto_failover: boolean
  io_load_percent: number
  retry_queue: RetryQueueStatus
  load_balancer: LoadBalancerStatus
  latency_stats: LatencyStats
}

export interface SimEvent {
  timestamp: string
  type: "connect" | "disconnect" | "switch" | "recover" | "io_resume" | "retry_queue" | "retry_success" | "retry_expired" | "retry_pending" | "fallback" | "switch_latency"
  path: PathID
  message: string
}

export interface IOTick {
  pathA: number
  pathB: number
  timestamp: number
}

export type WSMessage =
  | { type: "status"; data: SimulatorStatus }
  | { type: "event"; data: SimEvent }
  | { type: "io_tick"; data: IOTick }
