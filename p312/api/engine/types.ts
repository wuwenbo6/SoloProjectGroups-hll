export type ZoneState =
  | 'empty'
  | 'implicitly_opened'
  | 'explicitly_opened'
  | 'closed'
  | 'full'

export interface Zone {
  id: number
  state: ZoneState
  writePointer: number
  capacity: number
  createdAt: string
  updatedAt: string
}

export interface Namespace {
  id: string
  zoneCount: number
  zoneCapacity: number
  zones: Zone[]
  createdAt: string
}

export interface NamespaceStatus {
  totalZones: number
  zoneCapacity: number
  emptyCount: number
  implicitlyOpenedCount: number
  explicitlyOpenedCount: number
  closedCount: number
  fullCount: number
}

export interface OperationLog {
  timestamp: string
  zoneId: number
  operation: string
  fromState: ZoneState
  toState: ZoneState
  detail: string
}
