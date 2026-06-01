export interface Camera {
  id: string;
  name: string;
  type: 'onvif' | 'simulated';
  status: 'online' | 'offline' | 'recording';
  rtspUrl?: string;
  createdAt: number;
}

export interface Recording {
  id: string;
  cameraId: string;
  startTime: number;
  endTime: number;
  duration: number;
  filePath: string;
  fileSize: number;
  createdAt: number;
  segmentDuration: number;
}

export interface RecordingSegment {
  id: string;
  recordingId: string;
  segmentIndex: number;
  startTime: number;
  endTime: number;
  duration: number;
  filePath: string;
  fileSize: number;
  createdAt: number;
}

export interface IndexEntry {
  timestamp: number;
  byteOffset: number;
  segmentIndex: number;
}

export interface RecordingIndex {
  recordingId: string;
  segmentIndexes: {
    [segmentId: string]: IndexEntry[];
  };
  updatedAt: number;
}

export interface Event {
  id: string;
  recordingId: string;
  timestamp: number;
  type: 'motion' | 'alert' | 'custom';
  title: string;
  description?: string;
  createdAt: number;
}

export interface TimelineData {
  recordings: Recording[];
  events: Event[];
  dateRange: { start: number; end: number };
}

export interface RecordingStatus {
  isRecording: boolean;
  cameraId: string | null;
  startTime: number | null;
  currentSegmentIndex: number;
}

export interface MotionDetectionConfig {
  enabled: boolean;
  sensitivity: number;
  minDuration: number;
  cooldown: number;
  regions: MotionRegion[];
}

export interface MotionRegion {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  enabled: boolean;
}

export interface MotionEvent {
  id: string;
  recordingId: string;
  timestamp: number;
  regionId: string;
  regionName: string;
  intensity: number;
  duration: number;
  confidence: number;
}

export interface MotionDetectionStatus {
  enabled: boolean;
  sensitivity: number;
  eventCount: number;
  lastEventTime: number | null;
  regions: MotionRegion[];
}

export interface SmartSearchResult {
  events: Event[];
  totalMatches: number;
  timeRanges: TimeRange[];
}

export interface TimeRange {
  start: number;
  end: number;
  eventCount: number;
  label: string;
}

export interface ExportTask {
  id: string;
  recordingId: string;
  format: 'avi' | 'mp4';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  startTime: number;
  endTime?: number;
  outputFile?: string;
  fileSize?: number;
  error?: string;
}

export interface ExportOptions {
  format: 'avi' | 'mp4';
  startTime?: number;
  endTime?: number;
  includeAudio: boolean;
  quality: 'high' | 'medium' | 'low';
}
