import { create } from 'zustand'
import type { SimulatorStatus, SimEvent, IOTick } from '@/types'

interface SimulatorState {
  status: SimulatorStatus | null
  events: SimEvent[]
  ioHistory: { pathA: number; pathB: number; timestamp: number }[]
  wsConnected: boolean
  setStatus: (status: SimulatorStatus) => void
  addEvent: (event: SimEvent) => void
  addIOTick: (tick: IOTick) => void
  setWsConnected: (connected: boolean) => void
}

const MAX_IO_HISTORY = 120
const MAX_EVENTS = 50

export const useSimulatorStore = create<SimulatorState>((set) => ({
  status: null,
  events: [],
  ioHistory: [],
  wsConnected: false,
  setStatus: (status) => set({ status }),
  addEvent: (event) =>
    set((state) => ({
      events: [...state.events.slice(-(MAX_EVENTS - 1)), event],
    })),
  addIOTick: (tick) =>
    set((state) => ({
      ioHistory: [...state.ioHistory.slice(-(MAX_IO_HISTORY - 1)), { pathA: tick.pathA, pathB: tick.pathB, timestamp: tick.timestamp }],
    })),
  setWsConnected: (connected) => set({ wsConnected: connected }),
}))
