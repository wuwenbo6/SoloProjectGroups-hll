import { create } from 'zustand'
import type { Zone, NamespaceStatus, OperationLog } from '@/types/zns'

interface ZNSState {
  zones: Zone[]
  status: NamespaceStatus | null
  logs: OperationLog[]
  selectedZoneId: number | null
  initialized: boolean
  loading: boolean
  error: string | null
  toast: { message: string; type: 'success' | 'error' } | null

  setSelectedZoneId: (id: number | null) => void
  clearError: () => void
  clearToast: () => void

  initNamespace: (zoneCount: number, zoneCapacity: number) => Promise<void>
  fetchStatus: () => Promise<void>
  fetchZones: () => Promise<void>
  fetchLogs: () => Promise<void>

  openZone: (id: number) => Promise<void>
  closeZone: (id: number) => Promise<void>
  finishZone: (id: number) => Promise<void>
  resetZone: (id: number) => Promise<void>
  writeZone: (id: number, size: number) => Promise<void>
  appendZone: (id: number, size?: number) => Promise<void>
  exportCSV: () => void
}

async function apiCall<T>(
  url: string,
  options?: RequestInit,
): Promise<{ success: boolean; data?: T; error?: string }> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  return res.json()
}

export const useZNSStore = create<ZNSState>((set, get) => ({
  zones: [],
  status: null,
  logs: [],
  selectedZoneId: null,
  initialized: false,
  loading: false,
  error: null,
  toast: null,

  setSelectedZoneId: (id) => set({ selectedZoneId: id }),
  clearError: () => set({ error: null }),
  clearToast: () => set({ toast: null }),

  initNamespace: async (zoneCount, zoneCapacity) => {
    set({ loading: true, error: null })
    try {
      const result = await apiCall('/api/namespace/init', {
        method: 'POST',
        body: JSON.stringify({ zoneCount, zoneCapacity }),
      })
      if (result.success) {
        set({ initialized: true, loading: false })
        get().fetchStatus()
        get().fetchZones()
        get().fetchLogs()
        set({ toast: { message: `Namespace initialized with ${zoneCount} zones`, type: 'success' } })
      } else {
        set({ error: result.error || 'Init failed', loading: false })
        set({ toast: { message: result.error || 'Init failed', type: 'error' } })
      }
    } catch {
      set({ error: 'Network error', loading: false })
      set({ toast: { message: 'Network error', type: 'error' } })
    }
  },

  fetchStatus: async () => {
    try {
      const result = await apiCall<NamespaceStatus>('/api/namespace/status')
      if (result.success) {
        set({ status: result.data! })
      }
    } catch {}
  },

  fetchZones: async () => {
    try {
      const result = await apiCall<Zone[]>('/api/zones')
      if (result.success) {
        set({ zones: result.data! })
      }
    } catch {}
  },

  fetchLogs: async () => {
    try {
      const result = await apiCall<OperationLog[]>('/api/logs')
      if (result.success) {
        set({ logs: result.data! })
      }
    } catch {}
  },

  openZone: async (id) => {
    set({ loading: true })
    try {
      const result = await apiCall<Zone>(`/api/zones/${id}/open`, {
        method: 'POST',
      })
      if (result.success) {
        set({ loading: false })
        get().fetchZones()
        get().fetchStatus()
        get().fetchLogs()
        set({ toast: { message: `Zone ${id} opened`, type: 'success' } })
      } else {
        set({ loading: false, toast: { message: result.error || 'Operation failed', type: 'error' } })
      }
    } catch {
      set({ loading: false, toast: { message: 'Network error', type: 'error' } })
    }
  },

  closeZone: async (id) => {
    set({ loading: true })
    try {
      const result = await apiCall<Zone>(`/api/zones/${id}/close`, {
        method: 'POST',
      })
      if (result.success) {
        set({ loading: false })
        get().fetchZones()
        get().fetchStatus()
        get().fetchLogs()
        set({ toast: { message: `Zone ${id} closed`, type: 'success' } })
      } else {
        set({ loading: false, toast: { message: result.error || 'Operation failed', type: 'error' } })
      }
    } catch {
      set({ loading: false, toast: { message: 'Network error', type: 'error' } })
    }
  },

  finishZone: async (id) => {
    set({ loading: true })
    try {
      const result = await apiCall<Zone>(`/api/zones/${id}/finish`, {
        method: 'POST',
      })
      if (result.success) {
        set({ loading: false })
        get().fetchZones()
        get().fetchStatus()
        get().fetchLogs()
        set({ toast: { message: `Zone ${id} finished`, type: 'success' } })
      } else {
        set({ loading: false, toast: { message: result.error || 'Operation failed', type: 'error' } })
      }
    } catch {
      set({ loading: false, toast: { message: 'Network error', type: 'error' } })
    }
  },

  resetZone: async (id) => {
    set({ loading: true })
    try {
      const result = await apiCall<Zone>(`/api/zones/${id}/reset`, {
        method: 'POST',
      })
      if (result.success) {
        set({ loading: false })
        get().fetchZones()
        get().fetchStatus()
        get().fetchLogs()
        set({ toast: { message: `Zone ${id} reset`, type: 'success' } })
      } else {
        set({ loading: false, toast: { message: result.error || 'Operation failed', type: 'error' } })
      }
    } catch {
      set({ loading: false, toast: { message: 'Network error', type: 'error' } })
    }
  },

  writeZone: async (id, size) => {
    set({ loading: true })
    try {
      const result = await apiCall<Zone>(`/api/zones/${id}/write`, {
        method: 'POST',
        body: JSON.stringify({ size }),
      })
      if (result.success) {
        set({ loading: false })
        get().fetchZones()
        get().fetchStatus()
        get().fetchLogs()
        set({ toast: { message: `Wrote ${size} LBAs to Zone ${id}`, type: 'success' } })
      } else {
        set({ loading: false, toast: { message: result.error || 'Write failed', type: 'error' } })
      }
    } catch {
      set({ loading: false, toast: { message: 'Network error', type: 'error' } })
    }
  },

  appendZone: async (id, size) => {
    set({ loading: true })
    try {
      const result = await apiCall<Zone>(`/api/zones/${id}/append`, {
        method: 'POST',
        body: size ? JSON.stringify({ size }) : JSON.stringify({}),
      })
      if (result.success) {
        set({ loading: false })
        get().fetchZones()
        get().fetchStatus()
        get().fetchLogs()
        const actualSize = size || 'MAX'
        set({ toast: { message: `Appended ${actualSize} to Zone ${id}`, type: 'success' } })
      } else {
        set({ loading: false, toast: { message: result.error || 'Append failed', type: 'error' } })
      }
    } catch {
      set({ loading: false, toast: { message: 'Network error', type: 'error' } })
    }
  },

  exportCSV: () => {
    const link = document.createElement('a')
    link.href = '/api/namespace/export/csv'
    link.download = 'zns-zones.csv'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    set({ toast: { message: 'CSV export started', type: 'success' } })
  },
}))
