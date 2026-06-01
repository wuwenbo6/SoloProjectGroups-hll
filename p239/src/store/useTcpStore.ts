import { create } from 'zustand'
import type { CongestionState, CongestionRecord, CongestionEvent, PacketRecord } from '@/types/congestion'

export interface TransitionRecord {
  from: string
  to: string
  event: string
  timestamp: number
}

interface TcpStore {
  currentState: string
  availableEvents: string[]
  history: TransitionRecord[]
  transitioning: boolean
  transitionFrom: string | null
  transitionTo: string | null
  hoveredNode: string | null
  congestionState: CongestionState
  congestionHistory: CongestionRecord[]
  packets: PacketRecord[]
  sendingPacket: boolean
  currentPacket: PacketRecord | null
  setHoveredNode: (node: string | null) => void
  fetchState: () => Promise<void>
  triggerEvent: (event: string) => Promise<void>
  resetMachine: () => Promise<void>
  fetchCongestionState: () => Promise<void>
  triggerCongestionEvent: (event: CongestionEvent) => Promise<void>
  resetCongestion: () => Promise<void>
}

export const useTcpStore = create<TcpStore>((set) => ({
  currentState: 'CLOSED',
  availableEvents: [],
  history: [],
  transitioning: false,
  transitionFrom: null,
  transitionTo: null,
  hoveredNode: null,
  congestionState: {
    cwnd: 1,
    ssthresh: 64,
    dupacks: 0,
    phase: 'SLOW_START',
    inRecovery: false,
    retransmitCount: 0,
  },
  congestionHistory: [],
  packets: [],
  sendingPacket: false,
  currentPacket: null,

  setHoveredNode: (node) => set({ hoveredNode: node }),

  fetchState: async () => {
    try {
      const res = await fetch('/api/tcp/state')
      const data = await res.json()
      set({
        currentState: data.currentState,
        availableEvents: data.availableEvents,
        history: data.history || [],
      })
    } catch (err) {
      console.error('Failed to fetch state:', err)
    }
  },

  triggerEvent: async (event: string) => {
    try {
      const res = await fetch('/api/tcp/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event }),
      })
      const data = await res.json()

      if (data.success) {
        set({
          transitioning: true,
          transitionFrom: data.previousState,
          transitionTo: data.currentState,
        })

        setTimeout(() => {
          const prevHistory = useTcpStore.getState().history
          const newHistory = prevHistory.some(
            (r) => r.timestamp === data.timestamp,
          )
            ? prevHistory
            : [
                ...prevHistory,
                {
                  from: data.previousState,
                  to: data.currentState,
                  event: data.event,
                  timestamp: data.timestamp,
                },
              ]
          set({
            transitioning: false,
            transitionFrom: null,
            transitionTo: null,
            currentState: data.currentState,
            history: newHistory,
          })
        }, 800)

        await useTcpStore.getState().fetchState()
      } else {
        console.error('Transition failed:', data.error)
      }
    } catch (err) {
      console.error('Failed to trigger event:', err)
    }
  },

  resetMachine: async () => {
    try {
      await fetch('/api/tcp/reset', { method: 'POST' })
      await useTcpStore.getState().fetchState()
      set({
        transitioning: false,
        transitionFrom: null,
        transitionTo: null,
      })
    } catch (err) {
      console.error('Failed to reset:', err)
    }
  },

  fetchCongestionState: async () => {
    try {
      const res = await fetch('/api/tcp/congestion/state')
      const data = await res.json()
      set({
        congestionState: data.state,
        congestionHistory: data.history || [],
        packets: data.packets || [],
      })
    } catch (err) {
      console.error('Failed to fetch congestion state:', err)
    }
  },

  triggerCongestionEvent: async (event: CongestionEvent) => {
    try {
      const res = await fetch('/api/tcp/congestion/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event }),
      })
      const data = await res.json()

      if (data.success) {
        const newPacket: PacketRecord = data.packet || {
          id: Date.now(),
          type: 'DATA',
          timestamp: Date.now(),
        }

        set({
          sendingPacket: true,
          currentPacket: newPacket,
        })

        setTimeout(() => {
          const prevHistory = useTcpStore.getState().congestionHistory
          const newRecord: CongestionRecord = data.record || {
            timestamp: Date.now(),
            event,
            cwnd: data.state.cwnd,
            ssthresh: data.state.ssthresh,
            phase: data.state.phase,
          }
          const newHistory = [...prevHistory, newRecord].slice(-30)

          set({
            sendingPacket: false,
            currentPacket: null,
            congestionState: data.state,
            congestionHistory: newHistory,
            packets: [...useTcpStore.getState().packets, newPacket].slice(-10),
          })
        }, 600)

        await useTcpStore.getState().fetchCongestionState()
      } else {
        console.error('Congestion event failed:', data.error)
      }
    } catch (err) {
      console.error('Failed to trigger congestion event:', err)
    }
  },

  resetCongestion: async () => {
    try {
      await fetch('/api/tcp/congestion/reset', { method: 'POST' })
      await useTcpStore.getState().fetchCongestionState()
      set({
        sendingPacket: false,
        currentPacket: null,
      })
    } catch (err) {
      console.error('Failed to reset congestion:', err)
    }
  },
}))
