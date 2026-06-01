import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import type { RecordingSegment, RecordingIndex, IndexEntry } from '../../shared/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RECORDINGS_DIR = path.join(__dirname, '../../recordings');
const SEGMENT_DURATION = 10 * 60 * 1000;

interface ActiveRecording {
  recordingId: string;
  cameraId: string;
  currentSegment: RecordingSegment | null;
  currentSegmentIndex: number;
  segments: RecordingSegment[];
  index: RecordingIndex;
  startTime: number;
  byteOffset: number;
}

const activeRecordings = new Map<string, ActiveRecording>();

export function ensureDirs() {
  if (!fs.existsSync(RECORDINGS_DIR)) {
    fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
  }
}

export function getSegmentDuration() {
  return SEGMENT_DURATION;
}

export function createNewSegment(recordingId: string, cameraId: string, segmentIndex: number, startTime: number): RecordingSegment {
  const segmentId = `${recordingId}-seg-${segmentIndex}-${uuidv4().slice(0, 8)}`;
  const fileName = `${segmentId}.mp4`;
  const filePath = path.join(RECORDINGS_DIR, fileName);

  const segment: RecordingSegment = {
    id: segmentId,
    recordingId,
    segmentIndex,
    startTime,
    endTime: 0,
    duration: 0,
    filePath,
    fileSize: 0,
    createdAt: Date.now(),
  };

  return segment;
}

export function startSegmentRecording(recordingId: string, cameraId: string): ActiveRecording {
  ensureDirs();

  const now = Date.now();
  const firstSegment = createNewSegment(recordingId, cameraId, 0, now);

  const activeRecording: ActiveRecording = {
    recordingId,
    cameraId,
    currentSegment: firstSegment,
    currentSegmentIndex: 0,
    segments: [firstSegment],
    index: {
      recordingId,
      segmentIndexes: {
        [firstSegment.id]: [],
      },
      updatedAt: now,
    },
    startTime: now,
    byteOffset: 0,
  };

  activeRecordings.set(recordingId, activeRecording);
  saveIndex(activeRecording);

  return activeRecording;
}

export function shouldRotateSegment(recordingId: string): boolean {
  const active = activeRecordings.get(recordingId);
  if (!active || !active.currentSegment) return false;

  const now = Date.now();
  const segmentDuration = now - active.currentSegment.startTime;

  return segmentDuration >= SEGMENT_DURATION;
}

export function rotateSegment(recordingId: string): RecordingSegment {
  const active = activeRecordings.get(recordingId);
  if (!active) {
    throw new Error('Recording not found');
  }

  const now = Date.now();
  const previousSegment = active.currentSegment;

  if (previousSegment) {
    previousSegment.endTime = now;
    previousSegment.duration = now - previousSegment.startTime;
    previousSegment.fileSize = simulateFileSize(previousSegment.duration);
    active.segments[active.currentSegmentIndex] = previousSegment;
  }

  active.currentSegmentIndex++;
  const newSegment = createNewSegment(recordingId, active.cameraId, active.currentSegmentIndex, now);

  active.currentSegment = newSegment;
  active.segments.push(newSegment);
  active.index.segmentIndexes[newSegment.id] = [];
  active.index.updatedAt = now;

  saveIndex(active);

  return newSegment;
}

export function addIndexEntry(recordingId: string, timestamp: number): IndexEntry | null {
  const active = activeRecordings.get(recordingId);
  if (!active || !active.currentSegment) return null;

  const entry: IndexEntry = {
    timestamp,
    byteOffset: active.byteOffset,
    segmentIndex: active.currentSegmentIndex,
  };

  const segmentId = active.currentSegment.id;
  if (!active.index.segmentIndexes[segmentId]) {
    active.index.segmentIndexes[segmentId] = [];
  }
  active.index.segmentIndexes[segmentId].push(entry);
  active.index.updatedAt = Date.now();

  active.byteOffset += simulateFrameSize();

  return entry;
}

export function stopSegmentRecording(recordingId: string): RecordingSegment[] {
  const active = activeRecordings.get(recordingId);
  if (!active) {
    return [];
  }

  const now = Date.now();

  if (active.currentSegment) {
    active.currentSegment.endTime = now;
    active.currentSegment.duration = now - active.currentSegment.startTime;
    active.currentSegment.fileSize = simulateFileSize(active.currentSegment.duration);
    active.segments[active.currentSegmentIndex] = active.currentSegment;
  }

  saveIndex(active);
  activeRecordings.delete(recordingId);

  return active.segments;
}

export function getRecordingSegments(recordingId: string): RecordingSegment[] {
  const active = activeRecordings.get(recordingId);
  if (active) {
    return [...active.segments];
  }

  const indexPath = getIndexPath(recordingId);
  if (fs.existsSync(indexPath)) {
    try {
      const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      const segmentsDir = path.join(RECORDINGS_DIR, recordingId);
      
      if (fs.existsSync(segmentsDir)) {
        const segments: RecordingSegment[] = [];
        const files = fs.readdirSync(segmentsDir).filter(f => f.endsWith('.mp4'));
        
        for (const file of files) {
          const filePath = path.join(segmentsDir, file);
          const stat = fs.statSync(filePath);
          const parts = file.replace('.mp4', '').split('-');
          const segmentIndex = parseInt(parts[parts.length - 1]) || 0;
          
          segments.push({
            id: file.replace('.mp4', ''),
            recordingId,
            segmentIndex,
            startTime: indexData.segmentStartTimes?.[segmentIndex] || 0,
            endTime: indexData.segmentEndTimes?.[segmentIndex] || 0,
            duration: indexData.segmentDurations?.[segmentIndex] || 0,
            filePath,
            fileSize: stat.size,
            createdAt: stat.birthtime.getTime(),
          });
        }
        
        return segments.sort((a, b) => a.segmentIndex - b.segmentIndex);
      }
    } catch (e) {
      console.error('Failed to load segments from disk:', e);
    }
  }

  return [];
}

export function getSegmentByTime(recordingId: string, timestamp: number): { segment: RecordingSegment | null; offset: number } {
  const segments = getRecordingSegments(recordingId);

  for (const segment of segments) {
    if (timestamp >= segment.startTime && timestamp <= segment.endTime) {
      const offset = timestamp - segment.startTime;
      return { segment, offset };
    }
  }

  const active = activeRecordings.get(recordingId);
  if (active?.currentSegment && timestamp >= active.currentSegment.startTime) {
    const offset = timestamp - active.currentSegment.startTime;
    return { segment: active.currentSegment, offset };
  }

  if (segments.length > 0) {
    const lastSegment = segments[segments.length - 1];
    if (timestamp > lastSegment.endTime) {
      return { segment: lastSegment, offset: lastSegment.duration };
    }
  }

  return { segment: null, offset: 0 };
}

export function getLatestSegment(recordingId: string): RecordingSegment | null {
  const active = activeRecordings.get(recordingId);
  if (active?.currentSegment) {
    return active.currentSegment;
  }

  const segments = getRecordingSegments(recordingId);
  return segments.length > 0 ? segments[segments.length - 1] : null;
}

export function getRecordingIndex(recordingId: string): RecordingIndex | null {
  const active = activeRecordings.get(recordingId);
  if (active) {
    return JSON.parse(JSON.stringify(active.index));
  }

  const indexPath = getIndexPath(recordingId);
  if (fs.existsSync(indexPath)) {
    try {
      return JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    } catch (e) {
      console.error('Failed to load index:', e);
    }
  }

  return null;
}

export function findNearestIndexEntry(recordingId: string, timestamp: number): IndexEntry | null {
  const index = getRecordingIndex(recordingId);
  if (!index) return null;

  let nearestEntry: IndexEntry | null = null;
  let minDiff = Infinity;

  for (const segmentId in index.segmentIndexes) {
    const entries = index.segmentIndexes[segmentId];
    for (const entry of entries) {
      const diff = Math.abs(entry.timestamp - timestamp);
      if (diff < minDiff) {
        minDiff = diff;
        nearestEntry = entry;
      }
    }
  }

  return nearestEntry;
}

function getIndexPath(recordingId: string): string {
  return path.join(RECORDINGS_DIR, `${recordingId}.index.json`);
}

function saveIndex(active: ActiveRecording) {
  const indexPath = getIndexPath(active.recordingId);
  
  const dataToSave = {
    ...active.index,
    segmentStartTimes: Object.fromEntries(
      active.segments.map(s => [s.segmentIndex, s.startTime])
    ),
    segmentEndTimes: Object.fromEntries(
      active.segments.map(s => [s.segmentIndex, s.endTime])
    ),
    segmentDurations: Object.fromEntries(
      active.segments.map(s => [s.segmentIndex, s.duration])
    ),
    segmentFiles: Object.fromEntries(
      active.segments.map(s => [s.segmentIndex, s.filePath])
    ),
  };

  fs.writeFileSync(indexPath, JSON.stringify(dataToSave, null, 2));
}

function simulateFileSize(durationMs: number): number {
  const bitrate = 2 * 1024 * 1024;
  return Math.floor((bitrate * durationMs) / 8000);
}

function simulateFrameSize(): number {
  return Math.floor(Math.random() * 50000) + 10000;
}

export function getActiveRecording(recordingId: string): ActiveRecording | undefined {
  return activeRecordings.get(recordingId);
}

export function getAllActiveRecordings(): string[] {
  return Array.from(activeRecordings.keys());
}

export { SEGMENT_DURATION };
