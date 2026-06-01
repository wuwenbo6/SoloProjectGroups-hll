import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../db/database.js';
import type {
  MotionDetectionConfig,
  MotionRegion,
  MotionEvent,
  MotionDetectionStatus,
  SmartSearchResult,
  TimeRange,
  Event,
} from '../../shared/types.js';

const DEFAULT_REGIONS: MotionRegion[] = [
  { id: 'region-1', name: '入口区域', x: 0, y: 0, width: 50, height: 50, enabled: true },
  { id: 'region-2', name: '中央区域', x: 25, y: 25, width: 50, height: 50, enabled: true },
  { id: 'region-3', name: '周边区域', x: 0, y: 50, width: 100, height: 50, enabled: false },
];

let config: MotionDetectionConfig = {
  enabled: true,
  sensitivity: 50,
  minDuration: 1000,
  cooldown: 5000,
  regions: DEFAULT_REGIONS,
};

let motionEvents: MotionEvent[] = [];
let detectionInterval: NodeJS.Timeout | null = null;
let lastEventTime: number = 0;
let activeRecordingId: string | null = null;
let onMotionDetected: ((event: MotionEvent) => void) | null = null;

export function getMotionConfig(): MotionDetectionConfig {
  return { ...config, regions: config.regions.map(r => ({ ...r })) };
}

export function updateMotionConfig(updates: Partial<MotionDetectionConfig>): MotionDetectionConfig {
  config = { ...config, ...updates };
  return getMotionConfig();
}

export function getMotionStatus(): MotionDetectionStatus {
  return {
    enabled: config.enabled,
    sensitivity: config.sensitivity,
    eventCount: motionEvents.length,
    lastEventTime: motionEvents.length > 0 ? motionEvents[motionEvents.length - 1].timestamp : null,
    regions: config.regions.map(r => ({ ...r })),
  };
}

export function startMotionDetection(recordingId: string, callback?: (event: MotionEvent) => void) {
  activeRecordingId = recordingId;
  onMotionDetected = callback || null;

  if (detectionInterval) {
    clearInterval(detectionInterval);
  }

  detectionInterval = setInterval(() => {
    if (!config.enabled || !activeRecordingId) return;

    const now = Date.now();
    if (now - lastEventTime < config.cooldown) return;

    const detectionProbability = config.sensitivity / 100 * 0.15;
    if (Math.random() < detectionProbability) {
      const enabledRegions = config.regions.filter(r => r.enabled);
      if (enabledRegions.length === 0) return;

      const region = enabledRegions[Math.floor(Math.random() * enabledRegions.length)];
      const intensity = Math.floor(Math.random() * 60) + 40;
      const duration = Math.floor(Math.random() * config.minDuration * 3) + config.minDuration;
      const confidence = Math.floor(Math.random() * 30) + 70;

      const motionEvent: MotionEvent = {
        id: `mot-${uuidv4()}`,
        recordingId: activeRecordingId,
        timestamp: now,
        regionId: region.id,
        regionName: region.name,
        intensity,
        duration,
        confidence,
      };

      motionEvents.push(motionEvent);
      lastEventTime = now;

      const db = getDatabase();
      db.events.create({
        recordingId: activeRecordingId,
        timestamp: now,
        type: 'motion',
        title: `运动检测 - ${region.name}`,
        description: `区域: ${region.name}, 强度: ${intensity}%, 置信度: ${confidence}%, 持续: ${duration}ms`,
      });

      console.log(`[MotionDetection] Detected in ${region.name}, intensity=${intensity}, confidence=${confidence}`);

      if (onMotionDetected) {
        onMotionDetected(motionEvent);
      }
    }
  }, 2000);

  console.log(`[MotionDetection] Started for recording ${recordingId}, sensitivity=${config.sensitivity}`);
}

export function stopMotionDetection() {
  if (detectionInterval) {
    clearInterval(detectionInterval);
    detectionInterval = null;
  }
  activeRecordingId = null;
  onMotionDetected = null;
  console.log('[MotionDetection] Stopped');
}

export function getMotionEvents(recordingId?: string): MotionEvent[] {
  if (recordingId) {
    return motionEvents.filter(e => e.recordingId === recordingId);
  }
  return [...motionEvents];
}

export function clearMotionEvents() {
  motionEvents = [];
  lastEventTime = 0;
}

export function toggleRegion(regionId: string, enabled: boolean): MotionRegion | null {
  const region = config.regions.find(r => r.id === regionId);
  if (region) {
    region.enabled = enabled;
    return { ...region };
  }
  return null;
}

export function addRegion(region: Omit<MotionRegion, 'id'>): MotionRegion {
  const newRegion: MotionRegion = {
    ...region,
    id: `region-${uuidv4().slice(0, 8)}`,
  };
  config.regions.push(newRegion);
  return newRegion;
}

export function removeRegion(regionId: string): boolean {
  const index = config.regions.findIndex(r => r.id === regionId);
  if (index !== -1) {
    config.regions.splice(index, 1);
    return true;
  }
  return false;
}

export function smartSearch(params: {
  recordingId?: string;
  eventType?: Event['type'];
  startTime?: number;
  endTime?: number;
  minIntensity?: number;
  regionId?: string;
  query?: string;
}): SmartSearchResult {
  const db = getDatabase();
  let events = db.events.getAll(params.recordingId, params.type);

  if (params.startTime) {
    events = events.filter(e => e.timestamp >= params.startTime!);
  }
  if (params.endTime) {
    events = events.filter(e => e.timestamp <= params.endTime!);
  }
  if (params.query) {
    const q = params.query.toLowerCase();
    events = events.filter(e =>
      e.title.toLowerCase().includes(q) ||
      (e.description && e.description.toLowerCase().includes(q))
    );
  }

  if (params.eventType === 'motion' && (params.minIntensity || params.regionId)) {
    const motionEventMap = new Map<string, MotionEvent>();
    for (const me of motionEvents) {
      motionEventMap.set(me.id, me);
    }
    events = events.filter(e => {
      if (e.type !== 'motion') return true;
      const matchingMotion = motionEvents.find(me =>
        me.recordingId === e.recordingId &&
        Math.abs(me.timestamp - e.timestamp) < 1000
      );
      if (!matchingMotion) return true;
      if (params.minIntensity && matchingMotion.intensity < params.minIntensity) return false;
      if (params.regionId && matchingMotion.regionId !== params.regionId) return false;
      return true;
    });
  }

  events.sort((a, b) => a.timestamp - b.timestamp);

  const timeRanges: TimeRange[] = [];
  const CLUSTER_WINDOW = 60000;

  if (events.length > 0) {
    let rangeStart = events[0].timestamp;
    let rangeEnd = events[0].timestamp;
    let rangeCount = 1;

    for (let i = 1; i < events.length; i++) {
      if (events[i].timestamp - rangeEnd <= CLUSTER_WINDOW) {
        rangeEnd = events[i].timestamp;
        rangeCount++;
      } else {
        timeRanges.push({
          start: rangeStart,
          end: rangeEnd,
          eventCount: rangeCount,
          label: `${new Date(rangeStart).toLocaleTimeString('zh-CN')} - ${new Date(rangeEnd).toLocaleTimeString('zh-CN')}`,
        });
        rangeStart = events[i].timestamp;
        rangeEnd = events[i].timestamp;
        rangeCount = 1;
      }
    }
    timeRanges.push({
      start: rangeStart,
      end: rangeEnd,
      eventCount: rangeCount,
      label: `${new Date(rangeStart).toLocaleTimeString('zh-CN')} - ${new Date(rangeEnd).toLocaleTimeString('zh-CN')}`,
    });
  }

  return {
    events,
    totalMatches: events.length,
    timeRanges,
  };
}
