import type {
  RbdImage,
  RbdImageDetail,
  SnapshotTreeNode,
  PoolStats,
  ApiResponse,
  SnapshotSchedule,
  CreateScheduleRequest,
  ExportDiffRequest,
  ExportDiffResult,
} from '../types';

const API_BASE = '/api';

async function request<T>(
  url: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const response = await fetch(`${API_BASE}${url}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  });

  const data = await response.json();
  return data as ApiResponse<T>;
}

export const rbdApi = {
  listImages: (pool?: string) =>
    request<RbdImage[]>(`/images${pool ? `?pool=${encodeURIComponent(pool)}` : ''}`),

  getImageDetail: (pool: string, name: string) =>
    request<RbdImageDetail>(`/images/${encodeURIComponent(pool)}/${encodeURIComponent(name)}`),

  getPoolStats: () =>
    request<PoolStats>(`/images/stats`),

  getSnapshotTree: () =>
    request<SnapshotTreeNode[]>(`/images/snapshot-tree`),

  createSnapshot: (pool: string, name: string, snapshotName: string) =>
    request<{ message: string }>(
      `/images/${encodeURIComponent(pool)}/${encodeURIComponent(name)}/snapshots`,
      {
        method: 'POST',
        body: JSON.stringify({ snapshotName }),
      }
    ),

  rollbackSnapshot: (pool: string, name: string, snap: string) =>
    request<{ message: string }>(
      `/images/${encodeURIComponent(pool)}/${encodeURIComponent(name)}/snapshots/${encodeURIComponent(snap)}/rollback`,
      { method: 'POST' }
    ),

  deleteSnapshot: (pool: string, name: string, snap: string, force?: boolean) =>
    request<{ message: string }>(
      `/images/${encodeURIComponent(pool)}/${encodeURIComponent(name)}/snapshots/${encodeURIComponent(snap)}`,
      {
        method: 'DELETE',
        body: JSON.stringify({ force }),
      }
    ),

  protectSnapshot: (pool: string, name: string, snap: string) =>
    request<{ message: string }>(
      `/images/${encodeURIComponent(pool)}/${encodeURIComponent(name)}/snapshots/${encodeURIComponent(snap)}/protect`,
      { method: 'POST' }
    ),

  unprotectSnapshot: (pool: string, name: string, snap: string) =>
    request<{ message: string }>(
      `/images/${encodeURIComponent(pool)}/${encodeURIComponent(name)}/snapshots/${encodeURIComponent(snap)}/unprotect`,
      { method: 'POST' }
    ),

  cloneSnapshot: (
    pool: string,
    name: string,
    snap: string,
    newPool: string,
    newImageName: string,
    size?: number
  ) =>
    request<{ message: string }>(
      `/images/${encodeURIComponent(pool)}/${encodeURIComponent(name)}/snapshots/${encodeURIComponent(snap)}/clone`,
      {
        method: 'POST',
        body: JSON.stringify({ newPool, newImageName, size }),
      }
    ),

  exportDiff: (
    pool: string,
    name: string,
    options: ExportDiffRequest
  ) =>
    request<ExportDiffResult>(
      `/images/${encodeURIComponent(pool)}/${encodeURIComponent(name)}/export-diff`,
      {
        method: 'POST',
        body: JSON.stringify(options),
      }
    ),

  listSchedules: () =>
    request<SnapshotSchedule[]>(`/schedules`),

  getSchedule: (id: string) =>
    request<SnapshotSchedule>(`/schedules/${encodeURIComponent(id)}`),

  createSchedule: (data: CreateScheduleRequest) =>
    request<SnapshotSchedule>(`/schedules`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateSchedule: (id: string, data: Partial<SnapshotSchedule>) =>
    request<SnapshotSchedule>(`/schedules/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteSchedule: (id: string) =>
    request<{ message: string }>(`/schedules/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  toggleSchedule: (id: string, enabled: boolean) =>
    request<SnapshotSchedule>(`/schedules/${encodeURIComponent(id)}/toggle`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    }),

  reloadSchedules: () =>
    request<{ message: string }>(`/schedules/reload`, { method: 'POST' }),
};
