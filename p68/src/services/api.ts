import { Region, RoadFeatureCollection, YearStats, TaskStatus } from '@/types';
import { mockApi } from './mockData';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

export const api = {
  async getRegions(): Promise<Region[]> {
    if (USE_MOCK) return mockApi.getRegions();
    try {
      const response = await fetch(`${API_BASE_URL}/api/regions`);
      if (!response.ok) throw new Error('Failed to fetch regions');
      return response.json();
    } catch {
      return mockApi.getRegions();
    }
  },

  async getRoads(regionId: string, year: number): Promise<RoadFeatureCollection> {
    if (USE_MOCK) return mockApi.getRoads(regionId, year);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/roads?regionId=${regionId}&year=${year}`
      );
      if (!response.ok) throw new Error('Failed to fetch roads');
      return response.json();
    } catch {
      return mockApi.getRoads(regionId, year);
    }
  },

  async getStats(regionId: string): Promise<YearStats[]> {
    if (USE_MOCK) return mockApi.getStats(regionId);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/stats?regionId=${regionId}`
      );
      if (!response.ok) throw new Error('Failed to fetch stats');
      return response.json();
    } catch {
      return mockApi.getStats(regionId);
    }
  },

  async uploadPBF(file: File, regionId: string): Promise<TaskStatus> {
    if (USE_MOCK) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return {
        taskId: Math.random().toString(36).substr(2, 9),
        status: 'processing',
        progress: 0,
        message: '正在解析...',
      };
    }
    const formData = new FormData();
    formData.append('file', file);
    formData.append('regionId', regionId);
    const response = await fetch(`${API_BASE_URL}/api/upload-pbf`, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) throw new Error('Failed to upload PBF');
    return response.json();
  },

  async getTaskStatus(taskId: string): Promise<TaskStatus> {
    const response = await fetch(`${API_BASE_URL}/api/tasks/${taskId}`);
    if (!response.ok) throw new Error('Failed to fetch task status');
    return response.json();
  },

  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    const response = await fetch(`${API_BASE_URL}/api/health`);
    if (!response.ok) throw new Error('Health check failed');
    return response.json();
  },
};
