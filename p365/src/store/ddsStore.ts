import { create } from 'zustand'
import { io, Socket } from 'socket.io-client'

export interface DDSMessage {
  id: number
  source_timestamp: number
  data: string
  topic: string
  value: number
  delivered: boolean
  filteredByTime: boolean
  filteredByContent: boolean
}

export interface RatePoint {
  time: number
  sentRate: number
  receivedRate: number
}

export interface ContentFilterConfig {
  enabled: boolean
  topic: string
  valueMin: number | null
  valueMax: number | null
  keyword: string
}

export interface FilterStats {
  totalSent: number
  timeFilterPassed: number
  timeFilterBlocked: number
  contentFilterPassed: number
  contentFilterBlocked: number
  bothFiltersPassed: number
  byTopic: Record<string, { sent: number; passed: number }>
  byValueRange: Array<{ range: string; sent: number; passed: number }>
}

interface DDSState {
  connected: boolean
  running: boolean
  publishRate: number
  minSeparationMs: number
  sentCount: number
  receivedCount: number
  droppedCount: number
  contentFilterCount: number
  messages: DDSMessage[]
  rateHistory: RatePoint[]
  socket: Socket | null
  lastDeliveredSourceTimestamp: number | null
  contentFilter: ContentFilterConfig

  connect: () => void
  disconnect: () => void
  start: (publishRate: number, minSeparationMs: number) => void
  stop: () => void
  reset: () => void
  configure: (publishRate: number, minSeparationMs: number) => void
  setContentFilter: (config: Partial<ContentFilterConfig>) => void
  getFilterStats: () => FilterStats
  exportStatsJSON: () => string
  exportStatsCSV: () => string
}

const MAX_MESSAGES = 200
const MAX_RATE_POINTS = 60

let rateInterval: ReturnType<typeof setInterval> | null = null
let lastSentCount = 0
let lastReceivedCount = 0

function checkContentFilter(
  msg: { topic: string; value: number; data: string },
  filter: ContentFilterConfig
): boolean {
  if (!filter.enabled) return true

  if (filter.topic && filter.topic !== '*') {
    if (msg.topic !== filter.topic) return false
  }

  if (filter.valueMin !== null && msg.value < filter.valueMin) {
    return false
  }

  if (filter.valueMax !== null && msg.value > filter.valueMax) {
    return false
  }

  if (filter.keyword && filter.keyword.trim()) {
    if (!msg.data.toLowerCase().includes(filter.keyword.trim().toLowerCase())) {
      return false
    }
  }

  return true
}

export const useDDSStore = create<DDSState>((set, get) => ({
  connected: false,
  running: false,
  publishRate: 10,
  minSeparationMs: 200,
  sentCount: 0,
  receivedCount: 0,
  droppedCount: 0,
  contentFilterCount: 0,
  messages: [],
  rateHistory: [],
  socket: null,
  lastDeliveredSourceTimestamp: null,
  contentFilter: {
    enabled: false,
    topic: '*',
    valueMin: null,
    valueMax: null,
    keyword: '',
  },

  connect: () => {
    const socket = io('http://localhost:5001', {
      transports: ['websocket'],
    })

    socket.on('connect', () => {
      set({ connected: true })
    })

    socket.on('disconnect', () => {
      set({ connected: false })
    })

    socket.on('status', (data) => {
      set({
        running: data.running,
        publishRate: data.publish_rate,
        minSeparationMs: data.min_separation_ms,
      })

      if (data.running && !rateInterval) {
        lastSentCount = get().sentCount
        lastReceivedCount = get().receivedCount
        rateInterval = setInterval(() => {
          const state = get()
          const sentDelta = state.sentCount - lastSentCount
          const receivedDelta = state.receivedCount - lastReceivedCount
          lastSentCount = state.sentCount
          lastReceivedCount = state.receivedCount

          set((s) => ({
            rateHistory: [
              ...s.rateHistory.slice(-(MAX_RATE_POINTS - 1)),
              {
                time: Date.now(),
                sentRate: sentDelta,
                receivedRate: receivedDelta,
              },
            ],
          }))
        }, 1000)
      } else if (!data.running && rateInterval) {
        clearInterval(rateInterval)
        rateInterval = null
      }
    })

    socket.on(
      'message',
      (rawMsg: { id: number; source_timestamp: number; data: string; topic: string; value: number }) => {
        set((state) => {
          const minSep = state.minSeparationMs
          const lastTs = state.lastDeliveredSourceTimestamp
          let timePassed = false

          if (lastTs === null || rawMsg.source_timestamp - lastTs >= minSep) {
            timePassed = true
          }

          const contentPassed = checkContentFilter(rawMsg, state.contentFilter)
          const delivered = timePassed && contentPassed

          const msg: DDSMessage = {
            ...rawMsg,
            delivered,
            filteredByTime: !timePassed,
            filteredByContent: !contentPassed,
          }

          const newMessages = [msg, ...state.messages].slice(0, MAX_MESSAGES)

          return {
            messages: newMessages,
            sentCount: state.sentCount + 1,
            receivedCount: delivered ? state.receivedCount + 1 : state.receivedCount,
            droppedCount: !timePassed ? state.droppedCount + 1 : state.droppedCount,
            contentFilterCount: timePassed && !contentPassed ? state.contentFilterCount + 1 : state.contentFilterCount,
            lastDeliveredSourceTimestamp: delivered ? rawMsg.source_timestamp : lastTs,
          }
        })
      }
    )

    set({ socket })
  },

  disconnect: () => {
    const { socket } = get()
    if (socket) {
      socket.disconnect()
    }
    if (rateInterval) {
      clearInterval(rateInterval)
      rateInterval = null
    }
    set({ socket: null, connected: false })
  },

  start: (publishRate: number, minSeparationMs: number) => {
    const { socket } = get()
    if (socket) {
      socket.emit('start', { publish_rate: publishRate, min_separation_ms: minSeparationMs })
    }
    set({
      publishRate,
      minSeparationMs,
      messages: [],
      rateHistory: [],
      sentCount: 0,
      receivedCount: 0,
      droppedCount: 0,
      contentFilterCount: 0,
      lastDeliveredSourceTimestamp: null,
    })
  },

  stop: () => {
    const { socket } = get()
    if (socket) {
      socket.emit('stop')
    }
  },

  reset: () => {
    const { socket } = get()
    if (socket) {
      socket.emit('reset')
    }
    set({
      messages: [],
      rateHistory: [],
      sentCount: 0,
      receivedCount: 0,
      droppedCount: 0,
      contentFilterCount: 0,
      lastDeliveredSourceTimestamp: null,
    })
  },

  configure: (publishRate: number, minSeparationMs: number) => {
    const { socket } = get()
    if (socket) {
      socket.emit('configure', { publish_rate: publishRate, min_separation_ms: minSeparationMs })
    }
    set({ publishRate, minSeparationMs })
  },

  setContentFilter: (config: Partial<ContentFilterConfig>) => {
    set((state) => ({
      contentFilter: { ...state.contentFilter, ...config },
    }))
  },

  getFilterStats: (): FilterStats => {
    const state = get()
    const messages = state.messages

    const stats: FilterStats = {
      totalSent: state.sentCount,
      timeFilterPassed: 0,
      timeFilterBlocked: 0,
      contentFilterPassed: 0,
      contentFilterBlocked: 0,
      bothFiltersPassed: state.receivedCount,
      byTopic: {},
      byValueRange: [],
    }

    messages.forEach((msg) => {
      if (!msg.filteredByTime) stats.timeFilterPassed++
      else stats.timeFilterBlocked++

      if (!msg.filteredByContent) stats.contentFilterPassed++
      else stats.contentFilterBlocked++

      if (!stats.byTopic[msg.topic]) {
        stats.byTopic[msg.topic] = { sent: 0, passed: 0 }
      }
      stats.byTopic[msg.topic].sent++
      if (msg.delivered) stats.byTopic[msg.topic].passed++
    })

    const ranges = [
      { label: '0-20', min: 0, max: 20 },
      { label: '20-40', min: 20, max: 40 },
      { label: '40-60', min: 40, max: 60 },
      { label: '60-80', min: 60, max: 80 },
      { label: '80-100', min: 80, max: 100 },
      { label: '100+', min: 100, max: Infinity },
    ]

    stats.byValueRange = ranges.map((r) => {
      const inRange = messages.filter((m) => m.value >= r.min && m.value < r.max)
      return {
        range: r.label,
        sent: inRange.length,
        passed: inRange.filter((m) => m.delivered).length,
      }
    })

    return stats
  },

  exportStatsJSON: (): string => {
    const stats = get().getFilterStats()
    const state = get()
    const exportData = {
      exportTime: new Date().toISOString(),
      config: {
        publishRate: state.publishRate,
        minSeparationMs: state.minSeparationMs,
        contentFilter: state.contentFilter,
      },
      stats,
      recentMessages: state.messages.slice(0, 100).map((m) => ({
        id: m.id,
        source_timestamp: m.source_timestamp,
        topic: m.topic,
        value: m.value,
        data: m.data,
        delivered: m.delivered,
        filteredByTime: m.filteredByTime,
        filteredByContent: m.filteredByContent,
      })),
    }
    return JSON.stringify(exportData, null, 2)
  },

  exportStatsCSV: (): string => {
    const state = get()
    const messages = state.messages.slice(0, 1000)

    const header =
      'id,source_timestamp,topic,value,data,delivered,filtered_by_time,filtered_by_content\n'
    const rows = messages
      .map((m) => {
        const ts = new Date(m.source_timestamp).toISOString()
        return `${m.id},${ts},"${m.topic}",${m.value},"${m.data}",${m.delivered},${m.filteredByTime},${m.filteredByContent}`
      })
      .join('\n')

    const summary = `\n\n# Summary\n` +
      `Total Sent,${state.sentCount}\n` +
      `Passed (Both Filters),${state.receivedCount}\n` +
      `Blocked by Time Filter,${state.droppedCount}\n` +
      `Blocked by Content Filter,${state.contentFilterCount}\n` +
      `Publish Rate (msg/s),${state.publishRate}\n` +
      `Min Separation (ms),${state.minSeparationMs}\n` +
      `Content Filter Enabled,${state.contentFilter.enabled}\n` +
      `Content Filter Topic,${state.contentFilter.topic}\n` +
      `Content Filter Value Min,${state.contentFilter.valueMin ?? ''}\n` +
      `Content Filter Value Max,${state.contentFilter.valueMax ?? ''}\n` +
      `Content Filter Keyword,${state.contentFilter.keyword}\n`

    return header + rows + summary
  },
}))
