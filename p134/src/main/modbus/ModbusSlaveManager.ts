import * as net from 'net'
import { SerialPort } from 'serialport'
import ModbusRTU from 'modbus-serial'
import * as fengari from 'fengari'
import { interop } from 'fengari-interop'
import type { SlaveConfig, SlaveRegisters, IllegalAddresses, RegisterType, MasterConfig, SlaveProtocol, DataRecord, ScriptConfig, SimulationConfig } from './types'

const { lua, lauxlib, lualib, to_luastring, to_jsstring, to_jsnumber, to_luanumber } = fengari

class Mutex {
  private queue: Array<() => void> = []
  private locked = false

  async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true
      return
    }
    return new Promise<void>(resolve => this.queue.push(resolve))
  }

  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()
      next?.()
    } else {
      this.locked = false
    }
  }
}

interface ScriptInstance {
  config: ScriptConfig
  luaState: any
  isRunning: boolean
  intervalId?: NodeJS.Timeout
}

interface SlaveInstance {
  config: SlaveConfig
  registers: SlaveRegisters
  illegalAddresses: IllegalAddresses
  tcpServer?: net.Server
  serialPort?: SerialPort
  tcpClients: Map<string, net.Socket>
  mutex: Mutex
  dataHistory: DataRecord[]
}

const EXCEPTION_CODES = {
  ILLEGAL_FUNCTION: 0x01,
  ILLEGAL_DATA_ADDRESS: 0x02,
  ILLEGAL_DATA_VALUE: 0x03,
  SLAVE_DEVICE_FAILURE: 0x04
}
  
export class ModbusSlaveManager {
  private slaves: Map<string, SlaveInstance> = new Map()
  private scripts: Map<string, ScriptInstance> = new Map()
  private dataRecordingEnabled = true
  private maxHistorySize = 10000

  getSlaves(): SlaveConfig[] {
    return Array.from(this.slaves.values()).map(s => s.config)
  }

  addSlave(config: Omit<SlaveConfig, 'id' | 'isRunning'>): SlaveConfig {
    const id = `slave_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const newConfig: SlaveConfig = {
      ...config,
      id,
      isRunning: false
    }
    
    const registers: SlaveRegisters = {
      holding: new Map(),
      input: new Map(),
      coil: new Map(),
      discrete: new Map()
    }
    
    const illegalAddresses: IllegalAddresses = {
      holding: new Set(),
      input: new Set(),
      coil: new Set(),
      discrete: new Set()
    }
    
    for (let i = 0; i < 100; i++) {
      registers.holding.set(i, 0)
      registers.input.set(i, 0)
      registers.coil.set(i, false)
      registers.discrete.set(i, false)
    }
    
    this.slaves.set(id, {
      config: newConfig,
      registers,
      illegalAddresses,
      tcpClients: new Map(),
      mutex: new Mutex(),
      dataHistory: []
    })
    
    return newConfig
  }

  updateSlave(id: string, config: Partial<SlaveConfig>): SlaveConfig | null {
    const slave = this.slaves.get(id)
    if (!slave) return null
    
    const wasRunning = slave.config.isRunning
    if (wasRunning && (config.protocol !== undefined || config.tcpPort !== undefined || 
        config.serialPort !== undefined || config.unitId !== undefined)) {
      this.stopSlave(id)
    }
    
    slave.config = { ...slave.config, ...config }
    
    if (wasRunning && !slave.config.isRunning) {
      this.startSlave(id)
    }
    
    return slave.config
  }

  deleteSlave(id: string): boolean {
    const slave = this.slaves.get(id)
    if (!slave) return false
    
    this.stopSlave(id)
    this.slaves.delete(id)
    return true
  }

  async startSlave(id: string): Promise<boolean> {
    const slave = this.slaves.get(id)
    if (!slave || slave.config.isRunning) return false
    
    try {
      if (slave.config.protocol === 'tcp') {
        await this.startTcpSlave(slave)
      } else {
        await this.startRtuSlave(slave)
      }
      slave.config.isRunning = true
      return true
    } catch (e) {
      console.error('Failed to start slave:', e)
      return false
    }
  }

  stopSlave(id: string): boolean {
    const slave = this.slaves.get(id)
    if (!slave) return false
    
    try {
      if (slave.tcpServer) {
        slave.tcpServer.close()
        slave.tcpClients.forEach(client => client.destroy())
        slave.tcpClients.clear()
        slave.tcpServer = undefined
      }
      
      if (slave.serialPort) {
        slave.serialPort.close()
        slave.serialPort = undefined
      }
      
      slave.config.isRunning = false
      return true
    } catch (e) {
      console.error('Failed to stop slave:', e)
      return false
    }
  }

  stopAllSlaves(): void {
    for (const id of this.slaves.keys()) {
      this.stopSlave(id)
    }
  }

  getRegisters(id: string): { 
    holding: [number, number][], 
    input: [number, number][], 
    coil: [number, boolean][], 
    discrete: [number, boolean][] 
  } | null {
    const slave = this.slaves.get(id)
    if (!slave) return null
    
    return {
      holding: Array.from(slave.registers.holding.entries()).sort((a, b) => a[0] - b[0]),
      input: Array.from(slave.registers.input.entries()).sort((a, b) => a[0] - b[0]),
      coil: Array.from(slave.registers.coil.entries()).sort((a, b) => a[0] - b[0]),
      discrete: Array.from(slave.registers.discrete.entries()).sort((a, b) => a[0] - b[0])
    }
  }

  updateRegister(id: string, type: RegisterType, address: number, value: number | boolean): boolean {
    const slave = this.slaves.get(id)
    if (!slave) return false
    
    const registers = slave.registers[type] as Map<number, number | boolean>
    registers.set(address, value)
    return true
  }

  batchUpdateRegisters(id: string, type: RegisterType, startAddress: number, values: (number | boolean)[]): boolean {
    const slave = this.slaves.get(id)
    if (!slave) return false
    
    const registers = slave.registers[type] as Map<number, number | boolean>
    values.forEach((value, index) => {
      registers.set(startAddress + index, value)
    })
    return true
  }

  getIllegalAddresses(id: string): { holding: number[], input: number[], coil: number[], discrete: number[] } | null {
    const slave = this.slaves.get(id)
    if (!slave) return null
    
    return {
      holding: Array.from(slave.illegalAddresses.holding).sort((a, b) => a - b),
      input: Array.from(slave.illegalAddresses.input).sort((a, b) => a - b),
      coil: Array.from(slave.illegalAddresses.coil).sort((a, b) => a - b),
      discrete: Array.from(slave.illegalAddresses.discrete).sort((a, b) => a - b)
    }
  }

  addIllegalAddress(id: string, type: RegisterType, address: number): boolean {
    const slave = this.slaves.get(id)
    if (!slave) return false
    
    slave.illegalAddresses[type].add(address)
    return true
  }

  removeIllegalAddress(id: string, type: RegisterType, address: number): boolean {
    const slave = this.slaves.get(id)
    if (!slave) return false
    
    return slave.illegalAddresses[type].delete(address)
  }

  private async startTcpSlave(slave: SlaveInstance): Promise<void> {
    const port = slave.config.tcpPort || 502
    const host = slave.config.tcpHost || '0.0.0.0'
    
    return new Promise((resolve, reject) => {
      const server = net.createServer((socket) => {
        const clientId = `${socket.remoteAddress}:${socket.remotePort}`
        slave.tcpClients.set(clientId, socket)
        
        socket.on('data', (data) => {
          this.handleTcpRequest(slave, socket, data)
        })
        
        socket.on('close', () => {
          slave.tcpClients.delete(clientId)
        })
        
        socket.on('error', (err) => {
          console.error('TCP socket error:', err)
          slave.tcpClients.delete(clientId)
        })
      })
      
      server.listen(port, host, () => {
        slave.tcpServer = server
        resolve()
      })
      
      server.on('error', (err) => {
        reject(err)
      })
    })
  }

  private async startRtuSlave(slave: SlaveInstance): Promise<void> {
    const portName = slave.config.serialPort || '/dev/ttyUSB0'
    const baudRate = slave.config.baudRate || 9600
    const parity = slave.config.parity || 'none'
    const stopBits = slave.config.stopBits || 1
    const dataBits = slave.config.dataBits || 8
    
    const parityMap: Record<string, 'none' | 'even' | 'odd'> = {
      'none': 'none',
      'even': 'even',
      'odd': 'odd'
    }
    
    return new Promise((resolve, reject) => {
      const serialPort = new SerialPort({
        path: portName,
        baudRate,
        parity: parityMap[parity],
        stopBits,
        dataBits
      })
      
      let buffer = Buffer.alloc(0)
      
      serialPort.on('open', () => {
        slave.serialPort = serialPort
        resolve()
      })
      
      serialPort.on('data', (data: Buffer) => {
        buffer = Buffer.concat([buffer, data])
        
        while (buffer.length >= 4) {
          const unitId = buffer[0]
          const functionCode = buffer[1]
          
          if (unitId !== slave.config.unitId && unitId !== 0) {
            buffer = buffer.slice(1)
            continue
          }
          
          let expectedLength = 0
          switch (functionCode) {
            case 0x01:
            case 0x02:
            case 0x03:
            case 0x04:
            case 0x05:
            case 0x06:
              expectedLength = 8
              break
            case 0x0F:
            case 0x10:
              if (buffer.length >= 7) {
                expectedLength = 7 + buffer[6] + 2
              }
              break
            default:
              buffer = buffer.slice(1)
              continue
          }
          
          if (buffer.length >= expectedLength) {
            const pdu = buffer.slice(0, expectedLength)
            const crc = this.calculateCRC(pdu.slice(0, -2))
            const receivedCrc = pdu.readUInt16LE(pdu.length - 2)
            
            if (crc === receivedCrc) {
              this.handleRtuRequest(slave, serialPort, pdu)
            }
            
            buffer = buffer.slice(expectedLength)
          } else {
            break
          }
        }
      })
      
      serialPort.on('error', (err) => {
        reject(err)
      })
    })
  }

  private calculateCRC(data: Buffer): number {
    let crc = 0xFFFF
    for (let i = 0; i < data.length; i++) {
      crc ^= data[i]
      for (let j = 0; j < 8; j++) {
        if (crc & 0x0001) {
          crc >>= 1
          crc ^= 0xA001
        } else {
          crc >>= 1
        }
      }
    }
    return crc
  }

  private async handleTcpRequest(slave: SlaveInstance, socket: net.Socket, data: Buffer): Promise<void> {
    if (data.length < 12) return
    
    const transactionId = data.readUInt16BE(0)
    const protocolId = data.readUInt16BE(2)
    const length = data.readUInt16BE(4)
    const unitId = data[6]
    
    if (protocolId !== 0) return
    if (unitId !== slave.config.unitId && unitId !== 0) return
    
    const pdu = data.slice(7, 7 + length - 1)
    const response = await this.processPDU(slave, unitId, pdu)
    
    const mbapHeader = Buffer.alloc(7)
    mbapHeader.writeUInt16BE(transactionId, 0)
    mbapHeader.writeUInt16BE(0, 2)
    mbapHeader.writeUInt16BE(response.length, 4)
    mbapHeader[6] = unitId
    
    const tcpResponse = Buffer.concat([mbapHeader, response])
    socket.write(tcpResponse)
  }

  private async handleRtuRequest(slave: SlaveInstance, serialPort: SerialPort, pdu: Buffer): Promise<void> {
    const unitId = pdu[0]
    const functionCode = pdu[1]
    
    if (unitId !== slave.config.unitId && unitId !== 0) return
    
    const response = await this.processPDU(slave, unitId, pdu.slice(1, -2))
    
    const rtuResponse = Buffer.alloc(response.length + 3)
    rtuResponse[0] = unitId
    response.copy(rtuResponse, 1)
    
    const crc = this.calculateCRC(rtuResponse.slice(0, -2))
    rtuResponse.writeUInt16LE(crc, rtuResponse.length - 2)
    
    serialPort.write(rtuResponse)
  }

  private async processPDU(slave: SlaveInstance, unitId: number, pdu: Buffer): Promise<Buffer> {
    await new Promise(resolve => setTimeout(resolve, slave.config.responseDelay))
    
    const functionCode = pdu[0]
    
    await slave.mutex.acquire()
    try {
      switch (functionCode) {
        case 0x01:
          return this.readCoils(slave, pdu)
        case 0x02:
          return this.readDiscreteInputs(slave, pdu)
        case 0x03:
          return this.readHoldingRegisters(slave, pdu)
        case 0x04:
          return this.readInputRegisters(slave, pdu)
        case 0x05:
          return this.writeSingleCoil(slave, pdu)
        case 0x06:
          return this.writeSingleRegister(slave, pdu)
        case 0x0F:
          return this.writeMultipleCoils(slave, pdu)
        case 0x10:
          return this.writeMultipleRegisters(slave, pdu)
        default:
          return this.buildException(functionCode, EXCEPTION_CODES.ILLEGAL_FUNCTION)
      }
    } catch (e) {
      if ((e as any).exceptionCode !== undefined) {
        return this.buildException(functionCode, (e as any).exceptionCode)
      }
      return this.buildException(functionCode, EXCEPTION_CODES.SLAVE_DEVICE_FAILURE)
    } finally {
      slave.mutex.release()
    }
  }

  private buildException(functionCode: number, exceptionCode: number): Buffer {
    const response = Buffer.alloc(2)
    response[0] = functionCode | 0x80
    response[1] = exceptionCode
    return response
  }

  private checkIllegalAddress(slave: SlaveInstance, type: RegisterType, address: number, count: number = 1): void {
    for (let i = 0; i < count; i++) {
      if (slave.illegalAddresses[type].has(address + i)) {
        const error = new Error('Illegal Data Address') as any
        error.exceptionCode = EXCEPTION_CODES.ILLEGAL_DATA_ADDRESS
        throw error
      }
    }
  }

  private readCoils(slave: SlaveInstance, pdu: Buffer): Buffer {
    const startAddress = pdu.readUInt16BE(1)
    const quantity = pdu.readUInt16BE(3)
    
    if (quantity < 1 || quantity > 2000) {
      const error = new Error('Illegal Data Value') as any
      error.exceptionCode = EXCEPTION_CODES.ILLEGAL_DATA_VALUE
      throw error
    }
    
    this.checkIllegalAddress(slave, 'coil', startAddress, quantity)
    
    const byteCount = Math.ceil(quantity / 8)
    const response = Buffer.alloc(2 + byteCount)
    response[0] = 0x01
    response[1] = byteCount
    
    for (let i = 0; i < quantity; i++) {
      const value = slave.registers.coil.get(startAddress + i) || false
      if (value) {
        const byteIndex = 2 + Math.floor(i / 8)
        const bitIndex = i % 8
        response[byteIndex] |= (1 << bitIndex)
      }
    }
    
    return response
  }

  private readDiscreteInputs(slave: SlaveInstance, pdu: Buffer): Buffer {
    const startAddress = pdu.readUInt16BE(1)
    const quantity = pdu.readUInt16BE(3)
    
    if (quantity < 1 || quantity > 2000) {
      const error = new Error('Illegal Data Value') as any
      error.exceptionCode = EXCEPTION_CODES.ILLEGAL_DATA_VALUE
      throw error
    }
    
    this.checkIllegalAddress(slave, 'discrete', startAddress, quantity)
    
    const byteCount = Math.ceil(quantity / 8)
    const response = Buffer.alloc(2 + byteCount)
    response[0] = 0x02
    response[1] = byteCount
    
    for (let i = 0; i < quantity; i++) {
      const value = slave.registers.discrete.get(startAddress + i) || false
      if (value) {
        const byteIndex = 2 + Math.floor(i / 8)
        const bitIndex = i % 8
        response[byteIndex] |= (1 << bitIndex)
      }
    }
    
    return response
  }

  private readHoldingRegisters(slave: SlaveInstance, pdu: Buffer): Buffer {
    const startAddress = pdu.readUInt16BE(1)
    const quantity = pdu.readUInt16BE(3)
    
    if (quantity < 1 || quantity > 125) {
      const error = new Error('Illegal Data Value') as any
      error.exceptionCode = EXCEPTION_CODES.ILLEGAL_DATA_VALUE
      throw error
    }
    
    this.checkIllegalAddress(slave, 'holding', startAddress, quantity)
    
    const response = Buffer.alloc(2 + quantity * 2)
    response[0] = 0x03
    response[1] = quantity * 2
    
    for (let i = 0; i < quantity; i++) {
      const value = slave.registers.holding.get(startAddress + i) || 0
      response.writeUInt16BE(value & 0xFFFF, 2 + i * 2)
    }
    
    return response
  }

  private readInputRegisters(slave: SlaveInstance, pdu: Buffer): Buffer {
    const startAddress = pdu.readUInt16BE(1)
    const quantity = pdu.readUInt16BE(3)
    
    if (quantity < 1 || quantity > 125) {
      const error = new Error('Illegal Data Value') as any
      error.exceptionCode = EXCEPTION_CODES.ILLEGAL_DATA_VALUE
      throw error
    }
    
    this.checkIllegalAddress(slave, 'input', startAddress, quantity)
    
    const response = Buffer.alloc(2 + quantity * 2)
    response[0] = 0x04
    response[1] = quantity * 2
    
    for (let i = 0; i < quantity; i++) {
      const value = slave.registers.input.get(startAddress + i) || 0
      response.writeUInt16BE(value & 0xFFFF, 2 + i * 2)
    }
    
    return response
  }

  private writeSingleCoil(slave: SlaveInstance, pdu: Buffer): Buffer {
    const address = pdu.readUInt16BE(1)
    const value = pdu.readUInt16BE(3)
    
    this.checkIllegalAddress(slave, 'coil', address)
    
    const coilValue = value === 0xFF00
    slave.registers.coil.set(address, coilValue)
    
    const response = Buffer.alloc(5)
    response[0] = 0x05
    response.writeUInt16BE(address, 1)
    response.writeUInt16BE(coilValue ? 0xFF00 : 0x0000, 3)
    
    return response
  }

  private writeSingleRegister(slave: SlaveInstance, pdu: Buffer): Buffer {
    const address = pdu.readUInt16BE(1)
    const value = pdu.readUInt16BE(3)
    
    this.checkIllegalAddress(slave, 'holding', address)
    
    slave.registers.holding.set(address, value)
    
    const response = Buffer.alloc(5)
    response[0] = 0x06
    response.writeUInt16BE(address, 1)
    response.writeUInt16BE(value, 3)
    
    return response
  }

  private writeMultipleCoils(slave: SlaveInstance, pdu: Buffer): Buffer {
    const startAddress = pdu.readUInt16BE(1)
    const quantity = pdu.readUInt16BE(3)
    const byteCount = pdu[5]
    
    if (quantity < 1 || quantity > 1968 || byteCount !== Math.ceil(quantity / 8)) {
      const error = new Error('Illegal Data Value') as any
      error.exceptionCode = EXCEPTION_CODES.ILLEGAL_DATA_VALUE
      throw error
    }
    
    this.checkIllegalAddress(slave, 'coil', startAddress, quantity)
    
    for (let i = 0; i < quantity; i++) {
      const byteIndex = 6 + Math.floor(i / 8)
      const bitIndex = i % 8
      const value = (pdu[byteIndex] & (1 << bitIndex)) !== 0
      slave.registers.coil.set(startAddress + i, value)
    }
    
    const response = Buffer.alloc(5)
    response[0] = 0x0F
    response.writeUInt16BE(startAddress, 1)
    response.writeUInt16BE(quantity, 3)
    
    return response
  }

  private writeMultipleRegisters(slave: SlaveInstance, pdu: Buffer): Buffer {
    const startAddress = pdu.readUInt16BE(1)
    const quantity = pdu.readUInt16BE(3)
    const byteCount = pdu[5]
    
    if (quantity < 1 || quantity > 123 || byteCount !== quantity * 2) {
      const error = new Error('Illegal Data Value') as any
      error.exceptionCode = EXCEPTION_CODES.ILLEGAL_DATA_VALUE
      throw error
    }
    
    this.checkIllegalAddress(slave, 'holding', startAddress, quantity)
    
    for (let i = 0; i < quantity; i++) {
      const value = pdu.readUInt16BE(6 + i * 2)
      slave.registers.holding.set(startAddress + i, value)
    }
    
    const response = Buffer.alloc(5)
    response[0] = 0x10
    response.writeUInt16BE(startAddress, 1)
    response.writeUInt16BE(quantity, 3)
    
    return response
  }

  private async safeClose(client: ModbusRTU): Promise<void> {
    try {
      if (client.isOpen) {
        client.close(() => {})
      }
    } catch (e) {
      console.warn('Error closing client:', e)
    }
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Operation "${operation}" timed out after ${timeoutMs}ms`))
      }, timeoutMs)
      
      promise
        .then(resolve)
        .catch(reject)
        .finally(() => clearTimeout(timeout))
    })
  }

  private async createMasterClient(config: MasterConfig): Promise<ModbusRTU> {
    const client = new ModbusRTU()
    const timeout = config.timeout || 5000
    
    if (config.protocol === 'tcp') {
      await this.withTimeout(
        client.connectTCP(config.tcpHost || '127.0.0.1', {
          port: config.tcpPort || 502,
          timeout: timeout,
          autoReconnect: false
        } as any),
        timeout,
        `Connect TCP ${config.tcpHost}:${config.tcpPort}`
      )
    } else {
      await this.withTimeout(
        client.connectRTUBuffered(config.serialPort || '/dev/ttyUSB0', {
          baudRate: config.baudRate || 9600,
          parity: config.parity || 'none',
          stopBits: config.stopBits || 1,
          dataBits: config.dataBits || 8
        }),
        timeout,
        `Connect RTU ${config.serialPort}`
      )
    }
    
    client.setID(config.unitId)
    client.setTimeout(timeout)
    
    return client
  }

  async masterReadHoldingRegisters(config: MasterConfig, address: number, length: number): Promise<{ data: number[] }> {
    const client = await this.createMasterClient(config)
    const timeout = config.timeout || 5000
    try {
      const result = await this.withTimeout(
        client.readHoldingRegisters(address, length),
        timeout,
        `ReadHoldingRegisters addr=${address} len=${length}`
      )
      return { data: result.data }
    } finally {
      await this.safeClose(client)
    }
  }

  async masterReadInputRegisters(config: MasterConfig, address: number, length: number): Promise<{ data: number[] }> {
    const client = await this.createMasterClient(config)
    const timeout = config.timeout || 5000
    try {
      const result = await this.withTimeout(
        client.readInputRegisters(address, length),
        timeout,
        `ReadInputRegisters addr=${address} len=${length}`
      )
      return { data: result.data }
    } finally {
      await this.safeClose(client)
    }
  }

  async masterReadCoils(config: MasterConfig, address: number, length: number): Promise<{ data: boolean[] }> {
    const client = await this.createMasterClient(config)
    const timeout = config.timeout || 5000
    try {
      const result = await this.withTimeout(
        client.readCoils(address, length),
        timeout,
        `ReadCoils addr=${address} len=${length}`
      )
      return { data: result.data }
    } finally {
      await this.safeClose(client)
    }
  }

  async masterReadDiscreteInputs(config: MasterConfig, address: number, length: number): Promise<{ data: boolean[] }> {
    const client = await this.createMasterClient(config)
    const timeout = config.timeout || 5000
    try {
      const result = await this.withTimeout(
        client.readDiscreteInputs(address, length),
        timeout,
        `ReadDiscreteInputs addr=${address} len=${length}`
      )
      return { data: result.data }
    } finally {
      await this.safeClose(client)
    }
  }

  async masterWriteSingleRegister(config: MasterConfig, address: number, value: number): Promise<{ address: number; value: number }> {
    const client = await this.createMasterClient(config)
    const timeout = config.timeout || 5000
    try {
      const result = await this.withTimeout(
        client.writeRegister(address, value),
        timeout,
        `WriteRegister addr=${address} val=${value}`
      )
      return { address: result.address, value: result.value }
    } finally {
      await this.safeClose(client)
    }
  }

  async masterWriteMultipleRegisters(config: MasterConfig, address: number, values: number[]): Promise<{ address: number; length: number }> {
    const client = await this.createMasterClient(config)
    const timeout = config.timeout || 5000
    try {
      const result = await this.withTimeout(
        client.writeRegisters(address, values),
        timeout,
        `WriteRegisters addr=${address} len=${values.length}`
      )
      return { address: result.address, length: result.length }
    } finally {
      await this.safeClose(client)
    }
  }

  async masterWriteSingleCoil(config: MasterConfig, address: number, value: boolean): Promise<{ address: number; value: boolean }> {
    const client = await this.createMasterClient(config)
    const timeout = config.timeout || 5000
    try {
      const result = await this.withTimeout(
        client.writeCoil(address, value),
        timeout,
        `WriteCoil addr=${address} val=${value}`
      )
      return { address: result.address, value: result.state }
    } finally {
      await this.safeClose(client)
    }
  }

  private recordDataChange(slaveId: string, type: RegisterType, address: number, oldValue: number | boolean, newValue: number | boolean, source: 'script' | 'master' | 'ui'): void {
    if (!this.dataRecordingEnabled) return
    
    const slave = this.slaves.get(slaveId)
    if (!slave) return
    
    slave.dataHistory.push({
      timestamp: Date.now(),
      type,
      address,
      oldValue,
      newValue,
      source
    })
    
    if (slave.dataHistory.length > this.maxHistorySize) {
      slave.dataHistory.shift()
    }
  }

  getDataHistory(slaveId: string): DataRecord[] {
    const slave = this.slaves.get(slaveId)
    return slave ? [...slave.dataHistory] : []
  }

  clearDataHistory(slaveId: string): void {
    const slave = this.slaves.get(slaveId)
    if (slave) {
      slave.dataHistory = []
    }
  }

  setDataRecording(enabled: boolean): void {
    this.dataRecordingEnabled = enabled
  }

  async setRegisterValue(slaveId: string, type: RegisterType, address: number, value: number | boolean, source: 'script' | 'master' | 'ui' = 'ui'): Promise<boolean> {
    const slave = this.slaves.get(slaveId)
    if (!slave) return false
    
    await slave.mutex.acquire()
    try {
      let oldValue: number | boolean
      switch (type) {
        case 'holding':
          oldValue = slave.registers.holding.get(address) || 0
          slave.registers.holding.set(address, value as number)
          break
        case 'input':
          oldValue = slave.registers.input.get(address) || 0
          slave.registers.input.set(address, value as number)
          break
        case 'coil':
          oldValue = slave.registers.coil.get(address) || false
          slave.registers.coil.set(address, value as boolean)
          break
        case 'discrete':
          oldValue = slave.registers.discrete.get(address) || false
          slave.registers.discrete.set(address, value as boolean)
          break
        default:
          return false
      }
      
      if (oldValue !== value) {
        this.recordDataChange(slaveId, type, address, oldValue, value, source)
      }
      
      return true
    } finally {
      slave.mutex.release()
    }
  }

  createScript(slaveId: string, name: string, code: string): ScriptConfig {
    const id = `script_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const config: ScriptConfig = {
      id,
      slaveId,
      name,
      code,
      isRunning: false
    }
    
    this.scripts.set(id, {
      config,
      luaState: null,
      isRunning: false
    })
    
    return config
  }

  getScripts(): ScriptConfig[] {
    return Array.from(this.scripts.values()).map(s => s.config)
  }

  updateScript(id: string, updates: Partial<ScriptConfig>): ScriptConfig | null {
    const script = this.scripts.get(id)
    if (!script) return null
    
    script.config = { ...script.config, ...updates }
    return script.config
  }

  deleteScript(id: string): boolean {
    this.stopScript(id)
    return this.scripts.delete(id)
  }

  async startScript(id: string): Promise<boolean> {
    const script = this.scripts.get(id)
    if (!script || script.isRunning) return false
    
    const slave = this.slaves.get(script.config.slaveId)
    if (!slave) return false
    
    const L = lauxlib.luaL_newstate()
    lualib.luaL_openlibs(L)
    
    const manager = this
    const slaveId = script.config.slaveId
    
    interop.push(L, {
      get_register: (type: string, address: number) => {
        const regType = type as RegisterType
        switch (regType) {
          case 'holding':
            return slave.registers.holding.get(address) || 0
          case 'input':
            return slave.registers.input.get(address) || 0
          case 'coil':
            return slave.registers.coil.get(address) || false
          case 'discrete':
            return slave.registers.discrete.get(address) || false
          default:
            return nil
        }
      },
      set_register: (type: string, address: number, value: any) => {
        manager.setRegisterValue(slaveId, type as RegisterType, address, value, 'script')
      },
      sleep: (ms: number) => {
        const start = Date.now()
        while (Date.now() - start < ms) {}
      },
      log: (msg: string) => {
        console.log(`[Lua Script ${script.config.name}]:`, msg)
      }
    })
    lua.lua_setglobal(L, to_luastring('modbus'))
    
    const status = lauxlib.luaL_dostring(L, to_luastring(script.config.code))
    if (status !== 0) {
      const error = lua.lua_tostring(L, -1)
      console.error('Lua script error:', error ? to_jsstring(error) : 'Unknown error')
      lua.lua_close(L)
      return false
    }
    
    script.luaState = L
    script.isRunning = true
    script.config.isRunning = true
    
    script.intervalId = setInterval(() => {
      if (script.isRunning && script.luaState) {
        lua.lua_getglobal(script.luaState, to_luastring('update'))
        if (lua.lua_isfunction(script.luaState, -1)) {
          const status = lua.lua_pcall(script.luaState, 0, 0, 0)
          if (status !== 0) {
            const error = lua.lua_tostring(script.luaState, -1)
            console.error('Lua update error:', error ? to_jsstring(error) : 'Unknown error')
          }
        } else {
          lua.lua_pop(script.luaState, 1)
        }
      }
    }, 100)
    
    return true
  }

  stopScript(id: string): boolean {
    const script = this.scripts.get(id)
    if (!script) return false
    
    if (script.intervalId) {
      clearInterval(script.intervalId)
      script.intervalId = undefined
    }
    
    if (script.luaState) {
      lua.lua_close(script.luaState)
      script.luaState = null
    }
    
    script.isRunning = false
    script.config.isRunning = false
    
    return true
  }

  exportConfig(): SimulationConfig {
    const slaves = Array.from(this.slaves.values()).map(slave => ({
      config: slave.config,
      registers: {
        holding: Array.from(slave.registers.holding.entries()).map(([address, value]) => ({ address, value })),
        input: Array.from(slave.registers.input.entries()).map(([address, value]) => ({ address, value })),
        coil: Array.from(slave.registers.coil.entries()).map(([address, value]) => ({ address, value })),
        discrete: Array.from(slave.registers.discrete.entries()).map(([address, value]) => ({ address, value }))
      },
      illegalAddresses: {
        holding: Array.from(slave.illegalAddresses.holding),
        input: Array.from(slave.illegalAddresses.input),
        coil: Array.from(slave.illegalAddresses.coil),
        discrete: Array.from(slave.illegalAddresses.discrete)
      }
    }))
    
    const scripts = this.getScripts()
    
    return {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      slaves,
      scripts
    }
  }

  importConfig(config: SimulationConfig): { slaves: string[]; scripts: string[] } {
    const importedSlaves: string[] = []
    const importedScripts: string[] = []
    
    for (const slaveData of config.slaves) {
      const newSlaveConfig = this.addSlave(slaveData.config)
      const slave = this.slaves.get(newSlaveConfig.id)!
      
      for (const { address, value } of slaveData.registers.holding) {
        slave.registers.holding.set(address, value)
      }
      for (const { address, value } of slaveData.registers.input) {
        slave.registers.input.set(address, value)
      }
      for (const { address, value } of slaveData.registers.coil) {
        slave.registers.coil.set(address, value)
      }
      for (const { address, value } of slaveData.registers.discrete) {
        slave.registers.discrete.set(address, value)
      }
      
      for (const addr of slaveData.illegalAddresses.holding) {
        slave.illegalAddresses.holding.add(addr)
      }
      for (const addr of slaveData.illegalAddresses.input) {
        slave.illegalAddresses.input.add(addr)
      }
      for (const addr of slaveData.illegalAddresses.coil) {
        slave.illegalAddresses.coil.add(addr)
      }
      for (const addr of slaveData.illegalAddresses.discrete) {
        slave.illegalAddresses.discrete.add(addr)
      }
      
      importedSlaves.push(newSlaveConfig.id)
    }
    
    for (const scriptConfig of config.scripts) {
      const newScript = this.createScript(
        importedSlaves[0] || scriptConfig.slaveId,
        scriptConfig.name,
        scriptConfig.code
      )
      importedScripts.push(newScript.id)
    }
    
    return { slaves: importedSlaves, scripts: importedScripts }
  }
}
