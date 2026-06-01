export interface LogEntry {
  id: string;
  host: string;
  short_message: string;
  full_message: string | null;
  timestamp: string;
  level: number;
  facility: string | null;
  line: number | null;
  file: string | null;
  _raw: string;
}

export interface LogEntryMapped extends LogEntry {
  level_name: string;
  timestamp_iso: string;
  timestamp_unix: number;
}

export interface SearchResponse {
  total: number;
  page: number;
  limit: number;
  data: LogEntry[];
}

export interface StatsResponse {
  totalLogs: number;
  lastReceived: string | null;
  hostCounts: Record<string, number>;
  levelCounts: Record<number, number>;
}

export const LEVEL_NAMES: Record<number, string> = {
  0: 'EMERGENCY',
  1: 'ALERT',
  2: 'CRITICAL',
  3: 'ERROR',
  4: 'WARNING',
  5: 'NOTICE',
  6: 'INFO',
  7: 'DEBUG',
};

export const LEVEL_COLORS: Record<number, string> = {
  0: 'text-red-500',
  1: 'text-red-400',
  2: 'text-orange-500',
  3: 'text-gelf-error',
  4: 'text-gelf-warn',
  5: 'text-blue-400',
  6: 'text-gelf-success',
  7: 'text-gelf-muted',
};

export const FIELD_MAPPINGS = [
  { from: 'level', to: 'level_name', description: 'Level 数字转文本 (如 6 → INFO)' },
  { from: 'timestamp', to: 'timestamp_iso', description: 'ISO 8601 格式时间戳' },
  { from: 'timestamp', to: 'timestamp_unix', description: 'Unix 时间戳（秒）' },
];
