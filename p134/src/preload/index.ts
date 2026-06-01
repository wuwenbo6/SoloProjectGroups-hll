import { contextBridge, ipcRenderer } from 'electron'

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

contextBridge.exposeInMainWorld('electronAPI', {
  slave: {
    list: (): Promise<SlaveConfig[]> => ipcRenderer.invoke('slave:list'),
    add: (config: Omit<SlaveConfig, 'id' | 'isRunning'>): Promise<SlaveConfig> => 
      ipcRenderer.invoke('slave:add', config),
    update: (id: string, config: Partial<SlaveConfig>): Promise<SlaveConfig | null> => 
      ipcRenderer.invoke('slave:update', id, config),
    delete: (id: string): Promise<boolean> => 
      ipcRenderer.invoke('slave:delete', id),
    start: (id: string): Promise<boolean> => 
      ipcRenderer.invoke('slave:start', id),
    stop: (id: string): Promise<boolean> => 
      ipcRenderer.invoke('slave:stop', id),
    
    getRegisters: (id: string): Promise<{
      holding: [number, number][]
      input: [number, number][]
      coil: [number, boolean][]
      discrete: [number, boolean][]
    } | null> => ipcRenderer.invoke('slave:getRegisters', id),
    
    updateRegister: (id: string, type: RegisterType, address: number, value: number | boolean): Promise<boolean> =>
      ipcRenderer.invoke('slave:updateRegister', id, type, address, value),
    
    batchUpdateRegisters: (id: string, type: RegisterType, startAddress: number, values: (number | boolean)[]): Promise<boolean> =>
      ipcRenderer.invoke('slave:batchUpdateRegisters', id, type, startAddress, values),
    
    getIllegalAddresses: (id: string): Promise<{
      holding: number[]
      input: number[]
      coil: number[]
      discrete: number[]
    } | null> => ipcRenderer.invoke('slave:getIllegalAddresses', id),
    
    addIllegalAddress: (id: string, type: RegisterType, address: number): Promise<boolean> =>
      ipcRenderer.invoke('slave:addIllegalAddress', id, type, address),
    
    removeIllegalAddress: (id: string, type: RegisterType, address: number): Promise<boolean> =>
      ipcRenderer.invoke('slave:removeIllegalAddress', id, type, address)
  },
  
  master: {
    readHoldingRegisters: (config: MasterConfig, address: number, length: number): Promise<{ data: number[] }> =>
      ipcRenderer.invoke('master:readHoldingRegisters', config, address, length),
    readInputRegisters: (config: MasterConfig, address: number, length: number): Promise<{ data: number[] }> =>
      ipcRenderer.invoke('master:readInputRegisters', config, address, length),
    readCoils: (config: MasterConfig, address: number, length: number): Promise<{ data: boolean[] }> =>
      ipcRenderer.invoke('master:readCoils', config, address, length),
    readDiscreteInputs: (config: MasterConfig, address: number, length: number): Promise<{ data: boolean[] }> =>
      ipcRenderer.invoke('master:readDiscreteInputs', config, address, length),
    writeSingleRegister: (config: MasterConfig, address: number, value: number): Promise<{ address: number; value: number }> =>
      ipcRenderer.invoke('master:writeSingleRegister', config, address, value),
    writeMultipleRegisters: (config: MasterConfig, address: number, values: number[]): Promise<{ address: number; length: number }> =>
      ipcRenderer.invoke('master:writeMultipleRegisters', config, address, values),
    writeSingleCoil: (config: MasterConfig, address: number, value: boolean): Promise<{ address: number; value: boolean }> =>
      ipcRenderer.invoke('master:writeSingleCoil', config, address, value)
  },
  
  script: {
    list: (): Promise<ScriptConfig[]> => ipcRenderer.invoke('script:list'),
    create: (slaveId: string, name: string, code: string): Promise<ScriptConfig> =>
      ipcRenderer.invoke('script:create', slaveId, name, code),
    update: (id: string, updates: Partial<ScriptConfig>): Promise<ScriptConfig | null> =>
      ipcRenderer.invoke('script:update', id, updates),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke('script:delete', id),
    start: (id: string): Promise<boolean> => ipcRenderer.invoke('script:start', id),
    stop: (id: string): Promise<boolean> => ipcRenderer.invoke('script:stop', id)
  },
  
  data: {
    getHistory: (slaveId: string): Promise<DataRecord[]> =>
      ipcRenderer.invoke('data:getHistory', slaveId),
    clearHistory: (slaveId: string): Promise<void> =>
      ipcRenderer.invoke('data:clearHistory', slaveId),
    setRecording: (enabled: boolean): Promise<void> =>
      ipcRenderer.invoke('data:setRecording', enabled)
  },
  
  config: {
    export: (): Promise<SimulationConfig> => ipcRenderer.invoke('config:export'),
    import: (config: SimulationConfig): Promise<{ slaves: string[]; scripts: string[] }> =>
      ipcRenderer.invoke('config:import', config)
  }
})

declare global {
  interface Window {
    electronAPI: {
      slave: {
        list: () => Promise<SlaveConfig[]>
        add: (config: Omit<SlaveConfig, 'id' | 'isRunning'>) => Promise<SlaveConfig>
        update: (id: string, config: Partial<SlaveConfig>) => Promise<SlaveConfig | null>
        delete: (id: string) => Promise<boolean>
        start: (id: string) => Promise<boolean>
        stop: (id: string) => Promise<boolean>
        getRegisters: (id: string) => Promise<{
          holding: [number, number][]
          input: [number, number][]
          coil: [number, boolean][]
          discrete: [number, boolean][]
        } | null>
        updateRegister: (id: string, type: RegisterType, address: number, value: number | boolean) => Promise<boolean>
        batchUpdateRegisters: (id: string, type: RegisterType, startAddress: number, values: (number | boolean)[]) => Promise<boolean>
        getIllegalAddresses: (id: string) => Promise<{
          holding: number[]
          input: number[]
          coil: number[]
          discrete: number[]
        } | null>
        addIllegalAddress: (id: string, type: RegisterType, address: number) => Promise<boolean>
        removeIllegalAddress: (id: string, type: RegisterType, address: number) => Promise<boolean>
      }
      master: {
        readHoldingRegisters: (config: MasterConfig, address: number, length: number) => Promise<{ data: number[] }>
        readInputRegisters: (config: MasterConfig, address: number, length: number) => Promise<{ data: number[] }>
        readCoils: (config: MasterConfig, address: number, length: number) => Promise<{ data: boolean[] }>
        readDiscreteInputs: (config: MasterConfig, address: number, length: number) => Promise<{ data: boolean[] }>
        writeSingleRegister: (config: MasterConfig, address: number, value: number) => Promise<{ address: number; value: number }>
        writeMultipleRegisters: (config: MasterConfig, address: number, values: number[]) => Promise<{ address: number; length: number }>
        writeSingleCoil: (config: MasterConfig, address: number, value: boolean) => Promise<{ address: number; value: boolean }>
      }
      script: {
        list: () => Promise<ScriptConfig[]>
        create: (slaveId: string, name: string, code: string) => Promise<ScriptConfig>
        update: (id: string, updates: Partial<ScriptConfig>) => Promise<ScriptConfig | null>
        delete: (id: string) => Promise<boolean>
        start: (id: string) => Promise<boolean>
        stop: (id: string) => Promise<boolean>
      }
      data: {
        getHistory: (slaveId: string) => Promise<DataRecord[]>
        clearHistory: (slaveId: string) => Promise<void>
        setRecording: (enabled: boolean) => Promise<void>
      }
      config: {
        export: () => Promise<SimulationConfig>
        import: (config: SimulationConfig) => Promise<{ slaves: string[]; scripts: string[] }>
      }
    }
  }
}
