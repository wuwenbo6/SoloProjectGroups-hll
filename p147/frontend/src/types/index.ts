export interface BackupRoute {
  enabled: boolean
  serialPort: string
  baudRate: number
  dataBits: number
  parity: string
  stopBits: number
  slaveId: number
  autoFailback: boolean
  failbackInterval: number
}

export interface Route {
  id: number
  ipAddress: string
  serialPort: string
  baudRate: number
  dataBits: number
  parity: string
  stopBits: number
  slaveId: number
  enabled: boolean
  backup: BackupRoute
  activePath: string
  serialError?: string
  hasError?: boolean
}

export interface UnitTimeoutStat {
  timeoutCount: number
  totalCount: number
  lastTimeout: string
}

export interface RouteStats {
  PacketsSent: number
  PacketsReceived: number
  BytesSent: number
  BytesReceived: number
  Errors: number
  LastActivity: string
  UnitTimeouts: Record<string, UnitTimeoutStat>
}

export interface SystemStatus {
  modbusTcpPort: number
  httpPort: number
  modbusTcpRunning: boolean
  httpRunning: boolean
  serialErrors: Record<string, string>
  startupTime: string
}

export interface TestRequest {
  routeId: number
  functionCode: number
  address: number
  quantity: number
  value: number
}

export interface TestResponse {
  success: boolean
  data?: any
  error?: string
}

export interface ApiResponse<T> {
  data?: T
  error?: string
  message?: string
}
