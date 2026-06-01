export type SlaveProtocol = 'tcp' | 'rtu'

export type RegisterType = 'holding' | 'input' | 'coil' | 'discrete'

export interface SlaveConfig {
  id: string
  name: string
  protocol: SlaveProtocol
  unitId: number
  tcpPort?: number
  tcpHost?: string
  serialPort?: string
  baudRate?: number
  parity?: 'none' | 'even' | 'odd'
  stopBits?: 1 | 2
  dataBits?: 7 | 8
  responseDelay: number
  isRunning: boolean
}

export interface RegisterValue {
  address: number
  value: number | boolean
}

export interface SlaveRegisters {
  holding: Map<number, number>
  input: Map<number, number>
  coil: Map<number, boolean>
  discrete: Map<number, boolean>
}

export interface IllegalAddresses {
  holding: Set<number>
  input: Set<number>
  coil: Set<number>
  discrete: Set<number>
}

export interface MasterConfig {
  protocol: SlaveProtocol
  tcpHost?: string
  tcpPort?: number
  serialPort?: string
  baudRate?: number
  parity?: 'none' | 'even' | 'odd'
  stopBits?: 1 | 2
  dataBits?: 7 | 8
  unitId: number
  timeout?: number
}

export interface DataRecord {
  timestamp: number
  type: RegisterType
  address: number
  oldValue: number | boolean
  newValue: number | boolean
  source: 'script' | 'master' | 'ui'
}

export interface ScriptConfig {
  id: string
  slaveId: string
  name: string
  code: string
  isRunning: boolean
}

export interface SimulationConfig {
  version: string
  exportedAt: string
  slaves: Array<{
    config: SlaveConfig
    registers: {
      holding: Array<{ address: number; value: number }>
      input: Array<{ address: number; value: number }>
      coil: Array<{ address: number; value: boolean }>
      discrete: Array<{ address: number; value: boolean }>
    }
    illegalAddresses: {
      holding: number[]
      input: number[]
      coil: number[]
      discrete: number[]
    }
  }>
  scripts: ScriptConfig[]
}
