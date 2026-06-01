export type TimeSourceType = 'irigb' | 'system' | 'performance' | 'ntp' | 'http';

export interface TimeSource {
  id: string;
  name: string;
  type: TimeSourceType;
  description: string;
  isAvailable: boolean;
  isEnabled: boolean;
  priority: number;
}

export interface TimeReading {
  sourceId: string;
  timestamp: number;
  rawTime: number;
  uncertaintyMs: number;
}

export const TIME_SOURCES: TimeSource[] = [
  {
    id: 'irigb',
    name: 'IRIG-B',
    type: 'irigb',
    description: 'IRIG-B时间码解码',
    isAvailable: true,
    isEnabled: true,
    priority: 1,
  },
  {
    id: 'system',
    name: '系统时间',
    type: 'system',
    description: '操作系统时间',
    isAvailable: true,
    isEnabled: true,
    priority: 2,
  },
  {
    id: 'performance',
    name: '高精度时钟',
    type: 'performance',
    description: '浏览器Performance API',
    isAvailable: typeof performance !== 'undefined' && typeof performance.now === 'function',
    isEnabled: true,
    priority: 3,
  },
  {
    id: 'http',
    name: 'HTTP时间',
    type: 'http',
    description: '通过HTTP头获取时间',
    isAvailable: true,
    isEnabled: false,
    priority: 4,
  },
  {
    id: 'ntp',
    name: 'NTP服务器',
    type: 'ntp',
    description: '网络时间协议（需后端支持）',
    isAvailable: false,
    isEnabled: false,
    priority: 5,
  },
];

export class TimeSourceManager {
  private sources: Map<string, TimeSource>;
  private lastReadings: Map<string, TimeReading>;
  private performanceOrigin: number;

  constructor() {
    this.sources = new Map();
    this.lastReadings = new Map();
    this.performanceOrigin = performance.timeOrigin || Date.now();

    TIME_SOURCES.forEach((source) => {
      this.sources.set(source.id, { ...source });
    });
  }

  getSources(): TimeSource[] {
    return Array.from(this.sources.values()).sort((a, b) => a.priority - b.priority);
  }

  setSourceEnabled(sourceId: string, enabled: boolean): void {
    const source = this.sources.get(sourceId);
    if (source) {
      source.isEnabled = enabled;
    }
  }

  getReading(sourceId: string): TimeReading | null {
    const source = this.sources.get(sourceId);
    if (!source || !source.isEnabled || !source.isAvailable) {
      return null;
    }

    let reading: TimeReading | null = null;

    switch (source.type) {
      case 'system':
        reading = this.readSystemTime(sourceId);
        break;
      case 'performance':
        reading = this.readPerformanceTime(sourceId);
        break;
      case 'http':
        reading = this.readHttpTime(sourceId);
        break;
      default:
        reading = null;
    }

    if (reading) {
      this.lastReadings.set(sourceId, reading);
    }

    return reading;
  }

  getAllReadings(): Map<string, TimeReading> {
    const readings = new Map<string, TimeReading>();

    this.sources.forEach((source) => {
      if (source.isEnabled && source.isAvailable) {
        const reading = this.getReading(source.id);
        if (reading) {
          readings.set(source.id, reading);
        }
      }
    });

    return readings;
  }

  getLastReading(sourceId: string): TimeReading | null {
    return this.lastReadings.get(sourceId) || null;
  }

  private readSystemTime(sourceId: string): TimeReading {
    const now = Date.now();
    return {
      sourceId,
      timestamp: now,
      rawTime: now,
      uncertaintyMs: 100,
    };
  }

  private readPerformanceTime(sourceId: string): TimeReading {
    const perfNow = performance.now();
    const now = this.performanceOrigin + perfNow;
    return {
      sourceId,
      timestamp: now,
      rawTime: perfNow,
      uncertaintyMs: 1,
    };
  }

  private readHttpTime(sourceId: string): TimeReading | null {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('HEAD', window.location.href, false);
      xhr.send(null);

      const dateHeader = xhr.getResponseHeader('Date');
      if (dateHeader) {
        const serverTime = new Date(dateHeader).getTime();
        const localTime = Date.now();
        const rtt = localTime - this.performanceOrigin + performance.now();

        return {
          sourceId,
          timestamp: serverTime + rtt / 2,
          rawTime: serverTime,
          uncertaintyMs: Math.max(50, rtt / 2),
        };
      }
    } catch (e) {
      console.warn('HTTP时间获取失败:', e);
    }

    return null;
  }

  getTimeOffset(sourceId: string, referenceSourceId: string = 'irigb'): number | null {
    const sourceReading = this.getLastReading(sourceId);
    const refReading = this.getLastReading(referenceSourceId);

    if (!sourceReading || !refReading) {
      return null;
    }

    return sourceReading.timestamp - refReading.timestamp;
  }

  getAllOffsets(referenceSourceId: string = 'irigb'): Map<string, number> {
    const offsets = new Map<string, number>();

    this.sources.forEach((source) => {
      if (source.id !== referenceSourceId && source.isEnabled && source.isAvailable) {
        const offset = this.getTimeOffset(source.id, referenceSourceId);
        if (offset !== null) {
          offsets.set(source.id, offset);
        }
      }
    });

    return offsets;
  }
}

export const timeSourceManager = new TimeSourceManager();
