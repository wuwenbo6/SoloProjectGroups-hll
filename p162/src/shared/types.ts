export interface HARTFrame {
  preamble: number[]
  delimiter: number
  address: number[]
  command: number
  byteCount: number
  data: number[]
  checksum: number
}

export interface HARTResponse {
  responseCode: number
  deviceStatus: number
  data: number[]
  pv?: number
  sv?: number
  tv?: number
  fv?: number
  units?: string
}

export interface DeviceData {
  address: string
  pv: number | null
  sv: number | null
  tv: number | null
  fv: number | null
  units: string
  lastUpdate: Date | null
  online: boolean
}

export interface HistoryPoint {
  timestamp: number
  address: string
  pv: number | null
  sv: number | null
  tv: number | null
  fv: number | null
}

export interface DeviceState {
  connected: boolean
  deviceAddress: string
  pv: number | null
  sv: number | null
  tv: number | null
  fv: number | null
  units: string
  lastUpdate: Date | null
  polling: boolean
  pollInterval: number
}

export interface MultiDeviceConfig {
  enabled: boolean
  startAddress: number
  endAddress: number
  pollDelay: number
}

export interface AudioConfig {
  sampleRate: number
  inputDeviceId?: string
  outputDeviceId?: string
  bufferSize: number
}

export interface FSKConfig {
  markFrequency: number
  spaceFrequency: number
  baudRate: number
}

export interface CommunicationStats {
  packetsSent: number
  packetsReceived: number
  errors: number
  lastPacketTime: Date | null
}

export interface LogEntry {
  timestamp: Date
  type: 'send' | 'receive' | 'error' | 'info'
  message: string
  data?: string
}

export type HARTCommand = {
  id: number
  name: string
  description: string
}

export const HART_COMMANDS: HARTCommand[] = [
  { id: 0, name: 'Read Unique Identifier', description: 'Read device unique identifier' },
  { id: 1, name: 'Read Primary Variable', description: 'Read process variable (PV)' },
  { id: 2, name: 'Read Loop Current', description: 'Read loop current and percent of range' },
  { id: 3, name: 'Read Dynamic Variables', description: 'Read PV, SV, TV, FV' },
  { id: 15, name: 'Read Device Information', description: 'Read device tag, descriptor, date' },
  { id: 16, name: 'Read Device Variables', description: 'Read all device variables' },
  { id: 44, name: 'Write Primary Variable Range', description: 'Set PV range values' },
  { id: 47, name: 'Write Loop Current Mode', description: 'Set loop current mode' },
]
