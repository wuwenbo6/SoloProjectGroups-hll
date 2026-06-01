const API_BASE = '/api';

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  return response.json();
}

export const api = {
  getCameras: () => fetchApi('/cameras'),
  getCamera: (id: string) => fetchApi(`/cameras/${id}`),
  getCameraStream: (id: string) => fetchApi(`/cameras/${id}/stream`),
  getActiveRecording: (cameraId: string) => fetchApi(`/cameras/${cameraId}/active-recording`),
  
  startRecording: (cameraId: string) => 
    fetchApi('/record/start', {
      method: 'POST',
      body: JSON.stringify({ cameraId }),
    }),
  
  stopRecording: () => 
    fetchApi('/record/stop', { method: 'POST' }),
  
  getRecordingStatus: () => fetchApi('/record/status'),
  
  getRecordings: (cameraId?: string) => 
    fetchApi(`/recordings${cameraId ? `?cameraId=${cameraId}` : ''}`),
  
  getRecording: (id: string) => fetchApi(`/recordings/${id}`),
  
  getRecordingVideoUrl: (id: string, timestamp?: number) => 
    `${API_BASE}/recordings/${id}/video${timestamp ? `?timestamp=${timestamp}` : ''}`,
  
  getSegmentInfo: () => fetchApi('/recordings/segment-info'),
  
  getRecordingSegments: (recordingId: string) => 
    fetchApi(`/recordings/${recordingId}/segments`),
  
  getLatestSegment: (recordingId: string) => 
    fetchApi(`/recordings/${recordingId}/segments/latest`),
  
  getLatestSegmentVideoUrl: (recordingId: string) => 
    `${API_BASE}/recordings/${recordingId}/segments/latest/video`,
  
  getSegmentByTime: (recordingId: string, timestamp: number) => 
    fetchApi(`/recordings/${recordingId}/segments/at/${timestamp}`),
  
  getSegmentVideoAtTime: (recordingId: string, timestamp: number) => 
    `${API_BASE}/recordings/${recordingId}/segments/stream/${timestamp}`,
  
  getRecordingIndex: (recordingId: string) => 
    fetchApi(`/recordings/${recordingId}/index`),
  
  getNearestIndexEntry: (recordingId: string, timestamp: number) => 
    fetchApi(`/recordings/${recordingId}/index/nearest/${timestamp}`),
  
  createEvent: (data: {
    recordingId: string;
    timestamp: number;
    type: 'motion' | 'alert' | 'custom';
    title: string;
    description?: string;
  }) => 
    fetchApi('/events', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  getEvents: (recordingId?: string, type?: string) => 
    fetchApi(`/events${recordingId || type ? '?' : ''}${recordingId ? `recordingId=${recordingId}` : ''}${recordingId && type ? '&' : ''}${type ? `type=${type}` : ''}`),
  
  updateEvent: (id: string, data: any) => 
    fetchApi(`/events/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  
  deleteEvent: (id: string) => 
    fetchApi(`/events/${id}`, { method: 'DELETE' }),

  getMotionConfig: () => fetchApi('/motion/config'),
  
  updateMotionConfig: (data: any) => 
    fetchApi('/motion/config', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  
  getMotionStatus: () => fetchApi('/motion/status'),
  
  getMotionEvents: (recordingId?: string) => 
    fetchApi(`/motion/events${recordingId ? `?recordingId=${recordingId}` : ''}`),
  
  toggleRegion: (regionId: string, enabled: boolean) =>
    fetchApi(`/motion/regions/${regionId}`, {
      method: 'PUT',
      body: JSON.stringify({ enabled }),
    }),
  
  addRegion: (data: any) =>
    fetchApi('/motion/regions', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  removeRegion: (regionId: string) =>
    fetchApi(`/motion/regions/${regionId}`, { method: 'DELETE' }),
  
  smartSearch: (params: {
    recordingId?: string;
    eventType?: string;
    startTime?: number;
    endTime?: number;
    minIntensity?: number;
    regionId?: string;
    query?: string;
  }) => {
    const queryParts: string[] = [];
    if (params.recordingId) queryParts.push(`recordingId=${params.recordingId}`);
    if (params.eventType) queryParts.push(`eventType=${params.eventType}`);
    if (params.startTime) queryParts.push(`startTime=${params.startTime}`);
    if (params.endTime) queryParts.push(`endTime=${params.endTime}`);
    if (params.minIntensity) queryParts.push(`minIntensity=${params.minIntensity}`);
    if (params.regionId) queryParts.push(`regionId=${params.regionId}`);
    if (params.query) queryParts.push(`query=${encodeURIComponent(params.query)}`);
    return fetchApi(`/motion/search${queryParts.length ? '?' + queryParts.join('&') : ''}`);
  },

  createExport: (recordingId: string, options: any) =>
    fetchApi(`/exports/${recordingId}`, {
      method: 'POST',
      body: JSON.stringify(options),
    }),
  
  getExportTask: (taskId: string) => fetchApi(`/exports/task/${taskId}`),
  
  getAllExports: (recordingId?: string) =>
    fetchApi(`/exports${recordingId ? `?recordingId=${recordingId}` : ''}`),
  
  getExportDownloadUrl: (taskId: string) => `${API_BASE}/exports/download/${taskId}`,
  
  deleteExport: (taskId: string) =>
    fetchApi(`/exports/${taskId}`, { method: 'DELETE' }),
};
