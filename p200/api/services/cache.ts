import type { CSVData, InterpolationResult, FieldMapping, DataPoint } from '../../shared/types.js';

interface CacheEntry {
  csvData: CSVData;
  fieldMapping?: FieldMapping;
  interpolation?: InterpolationResult;
  dataPoints?: DataPoint[];
  createdAt: number;
}

class DataCache {
  private cache: Map<string, CacheEntry> = new Map();
  private ttl: number = 3600000;

  set(fileId: string, entry: Partial<CacheEntry>) {
    const existing = this.cache.get(fileId);
    this.cache.set(fileId, {
      ...existing,
      ...entry,
      createdAt: Date.now(),
    } as CacheEntry);
  }

  get(fileId: string): CacheEntry | undefined {
    const entry = this.cache.get(fileId);
    if (!entry) return undefined;
    
    if (Date.now() - entry.createdAt > this.ttl) {
      this.cache.delete(fileId);
      return undefined;
    }
    
    return entry;
  }

  has(fileId: string): boolean {
    return this.get(fileId) !== undefined;
  }

  delete(fileId: string): boolean {
    return this.cache.delete(fileId);
  }

  cleanup() {
    const now = Date.now();
    for (const [fileId, entry] of this.cache.entries()) {
      if (now - entry.createdAt > this.ttl) {
        this.cache.delete(fileId);
      }
    }
  }
}

export const dataCache = new DataCache();

export function setCSVData(fileId: string, csvData: CSVData) {
  dataCache.set(fileId, { csvData, createdAt: Date.now() });
}

export function getCSVData(fileId: string) {
  return dataCache.get(fileId)?.csvData;
}

export function setFieldMapping(fileId: string, fieldMapping: FieldMapping) {
  dataCache.set(fileId, { fieldMapping });
}

export function getFieldMapping(fileId: string) {
  return dataCache.get(fileId)?.fieldMapping;
}

export function setInterpolation(fileId: string, interpolation: InterpolationResult) {
  dataCache.set(fileId, { interpolation });
}

export function getInterpolation(fileId: string) {
  return dataCache.get(fileId)?.interpolation;
}

export function setGrid(fileId: string, metric: 'rsrp' | 'sinr', grid: Float64Array) {
  const entry = dataCache.get(fileId);
  if (entry?.interpolation) {
    if (!entry.interpolation.grids) {
      entry.interpolation.grids = {};
    }
    entry.interpolation.grids[metric] = grid;
  }
}

export function getGrid(fileId: string, metric: 'rsrp' | 'sinr') {
  const entry = dataCache.get(fileId);
  return entry?.interpolation?.grids?.[metric];
}

export function setDataPoints(fileId: string, dataPoints: DataPoint[]) {
  dataCache.set(fileId, { dataPoints });
}

export function getDataPoints(fileId: string) {
  return dataCache.get(fileId)?.dataPoints;
}

setInterval(() => dataCache.cleanup(), 60000);
