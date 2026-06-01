import { create } from 'zustand'
import type { ParseResult, TrendData, HistoryResponse, CodecListResponse, P564Detail, CallInfo, CallSummary, CallTrendData } from '@/types'
import * as api from '@/api'

interface XrState {
  latest: ParseResult | null
  trend: TrendData | null
  history: HistoryResponse | null
  detail: ParseResult | null
  codecs: CodecListResponse | null
  p564Preview: P564Detail | null
  calls: CallInfo[]
  selectedCalls: number[]
  callComparisons: CallSummary[]
  callTrends: CallTrendData[]
  showCompare: boolean
  trendHours: number
  historyPage: number
  selectedCodec: string
  loading: boolean
  error: string | null

  loadLatest: () => Promise<void>
  loadTrend: (hours?: number) => Promise<void>
  loadHistory: (page?: number) => Promise<void>
  loadDetail: (id: number) => Promise<void>
  loadCodecs: () => Promise<void>
  loadCalls: () => Promise<void>
  loadCallComparisons: () => Promise<void>
  loadCallTrends: () => Promise<void>
  parseFile: (file: File) => Promise<void>
  parseHex: (hex: string) => Promise<void>
  generateDemo: () => Promise<void>
  calculateP564Preview: (lossRate: number, jitterDelay: number) => Promise<void>
  toggleCallSelection: (ssrc: number) => void
  setShowCompare: (show: boolean) => void
  setTrendHours: (hours: number) => void
  setHistoryPage: (page: number) => void
  setSelectedCodec: (codec: string) => void
  clearError: () => void
  downloadPdfReport: (ssrc?: number) => void
}

export const useXrStore = create<XrState>((set, get) => ({
  latest: null,
  trend: null,
  history: null,
  detail: null,
  codecs: null,
  p564Preview: null,
  calls: [],
  selectedCalls: [],
  callComparisons: [],
  callTrends: [],
  showCompare: false,
  trendHours: 24,
  historyPage: 1,
  selectedCodec: 'G.711',
  loading: false,
  error: null,

  loadLatest: async () => {
    try {
      const data = await api.fetchLatest()
      set({ latest: data })
    } catch {
      set({ latest: null })
    }
  },

  loadTrend: async (hours?: number) => {
    const h = hours ?? get().trendHours
    try {
      const data = await api.fetchTrend(h)
      set({ trend: data })
    } catch {
      set({ trend: null })
    }
  },

  loadHistory: async (page?: number) => {
    const p = page ?? get().historyPage
    try {
      const data = await api.fetchHistory(p, 10)
      set({ history: data, historyPage: p })
    } catch {
      set({ history: null })
    }
  },

  loadDetail: async (id: number) => {
    set({ loading: true, error: null })
    try {
      const data = await api.fetchDetail(id)
      set({ detail: data, loading: false })
    } catch (e: any) {
      set({ error: e.message, loading: false })
    }
  },

  loadCodecs: async () => {
    try {
      const data = await api.fetchCodecs()
      set({ codecs: data })
    } catch {
      set({ codecs: null })
    }
  },

  parseFile: async (file: File) => {
    set({ loading: true, error: null })
    try {
      await api.parseFromFile(file, get().selectedCodec)
      await get().loadLatest()
      await get().loadTrend()
      await get().loadHistory()
      set({ loading: false })
    } catch (e: any) {
      set({ error: e.message, loading: false })
    }
  },

  parseHex: async (hex: string) => {
    set({ loading: true, error: null })
    try {
      await api.parseFromHex(hex, get().selectedCodec)
      await get().loadLatest()
      await get().loadTrend()
      await get().loadHistory()
      set({ loading: false })
    } catch (e: any) {
      set({ error: e.message, loading: false })
    }
  },

  generateDemo: async () => {
    set({ loading: true, error: null })
    try {
      await api.generateDemo()
      await get().loadLatest()
      await get().loadTrend()
      await get().loadHistory()
      set({ loading: false })
    } catch (e: any) {
      set({ error: e.message, loading: false })
    }
  },

  calculateP564Preview: async (lossRate: number, jitterDelay: number) => {
    try {
      const data = await api.fetchP564Mos(lossRate, jitterDelay, get().selectedCodec)
      set({ p564Preview: data })
    } catch {
      set({ p564Preview: null })
    }
  },

  setTrendHours: (hours: number) => {
    set({ trendHours: hours })
    get().loadTrend(hours)
  },

  setHistoryPage: (page: number) => {
    get().loadHistory(page)
  },

  setSelectedCodec: (codec: string) => {
    set({ selectedCodec: codec })
  },

  loadCalls: async () => {
    try {
      const data = await api.fetchCallList()
      set({ calls: data.calls })
    } catch {
      set({ calls: [] })
    }
  },

  toggleCallSelection: (ssrc: number) => {
    const selected = get().selectedCalls
    if (selected.includes(ssrc)) {
      set({ selectedCalls: selected.filter(s => s !== ssrc) })
    } else {
      set({ selectedCalls: [...selected, ssrc] })
    }
  },

  setShowCompare: (show: boolean) => {
    set({ showCompare: show })
  },

  loadCallComparisons: async () => {
    const selected = get().selectedCalls
    if (selected.length === 0) {
      set({ callComparisons: [] })
      return
    }
    try {
      const data = await api.fetchCompareCalls(selected, get().trendHours)
      set({ callComparisons: data.comparisons })
    } catch {
      set({ callComparisons: [] })
    }
  },

  loadCallTrends: async () => {
    const selected = get().selectedCalls
    if (selected.length === 0) {
      set({ callTrends: [] })
      return
    }
    try {
      const trends = await Promise.all(
        selected.map(ssrc => api.fetchCallTrend(ssrc, get().trendHours))
      )
      set({ callTrends: trends })
    } catch {
      set({ callTrends: [] })
    }
  },

  downloadPdfReport: (ssrc?: number) => {
    const url = api.getPdfReportUrl(get().trendHours, ssrc)
    window.open(url, '_blank')
  },

  clearError: () => set({ error: null }),
}))
