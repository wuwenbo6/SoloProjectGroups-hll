import { create } from 'zustand'

interface SwiftConnection {
  auth_url: string
  username: string
  password: string
  project_name: string
  project_domain_name: string
  user_domain_name: string
}

interface ColdObject {
  container: string
  name: string
  bytes: number
  content_type: string
  last_modified: string
  x_timestamp: string
  access_time: string
  time_source: 'meta' | 'timestamp' | 'none'
  days_inactive: number
}

interface ScanStatus {
  scanning: boolean
  progress: number
  total_containers: number
  scanned_containers: number
  total_objects: number
  cold_objects: number
  last_scan_time: string | null
  error: string | null
}

interface Container {
  name: string
  count: number
  bytes: number
}

interface AppState {
  connected: boolean
  connecting: boolean
  connectError: string | null
  connection: SwiftConnection
  scanStatus: ScanStatus
  containers: Container[]
  coldObjects: ColdObject[]
  coldObjectsTotal: number
  coldObjectsPage: number
  coldObjectsPageSize: number
  selectedObjects: Set<string>
  deleting: boolean
  archiving: boolean
  showConfirmModal: boolean
  confirmModalAction: (() => void) | null
  confirmModalTitle: string
  confirmModalMessage: string

  setConnection: (conn: Partial<SwiftConnection>) => void
  connect: () => Promise<void>
  checkStatus: () => Promise<void>
  startScan: () => Promise<void>
  pollScanStatus: () => Promise<void>
  fetchContainers: () => Promise<void>
  fetchColdObjects: (params?: {
    container?: string
    sort_by?: string
    order?: string
    page?: number
    page_size?: number
    search?: string
  }) => Promise<void>
  deleteObjects: (objects: Array<{ container: string; name: string }>) => Promise<void>
  cleanupAll: () => Promise<void>
  archiveObjects: (objects: Array<{ container: string; name: string }>) => Promise<void>
  archiveAll: () => Promise<void>
  exportCsv: (params?: { container?: string; search?: string }) => void
  toggleSelectObject: (key: string) => void
  selectAll: (keys: string[]) => void
  clearSelection: () => void
  setShowConfirmModal: (show: boolean) => void
  setConfirmModal: (title: string, message: string, action: () => void) => void
}

const defaultConnection: SwiftConnection = {
  auth_url: '',
  username: '',
  password: '',
  project_name: '',
  project_domain_name: 'Default',
  user_domain_name: 'Default',
}

const defaultScanStatus: ScanStatus = {
  scanning: false,
  progress: 0,
  total_containers: 0,
  scanned_containers: 0,
  total_objects: 0,
  cold_objects: 0,
  last_scan_time: null,
  error: null,
}

export const useAppStore = create<AppState>((set, get) => ({
  connected: false,
  connecting: false,
  connectError: null,
  connection: { ...defaultConnection },
  scanStatus: { ...defaultScanStatus },
  containers: [],
  coldObjects: [],
  coldObjectsTotal: 0,
  coldObjectsPage: 1,
  coldObjectsPageSize: 50,
  selectedObjects: new Set(),
  deleting: false,
  archiving: false,
  showConfirmModal: false,
  confirmModalAction: null,
  confirmModalTitle: '',
  confirmModalMessage: '',

  setConnection: (conn) =>
    set((state) => ({
      connection: { ...state.connection, ...conn },
    })),

  connect: async () => {
    set({ connecting: true, connectError: null })
    try {
      const { connection } = get()
      const res = await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(connection),
      })
      const data = await res.json()
      if (data.success) {
        set({ connected: true, connecting: false })
      } else {
        set({ connectError: data.message, connecting: false })
      }
    } catch (err: any) {
      set({ connectError: err.message, connecting: false })
    }
  },

  checkStatus: async () => {
    try {
      const res = await fetch('/api/status')
      const data = await res.json()
      set({ connected: data.connected })
    } catch {
      set({ connected: false })
    }
  },

  startScan: async () => {
    try {
      const res = await fetch('/api/scan', { method: 'POST' })
      if (res.ok) {
        set((state) => ({
          scanStatus: { ...state.scanStatus, scanning: true, progress: 0 },
        }))
      }
    } catch {}
  },

  pollScanStatus: async () => {
    try {
      const res = await fetch('/api/scan/status')
      const data = await res.json()
      set({ scanStatus: data })
    } catch {}
  },

  fetchContainers: async () => {
    try {
      const res = await fetch('/api/containers')
      const data = await res.json()
      if (data.containers) {
        set({
          containers: data.containers.map((c: any) => ({
            name: c.name,
            count: c.count,
            bytes: c.bytes,
          })),
        })
      }
    } catch {}
  },

  fetchColdObjects: async (params = {}) => {
    const sp = new URLSearchParams()
    if (params.container) sp.set('container', params.container)
    if (params.sort_by) sp.set('sort_by', params.sort_by)
    if (params.order) sp.set('order', params.order)
    if (params.page) sp.set('page', String(params.page))
    if (params.page_size) sp.set('page_size', String(params.page_size))
    if (params.search) sp.set('search', params.search)

    try {
      const res = await fetch(`/api/cold-objects?${sp.toString()}`)
      const data = await res.json()
      set({
        coldObjects: data.objects,
        coldObjectsTotal: data.total,
        coldObjectsPage: data.page,
        coldObjectsPageSize: data.page_size,
      })
    } catch {}
  },

  deleteObjects: async (objects) => {
    set({ deleting: true })
    try {
      const res = await fetch('/api/objects', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objects }),
      })
      const data = await res.json()
      const { selectedObjects } = get()
      const newSelected = new Set(selectedObjects)
      objects.forEach((o) => newSelected.delete(`${o.container}/${o.name}`))
      set({ selectedObjects: newSelected, deleting: false })
      await get().fetchColdObjects({
        page: get().coldObjectsPage,
        page_size: get().coldObjectsPageSize,
      })
      return data
    } catch {
      set({ deleting: false })
    }
  },

  cleanupAll: async () => {
    set({ deleting: true })
    try {
      const res = await fetch('/api/cleanup-all', { method: 'DELETE' })
      const data = await res.json()
      set({ selectedObjects: new Set(), deleting: false })
      await get().fetchColdObjects({
        page: get().coldObjectsPage,
        page_size: get().coldObjectsPageSize,
      })
      return data
    } catch {
      set({ deleting: false })
    }
  },

  archiveObjects: async (objects) => {
    set({ archiving: true })
    try {
      const res = await fetch('/api/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objects }),
      })
      const data = await res.json()
      const { selectedObjects } = get()
      const newSelected = new Set(selectedObjects)
      objects.forEach((o) => newSelected.delete(`${o.container}/${o.name}`))
      set({ selectedObjects: newSelected, archiving: false })
      await get().fetchColdObjects({
        page: get().coldObjectsPage,
        page_size: get().coldObjectsPageSize,
      })
      return data
    } catch {
      set({ archiving: false })
    }
  },

  archiveAll: async () => {
    set({ archiving: true })
    try {
      const res = await fetch('/api/archive-all', { method: 'POST' })
      const data = await res.json()
      set({ selectedObjects: new Set(), archiving: false })
      await get().fetchColdObjects({
        page: get().coldObjectsPage,
        page_size: get().coldObjectsPageSize,
      })
      return data
    } catch {
      set({ archiving: false })
    }
  },

  exportCsv: (params = {}) => {
    const sp = new URLSearchParams()
    if (params.container) sp.set('container', params.container)
    if (params.search) sp.set('search', params.search)
    window.open(`/api/cold-objects/export?${sp.toString()}`, '_blank')
  },

  toggleSelectObject: (key) =>
    set((state) => {
      const newSet = new Set(state.selectedObjects)
      if (newSet.has(key)) {
        newSet.delete(key)
      } else {
        newSet.add(key)
      }
      return { selectedObjects: newSet }
    }),

  selectAll: (keys) =>
    set(() => ({
      selectedObjects: new Set(keys),
    })),

  clearSelection: () =>
    set({ selectedObjects: new Set() }),

  setShowConfirmModal: (show) => set({ showConfirmModal: show }),

  setConfirmModal: (title, message, action) =>
    set({
      showConfirmModal: true,
      confirmModalTitle: title,
      confirmModalMessage: message,
      confirmModalAction: action,
    }),
}))
