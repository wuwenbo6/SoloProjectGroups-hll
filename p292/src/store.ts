import { create } from 'zustand'
import type { BCEEntry, EventLog, PBAResponse, TunnelState, BindingUpdateRecord } from './types'
import { fetchBCE, fetchEvents, sendPBU, fetchTunnels, fetchHistory, exportHistory } from './api'
import type { PBURequest } from './types'

interface LMAStore {
  entries: BCEEntry[]
  events: EventLog[]
  tunnels: TunnelState[]
  history: BindingUpdateRecord[]
  loading: boolean
  lastPBA: PBAResponse | null
  refreshBCE: () => Promise<void>
  refreshEvents: () => Promise<void>
  refreshTunnels: () => Promise<void>
  refreshHistory: (mnID?: string) => Promise<void>
  sendPBU: (req: PBURequest) => Promise<PBAResponse>
  exportHistory: (format: 'json' | 'csv', mnID?: string) => Promise<void>
  refreshAll: () => Promise<void>
}

export const useLMAStore = create<LMAStore>((set) => ({
  entries: [],
  events: [],
  tunnels: [],
  history: [],
  loading: false,
  lastPBA: null,

  refreshBCE: async () => {
    try {
      const entries = await fetchBCE()
      set({ entries })
    } catch {
      console.error('Failed to fetch BCE')
    }
  },

  refreshEvents: async () => {
    try {
      const events = await fetchEvents()
      set({ events })
    } catch {
      console.error('Failed to fetch events')
    }
  },

  refreshTunnels: async () => {
    try {
      const tunnels = await fetchTunnels()
      set({ tunnels })
    } catch {
      console.error('Failed to fetch tunnels')
    }
  },

  refreshHistory: async (mnID?: string) => {
    try {
      const { records } = await fetchHistory(mnID)
      set({ history: records })
    } catch {
      console.error('Failed to fetch history')
    }
  },

  sendPBU: async (req: PBURequest) => {
    set({ loading: true })
    try {
      const pba = await sendPBU(req)
      set({ lastPBA: pba, loading: false })
      const [entries, events, tunnels, historyData] = await Promise.all([
        fetchBCE(),
        fetchEvents(),
        fetchTunnels(),
        fetchHistory(),
      ])
      set({ entries, events, tunnels, history: historyData.records })
      return pba
    } catch {
      set({ loading: false })
      throw new Error('PBU send failed')
    }
  },

  exportHistory: async (format: 'json' | 'csv', mnID?: string) => {
    await exportHistory(format, mnID)
  },

  refreshAll: async () => {
    try {
      const [entries, events, tunnels, historyData] = await Promise.all([
        fetchBCE(),
        fetchEvents(),
        fetchTunnels(),
        fetchHistory(),
      ])
      set({ entries, events, tunnels, history: historyData.records })
    } catch {
      console.error('Failed to refresh')
    }
  },
}))
