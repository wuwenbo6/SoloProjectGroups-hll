import net from 'net'
import { processHL7Message } from './processor.js'
import { ackGenerator, type AcknowledgmentCode } from './ackGenerator.js'

const HL7_START_BLOCK = '\x0b'
const HL7_END_BLOCK = '\x1c'
const HL7_CARRIAGE_RETURN = '\x0d'

interface HL7ServerOptions {
  port?: number
  host?: string
  autoACK?: boolean
}

export class HL7TCPServer {
  private server: net.Server
  private port: number
  private host: string
  private autoACK: boolean
  private connections: Map<string, net.Socket> = new Map()
  private buffer = new Map<string, string>()
  private messageCount = 0

  constructor(options: HL7ServerOptions = {}) {
    this.port = options.port || 2575
    this.host = options.host || '0.0.0.0'
    this.autoACK = options.autoACK ?? true
    this.server = net.createServer()
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.on('connection', (socket) => this.handleConnection(socket))
      this.server.on('error', (err) => reject(err))
      this.server.listen(this.port, this.host, () => {
        console.log(`HL7 TCP Server listening on ${this.host}:${this.port}`)
        resolve()
      })
    })
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      this.connections.forEach((socket) => socket.destroy())
      this.connections.clear()
      this.server.close(() => {
        console.log('HL7 TCP Server stopped')
        resolve()
      })
    })
  }

  getConnectionCount(): number {
    return this.connections.size
  }

  isListening(): boolean {
    return this.server.listening
  }

  getPort(): number {
    return this.port
  }

  getMessageCount(): number {
    return this.messageCount
  }

  setAutoACK(enabled: boolean) {
    this.autoACK = enabled
  }

  private handleConnection(socket: net.Socket) {
    const socketId = `${socket.remoteAddress}:${socket.remotePort}`
    console.log(`New HL7 connection from ${socketId}`)
    this.connections.set(socketId, socket)
    this.buffer.set(socketId, '')

    socket.on('data', (data) => {
      this.handleData(socketId, socket, data)
    })

    socket.on('close', () => {
      console.log(`HL7 connection closed: ${socketId}`)
      this.connections.delete(socketId)
      this.buffer.delete(socketId)
    })

    socket.on('error', (err) => {
      console.error(`Socket error from ${socketId}:`, err.message)
    })
  }

  private async handleData(socketId: string, socket: net.Socket, data: Buffer) {
    let buffer = this.buffer.get(socketId) || ''
    buffer += data.toString('binary')

    while (true) {
      const startIdx = buffer.indexOf(HL7_START_BLOCK)
      const endIdx = buffer.indexOf(HL7_END_BLOCK + HL7_CARRIAGE_RETURN)

      if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
        break
      }

      const message = buffer.substring(startIdx + 1, endIdx)
      buffer = buffer.substring(endIdx + 2)
      this.messageCount++

      const mshInfo = ackGenerator.parseMSHForACK(message)

      try {
        await processHL7Message(message, 'tcp')
        if (this.autoACK && mshInfo) {
          const ackMsg = ackGenerator.generateAA(
            mshInfo,
            mshInfo.messageControlId,
            'Message accepted successfully'
          )
          this.sendFramedMessage(socket, ackMsg)
        }
      } catch (err) {
        console.error('Error processing HL7 message:', err)
        if (this.autoACK && mshInfo) {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error'
          const ackMsg = ackGenerator.generateAE(
            mshInfo,
            mshInfo.messageControlId,
            errorMsg,
            '207'
          )
          this.sendFramedMessage(socket, ackMsg)
        }
      }
    }

    this.buffer.set(socketId, buffer)
  }

  private sendFramedMessage(socket: net.Socket, message: string) {
    const framed = ackGenerator.wrapMLLP(message)
    socket.write(framed)
  }

  sendRawACK(
    socket: net.Socket,
    originalMessage: string,
    code: AcknowledgmentCode,
    errorMessage?: string
  ): boolean {
    const mshInfo = ackGenerator.parseMSHForACK(originalMessage)
    if (!mshInfo) return false

    let ackMsg: string
    switch (code) {
      case 'AA':
        ackMsg = ackGenerator.generateAA(mshInfo, mshInfo.messageControlId, errorMessage)
        break
      case 'AE':
        ackMsg = ackGenerator.generateAE(mshInfo, mshInfo.messageControlId, errorMessage || 'Application error')
        break
      case 'AR':
        ackMsg = ackGenerator.generateAR(mshInfo, mshInfo.messageControlId, errorMessage || 'Message rejected')
        break
      default:
        return false
    }

    this.sendFramedMessage(socket, ackMsg)
    return true
  }
}

export const hl7TCPServer = new HL7TCPServer()
export default HL7TCPServer
