import axios from 'axios';
import { Template, Detection, DetectionResponse, AlignedWaveforms } from '../types';

const API_BASE = '/api';

const api = axios.create({
  baseURL: API_BASE,
});

export const templateApi = {
  upload: async (name: string, file: File): Promise<Template> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post(`/templates/upload?name=${encodeURIComponent(name)}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  getAll: async (skip = 0, limit = 100): Promise<Template[]> => {
    const response = await api.get(`/templates?skip=${skip}&limit=${limit}`);
    return response.data;
  },

  get: async (id: number): Promise<Template> => {
    const response = await api.get(`/templates/${id}`);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/templates/${id}`);
  },
};

export interface DetectOptions {
  templateId: number;
  threshold: number;
  useAdaptiveThreshold: boolean;
  adaptiveSigma: number;
  minStations: number;
  clusterTimeWindow: number;
  file: File;
}

export const detectionApi = {
  detect: async (options: DetectOptions): Promise<DetectionResponse> => {
    const formData = new FormData();
    formData.append('file', options.file);
    const response = await api.post(
      `/detect?template_id=${options.templateId}&threshold=${options.threshold}&use_adaptive_threshold=${options.useAdaptiveThreshold}&adaptive_sigma=${options.adaptiveSigma}&min_stations=${options.minStations}&cluster_time_window=${options.clusterTimeWindow}`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      }
    );
    return response.data;
  },

  getAll: async (templateId?: number, station?: string, skip = 0, limit = 100): Promise<Detection[]> => {
    let url = `/detections?skip=${skip}&limit=${limit}`;
    if (templateId) url += `&template_id=${templateId}`;
    if (station) url += `&station=${station}`;
    const response = await api.get(url);
    return response.data;
  },

  get: async (id: number): Promise<Detection> => {
    const response = await api.get(`/detections/${id}`);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/detections/${id}`);
  },
};

export const waveformApi = {
  getAligned: async (
    templateId: number,
    detectionIds: number[],
    file?: File
  ): Promise<AlignedWaveforms> => {
    const formData = new FormData();
    if (file) {
      formData.append('file', file);
    }
    const idsParam = detectionIds.map((id) => `detection_ids=${id}`).join('&');
    const response = await api.post(
      `/waveforms/aligned?template_id=${templateId}&${idsParam}`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      }
    );
    return response.data;
  },
};

export interface LocationResult {
  latitude: number;
  longitude: number;
  depth: number;
  origin_time: number;
  latitude_uncertainty: number;
  longitude_uncertainty: number;
  depth_uncertainty: number;
}

export const locationApi = {
  locateSingle: async (
    stationCoords: Record<string, [number, number, number]>,
    arrivalTimes: Record<string, number>
  ): Promise<LocationResult | null> => {
    const response = await api.post('/location/single', {
      station_coords: stationCoords,
      arrival_times: arrivalTimes,
    });
    return response.data;
  },

  relocateEvents: async (
    stationCoords: Record<string, [number, number, number]>,
    events: any[]
  ): Promise<(LocationResult | null)[]> => {
    const response = await api.post('/location/relocate', {
      station_coords: stationCoords,
      events,
    });
    return response.data;
  },
};

export interface StreamingStatus {
  is_running: boolean;
  total_data_samples: number;
  windows_processed: number;
  detections_count: number;
  buffer_sizes: Record<string, number>;
}

export const streamingApi = {
  start: async (
    templateId: number,
    windowSize: number = 60,
    overlap: number = 30,
    useAdaptiveThreshold: boolean = true,
    threshold: number = 0.75
  ): Promise<any> => {
    const response = await api.post(
      `/streaming/start?template_id=${templateId}&window_size=${windowSize}&overlap=${overlap}&use_adaptive_threshold=${useAdaptiveThreshold}&threshold=${threshold}`
    );
    return response.data;
  },

  feedData: async (file: File): Promise<any> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/streaming/feed', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  getStatus: async (): Promise<StreamingStatus> => {
    const response = await api.get('/streaming/status');
    return response.data;
  },

  stop: async (): Promise<any> => {
    const response = await api.post('/streaming/stop');
    return response.data;
  },
};

export const reportApi = {
  exportCsv: (templateId?: number, station?: string) => {
    let url = '/reports/csv?';
    if (templateId) url += `template_id=${templateId}&`;
    if (station) url += `station=${station}&`;
    window.open(url, '_blank');
  },

  exportPdf: (templateId?: number, station?: string) => {
    let url = '/reports/pdf?';
    if (templateId) url += `template_id=${templateId}&`;
    if (station) url += `station=${station}&`;
    window.open(url, '_blank');
  },

  getSummary: async (templateId?: number, station?: string): Promise<{ summary: string; detections_count: number }> => {
    let url = '/reports/summary?';
    if (templateId) url += `template_id=${templateId}&`;
    if (station) url += `station=${station}&`;
    const response = await api.get(url);
    return response.data;
  },
};

export default api;
