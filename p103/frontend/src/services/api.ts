import {
  TargetConfig,
  MutationStrategy,
  TestTask,
  PacketRecord,
  CrashRecord,
  TestCase,
  DashboardStats,
  ConnectionTestResult,
  TaskStatus
} from '../types';

const API_BASE = '/api';

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
}

export const targetsApi = {
  getAll: () => request<TargetConfig[]>('/targets'),
  get: (id: number) => request<TargetConfig>(`/targets/${id}`),
  create: (data: Omit<TargetConfig, 'id' | 'createdAt'>) =>
    request<TargetConfig>('/targets', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: number, data: Omit<TargetConfig, 'id' | 'createdAt'>) =>
    request<TargetConfig>(`/targets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: number) => request(`/targets/${id}`, { method: 'DELETE' }),
  testConnection: (id: number) =>
    request<ConnectionTestResult>(`/targets/${id}/test`, { method: 'POST' }),
};

export const strategiesApi = {
  getAll: () => request<MutationStrategy[]>('/strategies'),
};

export const tasksApi = {
  getAll: () => request<TestTask[]>('/tasks'),
  get: (id: number) => request<TestTask>(`/tasks/${id}`),
  create: (data: { name: string; targetId: number; strategies: string[] }) =>
    request<TestTask>('/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: number, data: Partial<TestTask>) =>
    request<TestTask>(`/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: number) => request(`/tasks/${id}`, { method: 'DELETE' }),
  start: (id: number) => request(`/tasks/${id}/start`, { method: 'POST' }),
  pause: (id: number) => request(`/tasks/${id}/pause`, { method: 'POST' }),
  resume: (id: number) => request(`/tasks/${id}/resume`, { method: 'POST' }),
  stop: (id: number) => request(`/tasks/${id}/stop`, { method: 'POST' }),
  getStatus: (id: number) => request<TaskStatus>(`/tasks/${id}/status`),
  getPackets: (id: number, limit?: number) =>
    request<PacketRecord[]>(`/tasks/${id}/packets${limit ? `?limit=${limit}` : ''}`),
  getCrashes: (id: number) => request<CrashRecord[]>(`/tasks/${id}/crashes`),
};

export const casesApi = {
  getAll: () => request<TestCase[]>('/cases'),
  get: (id: number) => request<TestCase>(`/cases/${id}`),
  create: (data: Omit<TestCase, 'id' | 'createdAt' | 'updatedAt'>) =>
    request<TestCase>('/cases', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: number, data: Omit<TestCase, 'id' | 'createdAt' | 'updatedAt'>) =>
    request<TestCase>(`/cases/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: number) => request(`/cases/${id}`, { method: 'DELETE' }),
};

export const statsApi = {
  getDashboard: () => request<DashboardStats>('/stats/dashboard'),
};

export const reportsApi = {
  generate: (taskId: number, format: string = 'html') =>
    request(`/reports/${taskId}?format=${format}`, { method: 'POST' }),
  preview: (taskId: number) => request(`/reports/${taskId}/preview`),
  download: (taskId: number, format: string = 'html') => {
    window.open(`${API_BASE}/reports/${taskId}/download?format=${format}`, '_blank');
  },
  list: () => request<{ reports: any[] }>('/reports'),
};

export const stateMachineApi = {
  getStatus: (taskId: number) => request(`/statemachine/${taskId}/status`),
  getTransitions: (taskId: number, count?: number) =>
    request(`/statemachine/${taskId}/transitions${count ? `?count=${count}` : ''}`),
  getRecommendedStrategies: (taskId: number) =>
    request<{ available: string[]; recommended: string[] }>(`/statemachine/${taskId}/recommended_strategies`),
  reset: (taskId: number) => request(`/statemachine/${taskId}/reset`, { method: 'POST' }),
  getAllStates: () => request<{ states: any[] }>('/statemachine/states'),
};

export const dnp3Api = {
  getStrategies: () => request<{ strategies: MutationStrategy[]; protocol: string }>('/dnp3/strategies'),
  generatePacket: (strategyId?: string) =>
    request('/dnp3/test/generate', {
      method: 'POST',
      body: strategyId ? JSON.stringify({ strategy_id: strategyId }) : undefined,
    }),
  checkHealth: (ipAddress: string, port?: number, timeout?: number) =>
    request(`/dnp3/health/check?ip_address=${ipAddress}&port=${port || 20000}&timeout=${timeout || 5000}`),
  getFunctionCodes: () => request<{ function_codes: any[] }>('/dnp3/function_codes'),
  getObjectTypes: () => request<{ object_types: any[] }>('/dnp3/object_types'),
  getSamplePackets: () => request<{ samples: any[] }>('/dnp3/packets/samples'),
};
