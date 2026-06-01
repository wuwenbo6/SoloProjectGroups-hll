import { create } from 'zustand'

interface SensorReading {
  value: number
  timestamp: number
  sequence: number
}

interface ResourceInfo {
  uri: string
  name: string
  unit: string
  icon: string
}

interface ResourceState {
  currentValue: number
  lastUpdated: number
  min: number
  max: number
  avg: number
  history: SensorReading[]
}

interface SensorStore {
  resources: Record<string, ResourceState>
  resourceList: ResourceInfo[]
  connectionStatus: {
    coapServer: 'online' | 'offline'
    observer: 'active' | 'inactive'
  }
  paused: boolean

  updateSensorData: (resource: string, value: number, unit: string, timestamp: number, sequence?: number) => void
  setResourceList: (resources: ResourceInfo[]) => void
  setConnectionStatus: (coapServer: 'online' | 'offline', observer: 'active' | 'inactive') => void
  togglePause: () => void
  exportAllCsv: () => void
  exportResourceCsv: (uri: string) => void
}

const initialState: Record<string, ResourceState> = {
  '/sensors/temperature': {
    currentValue: 25,
    lastUpdated: Date.now(),
    min: 25,
    max: 25,
    avg: 25,
    history: [],
  },
  '/sensors/humidity': {
    currentValue: 55,
    lastUpdated: Date.now(),
    min: 55,
    max: 55,
    avg: 55,
    history: [],
  },
}

function downloadCsv(filename: string, csvContent: string) {
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export const useSensorStore = create<SensorStore>((set, get) => ({
  resources: initialState,
  resourceList: [],
  connectionStatus: {
    coapServer: 'offline',
    observer: 'inactive',
  },
  paused: false,

  updateSensorData: (resource, value, _unit, timestamp, sequence) => {
    if (get().paused) return
    set((state) => {
      const current = state.resources[resource]
      if (!current) return state

      const newHistory = [...current.history, { value, timestamp, sequence: sequence ?? -1 }]
      if (newHistory.length > 120) newHistory.shift()

      const allValues = newHistory.map((r) => r.value)
      const min = Math.min(...allValues)
      const max = Math.max(...allValues)
      const avg = Math.round((allValues.reduce((a, b) => a + b, 0) / allValues.length) * 10) / 10

      return {
        resources: {
          ...state.resources,
          [resource]: {
            currentValue: value,
            lastUpdated: timestamp,
            min,
            max,
            avg,
            history: newHistory,
          },
        },
      }
    })
  },

  setResourceList: (resources) => set({ resourceList: resources }),

  setConnectionStatus: (coapServer, observer) =>
    set({ connectionStatus: { coapServer, observer } }),

  togglePause: () => set((state) => ({ paused: !state.paused })),

  exportAllCsv: () => {
    const { resources, resourceList } = get()
    const lines: string[] = ['Resource,Name,Value,Unit,Timestamp,Sequence']

    for (const info of resourceList) {
      const resState = resources[info.uri]
      if (!resState) continue
      for (const reading of resState.history) {
        const time = new Date(reading.timestamp).toISOString()
        lines.push(`${info.uri},${info.name},${reading.value},${info.unit},${time},${reading.sequence}`)
      }
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    downloadCsv(`coap-observe-data-${timestamp}.csv`, lines.join('\n'))
  },

  exportResourceCsv: (uri: string) => {
    const { resources, resourceList } = get()
    const info = resourceList.find((r) => r.uri === uri)
    const resState = resources[uri]
    if (!info || !resState) return

    const lines: string[] = ['Timestamp,Value,Unit,Sequence']
    for (const reading of resState.history) {
      const time = new Date(reading.timestamp).toISOString()
      lines.push(`${time},${reading.value},${info.unit},${reading.sequence}`)
    }

    const safeName = uri.replace(/\//g, '_')
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    downloadCsv(`coap-${safeName}-${timestamp}.csv`, lines.join('\n'))
  },
}))
