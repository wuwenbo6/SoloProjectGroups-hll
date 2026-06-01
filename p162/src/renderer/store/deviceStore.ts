import { create } from 'zustand'
import type {
  DeviceState,
  LogEntry,
  CommunicationStats,
  DeviceData,
  HistoryPoint,
  MultiDeviceConfig,
} from '../../shared/types'

interface DeviceStore extends DeviceState {
  stats: CommunicationStats
  logs: LogEntry[]
  waveformData: number[]
  isConnected: boolean
  isPolling: boolean
  audioInitialized: boolean

  devices: Map<string, DeviceData>
  deviceHistory: Map<string, HistoryPoint[]>
  multiDeviceConfig: MultiDeviceConfig
  selectedDevice: string
  maxHistoryPoints: number

  connect: () => void
  disconnect: () => void
  setDeviceAddress: (address: string) => void
  updatePV: (value: number) => void
  updateSV: (value: number) => void
  updateTV: (value: number) => void
  updateFV: (value: number) => void
  setUnits: (units: string) => void
  startPolling: () => void
  stopPolling: () => void
  setPollInterval: (interval: number) => void
  addLog: (type: LogEntry['type'], message: string, data?: string) => void
  clearLogs: () => void
  incrementSent: () => void
  incrementReceived: () => void
  incrementErrors: () => void
  setWaveformData: (data: number[]) => void
  setAudioInitialized: (initialized: boolean) => void
  reset: () => void

  updateDeviceData: (address: string, data: Partial<DeviceData>) => void
  addHistoryPoint: (address: string, point: Omit<HistoryPoint, 'timestamp'>) => void
  getDeviceData: (address: string) => DeviceData | undefined
  getDeviceHistory: (address: string) => HistoryPoint[]
  getAllDevices: () => DeviceData[]
  getOnlineDevices: () => DeviceData[]
  setSelectedDevice: (address: string) => void
  setMultiDeviceConfig: (config: Partial<MultiDeviceConfig>) => void
  clearDeviceHistory: (address?: string) => void
  markDeviceOffline: (address: string) => void
}

const createDefaultDeviceData = (address: string): DeviceData => ({
  address,
  pv: null,
  sv: null,
  tv: null,
  fv: null,
  units: 'N/A',
  lastUpdate: null,
  online: false,
})

export const useDeviceStore = create<DeviceStore>((set, get) => ({
  connected: false,
  deviceAddress: '0x00',
  pv: null,
  sv: null,
  tv: null,
  fv: null,
  units: 'N/A',
  lastUpdate: null,
  polling: false,
  pollInterval: 1000,
  isConnected: false,
  isPolling: false,
  audioInitialized: false,

  stats: {
    packetsSent: 0,
    packetsReceived: 0,
    errors: 0,
    lastPacketTime: null,
  },

  logs: [],
  waveformData: [],

  devices: new Map<string, DeviceData>(),
  deviceHistory: new Map<string, HistoryPoint[]>(),
  multiDeviceConfig: {
    enabled: false,
    startAddress: 0,
    endAddress: 15,
    pollDelay: 500,
  },
  selectedDevice: '0x00',
  maxHistoryPoints: 100,

  connect: () => set({ connected: true, isConnected: true }),
  disconnect: () =>
    set({
      connected: false,
      isConnected: false,
      polling: false,
      isPolling: false,
    }),

  setDeviceAddress: (address) => set({ deviceAddress: address }),

  updatePV: (value) => set({ pv: value, lastUpdate: new Date() }),
  updateSV: (value) => set({ sv: value, lastUpdate: new Date() }),
  updateTV: (value) => set({ tv: value, lastUpdate: new Date() }),
  updateFV: (value) => set({ fv: value, lastUpdate: new Date() }),

  setUnits: (units) => set({ units }),

  startPolling: () => set({ polling: true, isPolling: true }),
  stopPolling: () => set({ polling: false, isPolling: false }),
  setPollInterval: (interval) => set({ pollInterval: interval }),

  addLog: (type, message, data) =>
    set((state) => ({
      logs: [
        {
          timestamp: new Date(),
          type,
          message,
          data,
        },
        ...state.logs.slice(0, 99),
      ],
    })),

  clearLogs: () => set({ logs: [] }),

  incrementSent: () =>
    set((state) => ({
      stats: {
        ...state.stats,
        packetsSent: state.stats.packetsSent + 1,
      },
    })),

  incrementReceived: () =>
    set((state) => ({
      stats: {
        ...state.stats,
        packetsReceived: state.stats.packetsReceived + 1,
        lastPacketTime: new Date(),
      },
    })),

  incrementErrors: () =>
    set((state) => ({
      stats: {
        ...state.stats,
        errors: state.stats.errors + 1,
      },
    })),

  setWaveformData: (data) => set({ waveformData: data }),

  setAudioInitialized: (initialized) => set({ audioInitialized: initialized }),

  reset: () =>
    set({
      pv: null,
      sv: null,
      tv: null,
      fv: null,
      units: 'N/A',
      lastUpdate: null,
      stats: {
        packetsSent: 0,
        packetsReceived: 0,
        errors: 0,
        lastPacketTime: null,
      },
      logs: [],
      devices: new Map(),
      deviceHistory: new Map(),
    }),

  updateDeviceData: (address, data) =>
    set((state) => {
      const devices = new Map(state.devices)
      const existing = devices.get(address) || createDefaultDeviceData(address)
      devices.set(address, {
        ...existing,
        ...data,
        address,
        online: true,
        lastUpdate: new Date(),
      })
      return { devices }
    }),

  addHistoryPoint: (address, point) =>
    set((state) => {
      const deviceHistory = new Map(state.deviceHistory)
      const history = deviceHistory.get(address) || []
      const newPoint: HistoryPoint = {
        ...point,
        timestamp: Date.now(),
      }
      history.push(newPoint)
      if (history.length > state.maxHistoryPoints) {
        history.shift()
      }
      deviceHistory.set(address, history)
      return { deviceHistory }
    }),

  getDeviceData: (address) => get().devices.get(address),

  getDeviceHistory: (address) => get().deviceHistory.get(address) || [],

  getAllDevices: () => Array.from(get().devices.values()),

  getOnlineDevices: () => Array.from(get().devices.values()).filter((d) => d.online),

  setSelectedDevice: (address) => set({ selectedDevice: address, deviceAddress: address }),

  setMultiDeviceConfig: (config) =>
    set((state) => ({
      multiDeviceConfig: { ...state.multiDeviceConfig, ...config },
    })),

  clearDeviceHistory: (address) =>
    set((state) => {
      const deviceHistory = new Map(state.deviceHistory)
      if (address) {
        deviceHistory.delete(address)
      } else {
        deviceHistory.clear()
      }
      return { deviceHistory }
    }),

  markDeviceOffline: (address) =>
    set((state) => {
      const devices = new Map(state.devices)
      const device = devices.get(address)
      if (device) {
        devices.set(address, { ...device, online: false })
      }
      return { devices }
    }),
}))
