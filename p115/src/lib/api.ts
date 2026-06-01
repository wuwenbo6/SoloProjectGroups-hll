import type { MappingRule, OpcuaNode, ServerStatus, SystemConfig, ExcelParseResult, NodeHistory, HistoryQuery, SyncLog, SyncStatus } from '../../shared/types';

const API_BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<{ success: boolean; data?: T; error?: string; errors?: string[] }> {
  try {
    const response = await fetch(`${API_BASE}${url}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    });
    return await response.json();
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Network error',
    };
  }
}

export interface RegisterTypeInfo {
  code: string;
  name: string;
  readOnly: boolean;
  defaultDataType: string;
  description: string;
}

export interface DataTypeInfo {
  code: string;
  name: string;
  compatibleRegisters: string[];
}

export interface ConflictCheckResult {
  hasConflict: boolean;
  conflicts: string[];
}

export interface ImportResult {
  successCount: number;
  failedCount: number;
  totalCount: number;
  messages: string[];
}

export const mappingApi = {
  getRules: () => request<MappingRule[]>('/mapping'),
  getRule: (id: number) => request<MappingRule>(`/mapping/${id}`),
  getDevices: () => request<string[]>('/mapping/devices'),
  getStats: () => request<{ totalRules: number; deviceCount: number }>('/mapping/stats'),
  getRegisterTypes: () => request<RegisterTypeInfo[]>('/mapping/register-types'),
  getDataTypes: () => request<DataTypeInfo[]>('/mapping/data-types'),
  checkConflict: (data: { deviceName?: string; registerType?: string; registerAddress?: number; opcuaNodeId?: string; opcuaBrowseName?: string; excludeId?: number }) =>
    request<ConflictCheckResult>('/mapping/check-conflict', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  createRule: (rule: Omit<MappingRule, 'id' | 'createdAt' | 'updatedAt'>, autoResolve = false) =>
    request<{ id: number }>(`/mapping${autoResolve ? '?autoResolve=true' : ''}`, {
      method: 'POST',
      body: JSON.stringify(rule),
    }),
  updateRule: (id: number, rule: Partial<MappingRule>, autoResolve = false) =>
    request(`/mapping/${id}${autoResolve ? '?autoResolve=true' : ''}`, {
      method: 'PUT',
      body: JSON.stringify(rule),
    }),
  deleteRule: (id: number) =>
    request(`/mapping/${id}`, { method: 'DELETE' }),
  deleteAllRules: () => request<{ deletedCount: number }>('/mapping', { method: 'DELETE' }),
  uploadExcel: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return request<MappingRule[]>('/mapping/upload', {
      method: 'POST',
      body: formData,
      headers: {},
    });
  },
  importRules: (rules: MappingRule[], replace = false, autoResolveConflict = true) =>
    request<ImportResult>('/mapping/import', {
      method: 'POST',
      body: JSON.stringify({ rules, replace, autoResolveConflict }),
    }),
  downloadTemplate: () => `${API_BASE}/mapping/template/download`,
};

export const opcuaApi = {
  getStatus: () => request<ServerStatus>('/opcua/server/status'),
  startServer: () =>
    request<{ message: string }>('/opcua/server/start', { method: 'POST' }),
  stopServer: () =>
    request<{ message: string }>('/opcua/server/stop', { method: 'POST' }),
  restartServer: () =>
    request<{ message: string }>('/opcua/server/restart', { method: 'POST' }),
  getNodes: () => request<OpcuaNode>('/opcua/nodes'),
  getNode: (nodeId: string) =>
    request<OpcuaNode>(`/opcua/nodes/${encodeURIComponent(nodeId)}`),
  getNodeValue: (nodeId: string) =>
    request<{ nodeId: string; value: any; timestamp: string }>(`/opcua/nodes/${encodeURIComponent(nodeId)}/value`),
  setNodeValue: (nodeId: string, value: any) =>
    request<{ nodeId: string; value: any }>(`/opcua/nodes/${encodeURIComponent(nodeId)}/value`, {
      method: 'POST',
      body: JSON.stringify({ value }),
    }),
};

export const configApi = {
  getConfig: () => request<SystemConfig>('/config'),
  updateConfig: (config: Partial<SystemConfig>) =>
    request<{ message: string }>('/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    }),
  getValue: (key: string) => request<{ key: string; value: string }>(`/config/${key}`),
  setValue: (key: string, value: string) =>
    request<{ key: string; value: string }>(`/config/${key}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    }),
};

export const historyApi = {
  query: (query: HistoryQuery) => {
    const params = new URLSearchParams();
    if (query.nodeId) params.set('nodeId', query.nodeId);
    if (query.startTime) params.set('startTime', query.startTime);
    if (query.endTime) params.set('endTime', query.endTime);
    if (query.limit) params.set('limit', String(query.limit));
    return request<NodeHistory[]>(`/history?${params.toString()}`);
  },
  getStats: (nodeId?: string) =>
    request<{ totalRecords: number; firstRecord: string | null; lastRecord: string | null }>(
      `/history/stats${nodeId ? `?nodeId=${encodeURIComponent(nodeId)}` : ''}`
    ),
  getLatest: (nodeId: string) =>
    request<NodeHistory>(`/history/latest/${encodeURIComponent(nodeId)}`),
  cleanup: (days: number = 30) =>
    request<{ deletedCount: number }>(`/history/cleanup?days=${days}`, { method: 'DELETE' }),
  deleteByNodeId: (nodeId: string) =>
    request<{ deletedCount: number }>(`/history/${encodeURIComponent(nodeId)}`, { method: 'DELETE' }),
  deleteAll: () =>
    request<{ deletedCount: number }>('/history', { method: 'DELETE' }),
};

export const syncApi = {
  getStatus: () => request<SyncStatus>('/sync/status'),
  start: () =>
    request<{ message: string }>('/sync/start', { method: 'POST' }),
  stop: () =>
    request<{ message: string }>('/sync/stop', { method: 'POST' }),
  modbusToUa: () =>
    request<{ success: boolean; syncedCount: number; errors: string[] }>('/sync/modbus-to-ua', { method: 'POST' }),
  uaToModbus: (nodeId: string, value: any) =>
    request<{ nodeId: string; value: any }>(`/sync/ua-to-modbus/${encodeURIComponent(nodeId)}`, {
      method: 'POST',
      body: JSON.stringify({ value }),
    }),
  getLogs: (limit: number = 100, status?: string) => {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    if (status) params.set('status', status);
    return request<SyncLog[]>(`/sync/logs?${params.toString()}`);
  },
  retry: () =>
    request<{ success: boolean; retriedCount: number; errors: string[] }>('/sync/retry', { method: 'POST' }),
  cleanup: (days: number = 30) =>
    request<{ deletedCount: number }>(`/sync/cleanup?days=${days}`, { method: 'DELETE' }),
};

export const exportApi = {
  export: (format: 'xml' | 'csv' | 'json' = 'xml', includeDescription: boolean = true) =>
    `${API_BASE}/export?format=${format}&includeDescription=${includeDescription}`,
  exportXml: (includeDescription: boolean = true) =>
    `${API_BASE}/export/xml?includeDescription=${includeDescription}`,
  exportCsv: (includeDescription: boolean = true) =>
    `${API_BASE}/export/csv?includeDescription=${includeDescription}`,
  exportJson: () => `${API_BASE}/export/json`,
};
