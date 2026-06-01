export interface BlockData {
  blockNumber: number
  data: number[]
  isReadOnly: boolean
  isTrailer: boolean
  isValueBlock: boolean
}

export interface ValueBlockInfo {
  value: number
  address: number
  valid: boolean
}

export interface SectorData {
  sectorNumber: number
  blocks: BlockData[]
  keyA: number[]
  keyB: number[]
  accessBits: number[]
  authenticated: boolean
  authenticatedWith: 'A' | 'B' | null
}

export interface AuthResult {
  success: boolean
  sector: number
  keyType: 'A' | 'B'
  error?: string
}

export interface ReaderInfo {
  id: string
  name: string
  isVirtual: boolean
  connected: boolean
}

export interface LogEntry {
  id: string
  timestamp: number
  direction: 'send' | 'recv' | 'info' | 'error'
  message: string
  data?: string
}

export interface CardState {
  sectors: SectorData[]
  readerInfo: ReaderInfo
  selectedSector: number | null
  selectedBlock: number | null
  logs: LogEntry[]
}

export interface KeyEntry {
  id: string
  name: string
  sector: number
  keyType: 'A' | 'B'
  key: number[]
  createdAt: number
}

export interface KeyDictionary {
  entries: KeyEntry[]
}

export interface DumpExportResult {
  success: boolean
  path?: string
  error?: string
}
