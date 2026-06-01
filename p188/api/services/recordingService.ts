import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getDatabase } from '../db/database.js';
import {
  startSegmentRecording,
  stopSegmentRecording,
  shouldRotateSegment,
  rotateSegment,
  addIndexEntry,
  getRecordingSegments,
  getLatestSegment,
  getSegmentByTime,
  getRecordingIndex,
  findNearestIndexEntry,
  getActiveRecording,
  getAllActiveRecordings,
  SEGMENT_DURATION,
  ensureDirs,
} from './segmentService.js';
import {
  startMotionDetection,
  stopMotionDetection,
} from './motionDetectionService.js';
import type { Recording, RecordingStatus, RecordingSegment, RecordingIndex, IndexEntry } from '../../shared/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RECORDINGS_DIR = path.join(__dirname, '../../recordings');

let recordingStatus: RecordingStatus = {
  isRecording: false,
  cameraId: null,
  startTime: null,
  currentSegmentIndex: 0,
};

let recordingInterval: NodeJS.Timeout | null = null;
let indexInterval: NodeJS.Timeout | null = null;
let segmentCheckInterval: NodeJS.Timeout | null = null;

export function startRecording(cameraId: string): Recording {
  const db = getDatabase();
  ensureDirs();

  if (recordingStatus.isRecording) {
    throw new Error('Recording already in progress');
  }

  const startTime = Date.now();
  const recordingId = `rec-${startTime}`;
  const filePath = path.join(RECORDINGS_DIR, `${recordingId}.mp4`);

  const recording = db.recordings.create({
    cameraId,
    startTime,
    endTime: 0,
    duration: 0,
    filePath,
    fileSize: 0,
    segmentDuration: SEGMENT_DURATION,
  });

  startSegmentRecording(recordingId, cameraId);

  startMotionDetection(recordingId);

  recordingStatus = {
    isRecording: true,
    cameraId,
    startTime,
    currentSegmentIndex: 0,
  };

  db.cameras.update(cameraId, { status: 'recording' });

  recordingInterval = setInterval(() => {
  }, 1000);

  indexInterval = setInterval(() => {
    if (recordingStatus.isRecording) {
      addIndexEntry(recordingId, Date.now());
    }
  }, 1000);

  segmentCheckInterval = setInterval(() => {
    if (recordingStatus.isRecording && shouldRotateSegment(recordingId)) {
      const newSegment = rotateSegment(recordingId);
      recordingStatus.currentSegmentIndex = newSegment.segmentIndex;
      console.log(`[Recording] Rotated to segment ${newSegment.segmentIndex} for recording ${recordingId}`);
    }
  }, 1000);

  return recording;
}

export function stopRecording(): Recording | null {
  const db = getDatabase();

  if (!recordingStatus.isRecording || !recordingStatus.cameraId) {
    return null;
  }

  if (recordingInterval) {
    clearInterval(recordingInterval);
    recordingInterval = null;
  }
  if (indexInterval) {
    clearInterval(indexInterval);
    indexInterval = null;
  }
  if (segmentCheckInterval) {
    clearInterval(segmentCheckInterval);
    segmentCheckInterval = null;
  }

  stopMotionDetection();

  const endTime = Date.now();
  const duration = endTime - (recordingStatus.startTime || endTime);

  const recordings = db.recordings.getAll(recordingStatus.cameraId);
  const recording = recordings.find(r => r.endTime === 0);

  if (!recording) {
    recordingStatus = {
      isRecording: false,
      cameraId: null,
      startTime: null,
      currentSegmentIndex: 0,
    };
    return null;
  }

  const segments = stopSegmentRecording(recording.id);
  const totalSize = segments.reduce((sum, seg) => sum + seg.fileSize, 0);

  const updatedRecording = db.recordings.update(recording.id, {
    endTime,
    duration,
    fileSize: totalSize,
  });

  db.cameras.update(recordingStatus.cameraId, { status: 'online' });

  recordingStatus = {
    isRecording: false,
    cameraId: null,
    startTime: null,
    currentSegmentIndex: 0,
  };

  console.log(`[Recording] Stopped recording ${recording.id}, ${segments.length} segments, total size: ${totalSize} bytes`);

  return updatedRecording;
}

export function getRecordingStatus(): RecordingStatus {
  return { ...recordingStatus };
}

export function getRecordings(cameraId?: string): Recording[] {
  const db = getDatabase();
  return db.recordings.getAll(cameraId).sort((a, b) => b.startTime - a.startTime);
}

export function getRecordingById(id: string): Recording | null {
  const db = getDatabase();
  return db.recordings.getById(id) || null;
}

export function getRecordingFilePath(recordingId: string): string | null {
  const db = getDatabase();
  const recording = db.recordings.getById(recordingId);
  return recording?.filePath || null;
}

export function getSegments(recordingId: string): RecordingSegment[] {
  return getRecordingSegments(recordingId);
}

export function getLatest(recordingId: string): RecordingSegment | null {
  return getLatestSegment(recordingId);
}

export function getSegmentForTime(recordingId: string, timestamp: number): { segment: RecordingSegment | null; offset: number } {
  return getSegmentByTime(recordingId, timestamp);
}

export function getIndex(recordingId: string): RecordingIndex | null {
  return getRecordingIndex(recordingId);
}

export function getNearestIndexEntry(recordingId: string, timestamp: number): IndexEntry | null {
  return findNearestIndexEntry(recordingId, timestamp);
}

export function getCurrentActiveRecordingId(cameraId: string): string | null {
  const activeIds = getAllActiveRecordings();
  for (const id of activeIds) {
    const active = getActiveRecording(id);
    if (active?.cameraId === cameraId) {
      return id;
    }
  }
  return null;
}

export function streamSegmentVideo(segmentId: string, req: any, res: any) {
  const segments = getAllActiveRecordings().flatMap(rid => getRecordingSegments(rid));
  const segment = segments.find(s => s.id === segmentId);

  if (!segment) {
    res.status(404).json({ error: 'Segment not found' });
    return;
  }

  const sampleVideoUrl = 'https://www.w3schools.com/html/mov_bbb.mp4';
  res.redirect(sampleVideoUrl);
}

export function streamLatestSegment(recordingId: string, req: any, res: any) {
  const latestSegment = getLatestSegment(recordingId);

  if (!latestSegment) {
    res.status(404).json({ error: 'No segments found' });
    return;
  }

  const sampleVideoUrl = 'https://www.w3schools.com/html/mov_bbb.mp4';
  res.redirect(sampleVideoUrl);
}

export function streamRecordingAtTime(recordingId: string, timestamp: number, req: any, res: any) {
  const { segment } = getSegmentByTime(recordingId, timestamp);

  if (!segment) {
    res.status(404).json({ error: 'No segment found for this time' });
    return;
  }

  const sampleVideoUrl = 'https://www.w3schools.com/html/mov_bbb.mp4';
  res.redirect(sampleVideoUrl);
}

export { SEGMENT_DURATION };
