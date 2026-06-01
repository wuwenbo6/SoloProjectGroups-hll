export interface DataRecord {
  id: number;
  data: string;
  timestamp: number;
}

export interface WALEvent {
  id: string;
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  record_id: number;
  data: string;
  timestamp: number;
  source: string;
}

export interface ConflictLog {
  id: string;
  timestamp: number;
  record_id: number;
  incoming_value: string;
  incoming_ts: number;
  existing_value: string;
  existing_ts: number;
  resolved_to: 'incoming' | 'existing';
  reason: string;
}

export interface AuditLog {
  id: string;
  timestamp: number;
  record_id: number;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  before_value: string | null;
  before_ts: number | null;
  after_value: string;
  after_ts: number;
  conflict_resolved: boolean;
  conflict_resolution: string | null;
}

export interface LatencyStats {
  count: number;
  avg_ms: number;
  min_ms: number;
  max_ms: number;
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
}

export interface LatencyTrendPoint {
  window_start: number;
  window_end: number;
  avg_ms: number;
  count: number;
  event_types: string[];
}

export interface LuaScriptInfo {
  enabled: boolean;
  script: string;
  default_script: string;
}

export interface SimulationState {
  is_running: boolean;
  publisher_data: DataRecord[];
  subscriber_data: DataRecord[];
  conflict_count: number;
  resolved_incoming: number;
  resolved_existing: number;
  conflict_logs: ConflictLog[];
  audit_logs: AuditLog[];
  wal_events: WALEvent[];
  latency_stats: LatencyStats;
  lua_enabled: boolean;
  resolver_type: 'lua' | 'timestamp';
}

export interface ConflictStats {
  total_conflicts: number;
  resolved_incoming: number;
  resolved_existing: number;
  logs: ConflictLog[];
}
