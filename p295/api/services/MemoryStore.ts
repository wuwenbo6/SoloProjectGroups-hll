import type {
  LogEntry,
  GelfMessage,
  SearchResponse,
  StatsResponse,
  LogEntryMapped,
  FieldMapping,
} from '../types.js';
import { LEVEL_NAMES } from '../types.js';

export { LEVEL_NAMES };

const DEFAULT_FIELD_MAPPINGS: FieldMapping[] = [
  { from: 'level', to: 'level_name', transform: (v) => LEVEL_NAMES[Number(v)] || `LEVEL_${v}` },
  { from: 'timestamp', to: 'timestamp_iso', transform: (v) => String(v) },
  {
    from: 'timestamp',
    to: 'timestamp_unix',
    transform: (v) => Math.floor(new Date(String(v)).getTime() / 1000),
  },
];

class MemoryStore {
  private logs: LogEntry[] = [];
  private counter = 0;

  insert(raw: string, parsed: GelfMessage): LogEntry {
    const entry: LogEntry = {
      id: `log_${Date.now()}_${++this.counter}`,
      host: parsed.host || 'unknown',
      short_message: parsed.short_message || '',
      full_message: parsed.full_message || null,
      timestamp: parsed.timestamp
        ? new Date(parsed.timestamp * 1000).toISOString()
        : new Date().toISOString(),
      level: parsed.level ?? 6,
      facility: parsed._facility || null,
      line: parsed._line || null,
      file: parsed._file || null,
      _raw: raw,
    };
    this.logs.unshift(entry);
    if (this.logs.length > 10000) {
      this.logs = this.logs.slice(0, 10000);
    }
    return entry;
  }

  search(query: string, page: number, limit: number): SearchResponse {
    let filtered = this.logs;
    if (query.trim()) {
      const q = query.toLowerCase();
      filtered = this.logs.filter((log) => {
        const searchable = [
          log.host,
          log.short_message,
          log.full_message || '',
          log.facility || '',
          log.file || '',
          log._raw,
        ]
          .join(' ')
          .toLowerCase();
        return searchable.includes(q);
      });
    }
    const total = filtered.length;
    const start = (page - 1) * limit;
    const data = filtered.slice(start, start + limit);
    return { total, page, limit, data };
  }

  getAllLogs(query = ''): LogEntry[] {
    if (!query.trim()) return [...this.logs];
    const q = query.toLowerCase();
    return this.logs.filter((log) => {
      const searchable = [
        log.host,
        log.short_message,
        log.full_message || '',
        log.facility || '',
        log.file || '',
        log._raw,
      ]
        .join(' ')
        .toLowerCase();
      return searchable.includes(q);
    });
  }

  applyFieldMappings(log: LogEntry, mappings: FieldMapping[] = DEFAULT_FIELD_MAPPINGS): LogEntryMapped {
    const mapped = log as unknown as LogEntryMapped;
    for (const mapping of mappings) {
      const value = (log as unknown as Record<string, unknown>)[mapping.from];
      if (value !== undefined) {
        const transformed = mapping.transform ? mapping.transform(value) : value;
        (mapped as unknown as Record<string, unknown>)[mapping.to] = transformed;
      }
    }
    return mapped;
  }

  getMappedLogs(query = '', includeRaw = true): LogEntryMapped[] {
    const logs = this.getAllLogs(query);
    return logs.map((log) => this.applyFieldMappings(log));
  }

  exportJsonl(query = '', includeRaw = true, mapped = true): string {
    const logs = this.getAllLogs(query);
    const lines = logs.map((log) => {
      const record = mapped ? this.applyFieldMappings(log) : log;
      const output = { ...record };
      if (!includeRaw) {
        delete (output as Partial<LogEntry>)._raw;
      }
      return JSON.stringify(output);
    });
    return lines.join('\n');
  }

  exportRawJsonl(query = ''): string {
    const logs = this.getAllLogs(query);
    return logs.map((log) => log._raw).join('\n');
  }

  stats(): StatsResponse {
    const hostCounts: Record<string, number> = {};
    const levelCounts: Record<number, number> = {};
    for (const log of this.logs) {
      hostCounts[log.host] = (hostCounts[log.host] || 0) + 1;
      levelCounts[log.level] = (levelCounts[log.level] || 0) + 1;
    }
    return {
      totalLogs: this.logs.length,
      lastReceived: this.logs.length > 0 ? this.logs[0].timestamp : null,
      hostCounts,
      levelCounts,
    };
  }
}

export const store = new MemoryStore();
