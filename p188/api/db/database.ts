import { v4 as uuidv4 } from 'uuid';
import type { Camera, Recording, Event } from '../../shared/types.js';

interface DatabaseData {
  cameras: Camera[];
  recordings: Recording[];
  events: Event[];
}

let data: DatabaseData = {
  cameras: [],
  recordings: [],
  events: [],
};

function initMockData() {
  const now = Date.now();

  data.cameras = [
    {
      id: 'cam-001',
      name: '前门摄像头',
      type: 'simulated',
      status: 'online',
      createdAt: now - 86400000,
    },
    {
      id: 'cam-002',
      name: '后院摄像头',
      type: 'simulated',
      status: 'online',
      createdAt: now - 86300000,
    },
    {
      id: 'cam-003',
      name: '停车场摄像头',
      type: 'simulated',
      status: 'online',
      createdAt: now - 86200000,
    },
  ];

  data.recordings = [
    {
      id: 'rec-001',
      cameraId: 'cam-001',
      startTime: now - 7200000,
      endTime: now - 5400000,
      duration: 1800000,
      filePath: '/recordings/rec-001.mp4',
      fileSize: 256000000,
      createdAt: now - 7200000,
      segmentDuration: 600000,
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
      segmentDuration: 600000,
    },
  ];

  data.events = [
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
}

export function initDatabase() {
  initMockData();
  console.log('Database initialized with mock data');
}

export function getDatabase() {
  return {
    cameras: {
      getAll: () => [...data.cameras],
      getById: (id: string) => data.cameras.find(c => c.id === id),
      update: (id: string, updates: Partial<Camera>) => {
        const index = data.cameras.findIndex(c => c.id === id);
        if (index !== -1) {
          data.cameras[index] = { ...data.cameras[index], ...updates };
          return data.cameras[index];
        }
        return null;
      },
    },
    recordings: {
      getAll: (cameraId?: string) => {
        if (cameraId) {
          return data.recordings.filter(r => r.cameraId === cameraId);
        }
        return [...data.recordings];
      },
      getById: (id: string) => data.recordings.find(r => r.id === id),
      create: (recording: Omit<Recording, 'id' | 'createdAt'>) => {
        const newRecording: Recording = {
          ...recording,
          id: `rec-${Date.now()}`,
          createdAt: Date.now(),
        };
        data.recordings.push(newRecording);
        return newRecording;
      },
      update: (id: string, updates: Partial<Recording>) => {
        const index = data.recordings.findIndex(r => r.id === id);
        if (index !== -1) {
          data.recordings[index] = { ...data.recordings[index], ...updates };
          return data.recordings[index];
        }
        return null;
      },
    },
    events: {
      getAll: (recordingId?: string, type?: Event['type']) => {
        let result = data.events;
        if (recordingId) {
          result = result.filter(e => e.recordingId === recordingId);
        }
        if (type) {
          result = result.filter(e => e.type === type);
        }
        return result;
      },
      getById: (id: string) => data.events.find(e => e.id === id),
      create: (event: Omit<Event, 'id' | 'createdAt'>) => {
        const newEvent: Event = {
          ...event,
          id: `evt-${uuidv4()}`,
          createdAt: Date.now(),
        };
        data.events.push(newEvent);
        return newEvent;
      },
      update: (id: string, updates: Partial<Event>) => {
        const index = data.events.findIndex(e => e.id === id);
        if (index !== -1) {
          data.events[index] = { ...data.events[index], ...updates };
          return data.events[index];
        }
        return null;
      },
      delete: (id: string) => {
        const index = data.events.findIndex(e => e.id === id);
        if (index !== -1) {
          data.events.splice(index, 1);
          return true;
        }
        return false;
      },
    },
  };
}

export { data };
