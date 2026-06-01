import { create } from 'zustand';
import type { Camera, Recording, Event, RecordingStatus, RecordingSegment } from '../../shared/types.js';

const mockCameras: Camera[] = [
  {
    id: 'cam-001',
    name: '前门摄像头',
    type: 'simulated',
    status: 'online',
    createdAt: Date.now() - 86400000,
  },
  {
    id: 'cam-002',
    name: '后院摄像头',
    type: 'simulated',
    status: 'online',
    createdAt: Date.now() - 86300000,
  },
  {
    id: 'cam-003',
    name: '停车场摄像头',
    type: 'simulated',
    status: 'online',
    createdAt: Date.now() - 86200000,
  },
];

const now = Date.now();
const mockRecordings: Recording[] = [
  {
    id: 'rec-001',
    cameraId: 'cam-001',
    startTime: now - 7200000,
    endTime: now - 5400000,
    duration: 1800000,
    filePath: '/recordings/rec-001.mp4',
    fileSize: 256000000,
    createdAt: now - 7200000,
  },
  {
    id: 'rec-002',
    cameraId: 'cam-001',
    startTime: now - 3600000,
    endTime: now - 1800000,
    duration: 1800000,
    filePath: '/recordings/rec-002.mp4',
    fileSize: 256000000,
    createdAt: now - 3600000,
  },
];

const mockEvents: Event[] = [
  {
    id: 'evt-001',
    recordingId: 'rec-001',
    timestamp: now - 6500000,
    type: 'motion',
    title: '检测到移动',
    description: '前门区域检测到人员移动',
    createdAt: now - 6500000,
  },
  {
    id: 'evt-002',
    recordingId: 'rec-001',
    timestamp: now - 6000000,
    type: 'alert',
    title: '异常告警',
    description: '检测到可疑人员徘徊',
    createdAt: now - 6000000,
  },
  {
    id: 'evt-003',
    recordingId: 'rec-002',
    timestamp: now - 3000000,
    type: 'custom',
    title: '快递送达',
    description: '快递员放置包裹',
    createdAt: now - 3000000,
  },
];

interface CameraState {
  cameras: Camera[];
  selectedCamera: Camera | null;
  recordings: Recording[];
  events: Event[];
  recordingStatus: RecordingStatus;
  currentRecording: Recording | null;
  currentTime: number;
  isPlaying: boolean;
  zoomLevel: number;
  segments: RecordingSegment[];
  latestSegment: RecordingSegment | null;
  isLiveMode: boolean;
  setCameras: (cameras: Camera[]) => void;
  setSelectedCamera: (camera: Camera | null) => void;
  setRecordings: (recordings: Recording[]) => void;
  setEvents: (events: Event[]) => void;
  setRecordingStatus: (status: RecordingStatus) => void;
  setCurrentRecording: (recording: Recording | null) => void;
  setCurrentTime: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setZoomLevel: (level: number) => void;
  setSegments: (segments: RecordingSegment[]) => void;
  setLatestSegment: (segment: RecordingSegment | null) => void;
  setIsLiveMode: (live: boolean) => void;
}

export const useCameraStore = create<CameraState>((set) => ({
  cameras: mockCameras,
  selectedCamera: mockCameras[0],
  recordings: mockRecordings,
  events: mockEvents,
  recordingStatus: {
    isRecording: false,
    cameraId: null,
    startTime: null,
    currentSegmentIndex: 0,
  },
  currentRecording: mockRecordings[0],
  currentTime: mockRecordings[0].startTime,
  isPlaying: false,
  zoomLevel: 1,
  segments: [],
  latestSegment: null,
  isLiveMode: false,
  setCameras: (cameras) => set({ cameras }),
  setSelectedCamera: (camera) => set({ selectedCamera: camera }),
  setRecordings: (recordings) => set({ recordings }),
  setEvents: (events) => set({ events }),
  setRecordingStatus: (status) => set({ recordingStatus: status }),
  setCurrentRecording: (recording) => set({ currentRecording: recording }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setZoomLevel: (level) => set({ zoomLevel: level }),
  setSegments: (segments) => set({ segments }),
  setLatestSegment: (segment) => set({ latestSegment: segment }),
  setIsLiveMode: (live) => set({ isLiveMode: live }),
}));
