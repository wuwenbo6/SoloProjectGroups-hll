export interface OverviewData {
  total_allocated: number;
  total_freed: number;
  leaked_size: number;
  leaked_blocks: number;
  total_operations: number;
  allocation_count: number;
  deallocation_count: number;
  ref_count_increments: number;
}

export interface LogEntry {
  seq: number;
  op_type: string;
  op_name: string;
  offset: number;
  length: number;
  device: string;
  file_path: string;
  timestamp: number;
}

export interface LeakEntry {
  id: number;
  offset: number;
  length: number;
  device: string;
  file_path: string;
  allocated_at_seq: number;
  allocated_at_timestamp: number;
  ref_count: number;
}

export interface TrendPoint {
  seq: number;
  allocated: number;
  freed: number;
  leaked: number;
}

export interface LeakSummary {
  by_device: Record<string, { count: number; total_size: number; total_refs: number }>;
  by_file: Record<string, { count: number; total_size: number; total_refs: number }>;
}

export interface PaginatedLogs {
  logs: LogEntry[];
  total: number;
  page: number;
  per_page: number;
}

export interface PaginatedLeaks {
  leaks: LeakEntry[];
  total: number;
  page: number;
  per_page: number;
  summary: LeakSummary;
}

export interface AnalysisStatus {
  task_id: string;
  status: string;
  progress: number;
  error?: string;
}

export interface FixDeallocOp {
  op_type: number;
  op_name: string;
  device: string | number;
  offset: number;
  length: number;
  file_path: string;
  leak_id: number;
}

export interface FixScript {
  dealloc_operations: FixDeallocOp[];
  operation_count: number;
  block_count: number;
  total_size: number;
  script_content: string;
  script_type: string;
}
