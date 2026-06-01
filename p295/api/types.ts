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

export interface GelfMessage {
  version?: string;
  host: string;
  short_message: string;
  full_message?: string;
  timestamp?: number;
  level?: number;
  _facility?: string;
  _line?: number;
  _file?: string;
  [key: string]: unknown;
}

export interface FieldMapping {
  from: string;
  to: string;
  transform?: (value: unknown) => unknown;
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
