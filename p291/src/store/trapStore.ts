import { create } from "zustand"
import { SnmpTrap, ServiceStatus, SnmpConfig } from "@/types"

interface TrapState {
  traps: SnmpTrap[]
  total: number
  selectedTrapId: string | null
  versionFilter: string | null
  status: ServiceStatus | null
  config: SnmpConfig | null
  wsConnected: boolean

  addTrap: (trap: SnmpTrap) => void
  setTraps: (traps: SnmpTrap[], total: number) => void
  selectTrap: (id: string | null) => void
  setVersionFilter: (version: string | null) => void
  clearTraps: () => void
  setStatus: (status: ServiceStatus) => void
  setConfig: (config: SnmpConfig) => void
  setWsConnected: (connected: boolean) => void
}

export const useTrapStore = create<TrapState>((set) => ({
  traps: [],
  total: 0,
  selectedTrapId: null,
  versionFilter: null,
  status: null,
  config: null,
  wsConnected: false,

  addTrap: (trap) =>
    set((state) => ({
      traps: [trap, ...state.traps].slice(0, 1000),
      total: state.total + 1,
    })),

  setTraps: (traps, total) => set({ traps, total }),

  selectTrap: (id) => set({ selectedTrapId: id }),

  setVersionFilter: (version) => set({ versionFilter: version }),

  clearTraps: () => set({ traps: [], total: 0, selectedTrapId: null }),

  setStatus: (status) => set({ status }),

  setConfig: (config) => set({ config }),

  setWsConnected: (connected) => set({ wsConnected: connected }),
}))
