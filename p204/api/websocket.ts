import { WebSocketServer, WebSocket } from 'ws'
import type { Server } from 'http'

interface GapAckBlock {
  start: number
  end: number
}

interface SACKMessage {
  streamId: number
  cumulativeTSN: number
  gapAckBlocks: GapAckBlock[]
  duplicateTSNs: number[]
  timestamp: number
  expiredTSNs?: number[]
}

interface NetworkConfig {
  lossRate: number
  minDelay: number
  maxDelay: number
  reorderRate: number
}

interface ClientMessage {
  type: 'send' | 'batchSend' | 'sack' | 'config'
  streamId: number
  content?: string
  count?: number
  sack?: SACKMessage
  config?: NetworkConfig
  lifetime?: number
  isUnreliable?: boolean
}

interface ServerMessage {
  type: 'message' | 'connected' | 'ack' | 'sack' | 'config' | 'expired'
  streamId?: number
  sequence?: number
  content?: string
  timestamp?: number
  clientId?: string
  sack?: SACKMessage
  config?: NetworkConfig
  expired?: number[]
}

interface StreamState {
  nextSequence: number
  lastSACK?: SACKMessage
}

interface QueuedMessage {
  message: ServerMessage
  status: 'pending' | 'sent' | 'acked' | 'lost' | 'expired'
  sentTime?: number
  expireTime?: number
  retransmitCount: number
  lifetime?: number
  isUnreliable?: boolean
}

interface StreamSendState {
  nextTSN: number
  lastAckedTSN: number
  sendQueue: Map<number, QueuedMessage>
}

interface ClientSession {
  ws: WebSocket
  networkConfig: NetworkConfig
  streams: Map<number, StreamState>
  streamSendStates: Map<number, StreamSendState>
  expireCheckTimer?: NodeJS.Timeout
}

class WebSocketManager {
  private wss: WebSocketServer
  private clients: Map<string, ClientSession>

  constructor() {
    this.clients = new Map()
  }

  attachToServer(server: Server) {
    this.wss = new WebSocketServer({ server })

    this.wss.on('connection', (ws: WebSocket) => {
      const clientId = this.generateClientId()
      const session: ClientSession = {
        ws,
        networkConfig: {
          lossRate: 0,
          minDelay: 100,
          maxDelay: 500,
          reorderRate: 0.5,
        },
        streams: new Map([
          [0, { nextSequence: 0 }],
          [1, { nextSequence: 0 }],
        ]),
        streamSendStates: new Map([
          [0, { nextTSN: 0, lastAckedTSN: -1, sendQueue: new Map() }],
          [1, { nextTSN: 0, lastAckedTSN: -1, sendQueue: new Map() }],
        ]),
      }

      this.clients.set(clientId, session)

      this.startExpireCheck(clientId, session)

      const connectedMsg: ServerMessage = {
        type: 'connected',
        clientId,
      }
      ws.send(JSON.stringify(connectedMsg))

      ws.on('message', (data: string) => {
        try {
          const message: ClientMessage = JSON.parse(data)
          this.handleMessage(clientId, message)
        } catch (error) {
          console.error('Failed to parse message:', error)
        }
      })

      ws.on('close', () => {
        this.cleanupClient(clientId)
      })
    })
  }

  private cleanupClient(clientId: string) {
    const session = this.clients.get(clientId)
    if (session?.expireCheckTimer) {
      clearInterval(session.expireCheckTimer)
    }
    this.clients.delete(clientId)
  }

  private startExpireCheck(clientId: string, session: ClientSession) {
    session.expireCheckTimer = setInterval(() => {
      this.checkExpiredMessages(clientId, session)
    }, 100)
  }

  private checkExpiredMessages(clientId: string, session: ClientSession) {
    const now = Date.now()
    const expiredByStream = new Map<number, number[]>()

    for (const [streamId, sendState] of session.streamSendStates) {
      const expired: number[] = []
      for (const [seq, queued] of sendState.sendQueue) {
        if (
          queued.lifetime &&
          queued.expireTime &&
          now > queued.expireTime &&
          queued.status !== 'acked' &&
          queued.status !== 'expired'
        ) {
          expired.push(seq)
          queued.status = 'expired'
        }
      }
      if (expired.length > 0) {
        expiredByStream.set(streamId, expired)
      }
    }

    for (const [streamId, expired] of expiredByStream) {
      const msg: ServerMessage = {
        type: 'expired',
        streamId,
        expired,
      }
      if (session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(JSON.stringify(msg))
      }
    }
  }

  private generateClientId(): string {
    return Math.random().toString(36).substring(2, 15)
  }

  private handleMessage(clientId: string, message: ClientMessage) {
    const session = this.clients.get(clientId)
    if (!session) return

    if (message.type === 'send') {
      this.handleSingleMessage(clientId, session, message)
    } else if (message.type === 'batchSend') {
      this.handleBatchMessage(clientId, session, message)
    } else if (message.type === 'sack') {
      this.handleSACK(session, message)
    } else if (message.type === 'config') {
      this.handleConfig(session, message)
    }
  }

  private handleSingleMessage(
    clientId: string,
    session: ClientSession,
    message: ClientMessage
  ) {
    const streamId = message.streamId
    const stream = session.streams.get(streamId)
    const sendState = session.streamSendStates.get(streamId)
    if (!stream || !sendState) return

    const sequence = stream.nextSequence++
    const content = message.content || ''
    const now = Date.now()
    const lifetime = message.lifetime
    const isUnreliable = message.isUnreliable || false

    const serverMessage: ServerMessage = {
      type: 'message',
      streamId,
      sequence,
      content,
      timestamp: now,
    }

    const queued: QueuedMessage = {
      message: serverMessage,
      status: 'sent',
      sentTime: now,
      retransmitCount: 0,
      lifetime,
      expireTime: lifetime ? now + lifetime : undefined,
      isUnreliable,
    }
    sendState.sendQueue.set(sequence, queued)

    this.deliverMessage(clientId, session, serverMessage, lifetime, isUnreliable)
  }

  private handleBatchMessage(
    clientId: string,
    session: ClientSession,
    message: ClientMessage
  ) {
    const streamId = message.streamId
    const stream = session.streams.get(streamId)
    const sendState = session.streamSendStates.get(streamId)
    if (!stream || !sendState) return

    const count = message.count || 10
    const now = Date.now()
    const messages: ServerMessage[] = []

    for (let i = 0; i < count; i++) {
      const sequence = stream.nextSequence++
      const serverMessage: ServerMessage = {
        type: 'message',
        streamId,
        sequence,
        content: `Batch message #${sequence}`,
        timestamp: now,
      }

      const queued: QueuedMessage = {
        message: serverMessage,
        status: 'sent',
        sentTime: now,
        retransmitCount: 0,
      }
      sendState.sendQueue.set(sequence, queued)
      messages.push(serverMessage)
    }

    if (Math.random() < session.networkConfig.reorderRate) {
      this.shuffleArray(messages)
    }

    messages.forEach((msg) => {
      this.deliverMessage(clientId, session, msg)
    })
  }

  private deliverMessage(
    clientId: string,
    session: ClientSession,
    message: ServerMessage,
    lifetime?: number,
    isUnreliable = false
  ) {
    if (session.ws.readyState !== WebSocket.OPEN) return

    const isDropped =
      !isUnreliable && Math.random() < session.networkConfig.lossRate
    if (isDropped) {
      return
    }

    const delay = this.randomDelay(session.networkConfig)
    setTimeout(() => {
      if (session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(JSON.stringify(message))
      }
    }, delay)
  }

  private handleSACK(session: ClientSession, message: ClientMessage) {
    if (!message.sack) return

    const streamId = message.streamId
    const stream = session.streams.get(streamId)
    const sendState = session.streamSendStates.get(streamId)
    if (!stream || !sendState) return

    stream.lastSACK = message.sack

    const newLastAcked = this.processSACK(sendState, message.sack)

    const sackResponse: ServerMessage = {
      type: 'sack',
      streamId,
      sack: {
        streamId,
        cumulativeTSN: newLastAcked,
        gapAckBlocks: [],
        duplicateTSNs: [],
        timestamp: Date.now(),
      },
    }
    if (session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(JSON.stringify(sackResponse))
    }
  }

  private processSACK(
    sendState: StreamSendState,
    sack: SACKMessage
  ): number {
    let newLastAcked = sendState.lastAckedTSN

    for (let i = sendState.lastAckedTSN + 1; i <= sack.cumulativeTSN; i++) {
      const queued = sendState.sendQueue.get(i)
      if (queued && queued.status === 'sent') {
        queued.status = 'acked'
        newLastAcked = i
      }
    }

    sendState.lastAckedTSN = newLastAcked
    return newLastAcked
  }

  private handleConfig(session: ClientSession, message: ClientMessage) {
    if (!message.config) return
    session.networkConfig = { ...session.networkConfig, ...message.config }
  }

  private randomDelay(config: NetworkConfig): number {
    return (
      Math.floor(Math.random() * (config.maxDelay - config.minDelay + 1)) +
      config.minDelay
    )
  }

  private shuffleArray<T>(array: T[]): void {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[array[i], array[j]] = [array[j], array[i]]
    }
  }
}

export default WebSocketManager
