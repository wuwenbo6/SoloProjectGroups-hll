import { SensorData, ProgramFile, DownloadStatus, PlcStatus } from '../types';

const API_BASE = 'http://localhost:3001/api';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, options);
  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error || 'Request failed');
  }
  return result.data;
}

export const api = {
  async getRealtimeData(): Promise<SensorData> {
    return fetchJson<SensorData>('/data/realtime');
  },

  async getHistoryData(startTime?: string, endTime?: string, limit?: number): Promise<SensorData[]> {
    const params = new URLSearchParams();
    if (startTime) params.set('startTime', startTime);
    if (endTime) params.set('endTime', endTime);
    if (limit) params.set('limit', limit.toString());

    const queryString = params.toString();
    return fetchJson<SensorData[]>(`/data/history${queryString ? `?${queryString}` : ''}`);
  },

  async getPlcStatus(): Promise<PlcStatus> {
    return fetchJson<PlcStatus>('/data/plc/status');
  },

  async getPrograms(): Promise<ProgramFile[]> {
    return fetchJson<ProgramFile[]>('/programs');
  },

  async uploadProgram(file: File, version: string): Promise<ProgramFile> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('version', version);

    const response = await fetch(`${API_BASE}/programs/upload`, {
      method: 'POST',
      body: formData,
    });
    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || 'Upload failed');
    }
    return result.data;
  },

  async startDownload(programId: number, force: boolean = false): Promise<{ downloadId: number; program: ProgramFile; status: string }> {
    const response = await fetch(`${API_BASE}/programs/${programId}/download`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ force }),
    });
    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || 'Download failed to start');
    }
    return result.data;
  },

  async getDownloadStatus(downloadId: number): Promise<DownloadStatus> {
    return fetchJson<DownloadStatus>(`/programs/${downloadId}/download/status`);
  },
};
