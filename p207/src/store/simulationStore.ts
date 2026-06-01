import { create } from 'zustand'
import type { GPDevice, GPFrame, SimulationStatus, VirtualClock, LightModel, CollisionStats, EnergyReport } from '../../shared/types'

interface SimulationState {
  devices: Map<string, GPDevice>
  frames: GPFrame[]
  simulationStatus: SimulationStatus | null
  virtualClock: VirtualClock | null
  lightModel: LightModel | null
  collisionStats: CollisionStats | null
  energyReport: EnergyReport | null
  isConnected: boolean
  selectedDeviceId: string | null
  setDevice: (device: GPDevice) => void
  addFrame: (frame: GPFrame) => void
  setSimulationStatus: (status: SimulationStatus) => void
  setVirtualClock: (clock: VirtualClock) => void
  setLightModel: (light: LightModel) => void
  setCollisionStats: (stats: CollisionStats) => void
  setEnergyReport: (report: EnergyReport) => void
  setConnected: (connected: boolean) => void
  setSelectedDeviceId: (id: string | null) => void
  clearFrames: () => void
  getDevicesArray: () => GPDevice[]
  getFramesArray: () => GPFrame[]
  getSelectedDevice: () => GPDevice | undefined
}

export const useSimulationStore = create<SimulationState>((set, get) => ({
  devices: new Map(),
  frames: [],
  simulationStatus: null,
  virtualClock: null,
  lightModel: null,
  collisionStats: null,
  energyReport: null,
  isConnected: false,
  selectedDeviceId: null,

  setDevice: (device: GPDevice) => {
    set((state) => {
      const newDevices = new Map(state.devices)
      newDevices.set(device.deviceId, device)
      return { devices: newDevices }
    })
  },

  addFrame: (frame: GPFrame) => {
    set((state) => {
      const newFrames = [frame, ...state.frames].slice(0, 100)
      return { frames: newFrames }
    })
  },

  setSimulationStatus: (status: SimulationStatus) => {
    set({ simulationStatus: status })
  },

  setVirtualClock: (clock: VirtualClock) => {
    set({ virtualClock: clock })
  },

  setLightModel: (light: LightModel) => {
    set({ lightModel: light })
  },

  setCollisionStats: (stats: CollisionStats) => {
    set({ collisionStats: stats })
  },

  setEnergyReport: (report: EnergyReport) => {
    set({ energyReport: report })
  },

  setConnected: (connected: boolean) => {
    set({ isConnected: connected })
  },

  setSelectedDeviceId: (id: string | null) => {
    set({ selectedDeviceId: id })
  },

  clearFrames: () => {
    set({ frames: [] })
  },

  getDevicesArray: () => {
    return Array.from(get().devices.values()).sort((a, b) => a.deviceId.localeCompare(b.deviceId))
  },

  getFramesArray: () => {
    return get().frames
  },

  getSelectedDevice: () => {
    const state = get()
    return state.selectedDeviceId ? state.devices.get(state.selectedDeviceId) : undefined
  },
}))
