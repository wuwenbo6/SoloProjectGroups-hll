export type TcpState =
  | 'CLOSED'
  | 'LISTEN'
  | 'SYN_SENT'
  | 'SYN_RCVD'
  | 'ESTABLISHED'
  | 'FIN_WAIT_1'
  | 'FIN_WAIT_2'
  | 'CLOSING'
  | 'TIME_WAIT'
  | 'CLOSE_WAIT'
  | 'LAST_ACK'

export type TcpEvent =
  | 'ACTIVE_OPEN'
  | 'PASSIVE_OPEN'
  | 'SEND'
  | 'CLOSE'
  | 'SYN_RCVD'
  | 'SYN_ACK_RCVD'
  | 'ACK_RCVD'
  | 'FIN_RCVD'
  | 'FIN_ACK_RCVD'
  | 'RCV'
  | 'TIMEOUT'

export type CongestionEvent = 'SEND_PACKET' | 'ACK_RECEIVED' | 'DUP_ACK' | 'TIMEOUT_RETRANSMIT'

export type CongestionPhase = 'SLOW_START' | 'CONGESTION_AVOIDANCE' | 'FAST_RECOVERY' | 'RECOVERY_DONE'

export interface CongestionState {
  cwnd: number
  ssthresh: number
  dupacks: number
  phase: CongestionPhase
  inRecovery: boolean
  retransmitCount: number
}

export interface CongestionRecord {
  timestamp: number
  event: CongestionEvent
  cwnd: number
  ssthresh: number
  phase: CongestionPhase
  note?: string
}

export interface PacketRecord {
  id: number
  type: 'DATA' | 'ACK' | 'DUP_ACK' | 'RETRANSMIT'
  seq?: number
  lost?: boolean
  timestamp: number
}

export const CONGESTION_EVENT_NAMES: Record<CongestionEvent, string> = {
  SEND_PACKET: '发送数据包',
  ACK_RECEIVED: '收到ACK',
  DUP_ACK: '收到重复ACK',
  TIMEOUT_RETRANSMIT: '超时重传',
}

export const CONGESTION_PHASE_NAMES: Record<CongestionPhase, string> = {
  SLOW_START: '慢启动',
  CONGESTION_AVOIDANCE: '拥塞避免',
  FAST_RECOVERY: '快速恢复',
  RECOVERY_DONE: '恢复完成',
}

export interface TransitionRecord {
  from: TcpState
  to: TcpState
  event: TcpEvent
  timestamp: number
}

export interface GraphNode {
  id: TcpState
  label: string
  x: number
  y: number
  type: 'client' | 'server' | 'shared'
  description: string
}

export interface GraphEdge {
  from: TcpState
  to: TcpState
  event: TcpEvent
  label: string
}

const STATE_DESCRIPTIONS: Record<TcpState, string> = {
  CLOSED: '连接关闭，无TCP控制块',
  LISTEN: '服务器等待连接，调用tcp_listen()',
  SYN_SENT: '客户端已发送SYN，等待SYN+ACK',
  SYN_RCVD: '收到SYN，已发送SYN+ACK，等待ACK',
  ESTABLISHED: '连接建立，可收发数据',
  FIN_WAIT_1: '主动关闭，已发送FIN，等待ACK',
  FIN_WAIT_2: '收到FIN的ACK，等待远端FIN',
  CLOSING: '同时关闭，收到FIN而非ACK',
  TIME_WAIT: '等待2MSL超时，确保远端收到最终ACK',
  CLOSE_WAIT: '收到远端FIN，等待本地关闭',
  LAST_ACK: '已发送FIN，等待最终ACK',
}

const EVENT_DISPLAY_NAMES: Record<TcpEvent, string> = {
  ACTIVE_OPEN: '主动OPEN',
  PASSIVE_OPEN: '被动OPEN',
  SEND: '发送数据',
  CLOSE: '关闭连接',
  SYN_RCVD: '收到SYN',
  SYN_ACK_RCVD: '收到SYN+ACK',
  ACK_RCVD: '收到ACK',
  FIN_RCVD: '收到FIN',
  FIN_ACK_RCVD: '收到FIN+ACK',
  RCV: '接收数据',
  TIMEOUT: '超时(2MSL)',
}

const NODE_POSITIONS: Record<TcpState, { x: number; y: number; type: 'client' | 'server' | 'shared' }> = {
  CLOSED: { x: 0.5, y: 0.06, type: 'client' },
  LISTEN: { x: 0.18, y: 0.2, type: 'server' },
  SYN_SENT: { x: 0.82, y: 0.2, type: 'client' },
  SYN_RCVD: { x: 0.3, y: 0.38, type: 'server' },
  ESTABLISHED: { x: 0.5, y: 0.52, type: 'shared' },
  FIN_WAIT_1: { x: 0.22, y: 0.68, type: 'client' },
  CLOSE_WAIT: { x: 0.78, y: 0.68, type: 'server' },
  FIN_WAIT_2: { x: 0.12, y: 0.84, type: 'client' },
  CLOSING: { x: 0.35, y: 0.84, type: 'client' },
  LAST_ACK: { x: 0.88, y: 0.84, type: 'server' },
  TIME_WAIT: { x: 0.22, y: 0.96, type: 'client' },
}

interface TransitionRule {
  from: TcpState
  event: TcpEvent
  to: TcpState
}

const TRANSITION_RULES: TransitionRule[] = [
  { from: 'CLOSED', event: 'PASSIVE_OPEN', to: 'LISTEN' },
  { from: 'CLOSED', event: 'ACTIVE_OPEN', to: 'SYN_SENT' },
  { from: 'LISTEN', event: 'SYN_RCVD', to: 'SYN_RCVD' },
  { from: 'LISTEN', event: 'CLOSE', to: 'CLOSED' },
  { from: 'SYN_SENT', event: 'SYN_ACK_RCVD', to: 'ESTABLISHED' },
  { from: 'SYN_SENT', event: 'SYN_RCVD', to: 'SYN_RCVD' },
  { from: 'SYN_SENT', event: 'CLOSE', to: 'CLOSED' },
  { from: 'SYN_RCVD', event: 'ACK_RCVD', to: 'ESTABLISHED' },
  { from: 'SYN_RCVD', event: 'CLOSE', to: 'FIN_WAIT_1' },
  { from: 'ESTABLISHED', event: 'CLOSE', to: 'FIN_WAIT_1' },
  { from: 'ESTABLISHED', event: 'FIN_RCVD', to: 'CLOSE_WAIT' },
  { from: 'ESTABLISHED', event: 'SEND', to: 'ESTABLISHED' },
  { from: 'ESTABLISHED', event: 'RCV', to: 'ESTABLISHED' },
  { from: 'FIN_WAIT_1', event: 'ACK_RCVD', to: 'FIN_WAIT_2' },
  { from: 'FIN_WAIT_1', event: 'FIN_RCVD', to: 'CLOSING' },
  { from: 'FIN_WAIT_1', event: 'FIN_ACK_RCVD', to: 'TIME_WAIT' },
  { from: 'FIN_WAIT_2', event: 'FIN_RCVD', to: 'TIME_WAIT' },
  { from: 'CLOSING', event: 'ACK_RCVD', to: 'TIME_WAIT' },
  { from: 'CLOSE_WAIT', event: 'CLOSE', to: 'LAST_ACK' },
  { from: 'LAST_ACK', event: 'ACK_RCVD', to: 'CLOSED' },
  { from: 'TIME_WAIT', event: 'TIMEOUT', to: 'CLOSED' },
]

const transitionMap = new Map<string, TcpState>()
for (const rule of TRANSITION_RULES) {
  transitionMap.set(`${rule.from}:${rule.event}`, rule.to)
}

export class CongestionControl {
  private state: CongestionState
  private history: CongestionRecord[] = []
  private packets: PacketRecord[] = []
  private packetIdCounter = 0
  private seqCounter = 0
  private readonly mss = 1
  private readonly maxCwnd = 100
  private readonly minCwnd = 1

  constructor() {
    this.state = {
      cwnd: 1,
      ssthresh: 64,
      dupacks: 0,
      phase: 'SLOW_START',
      inRecovery: false,
      retransmitCount: 0,
    }
  }

  getState(): CongestionState {
    return { ...this.state }
  }

  getHistory(): CongestionRecord[] {
    return [...this.history]
  }

  getPackets(): PacketRecord[] {
    return [...this.packets]
  }

  private clampCwnd(value: number): number {
    return Math.max(this.minCwnd, Math.min(this.maxCwnd, value))
  }

  private createRecord(event: CongestionEvent, note?: string): CongestionRecord {
    const record: CongestionRecord = {
      timestamp: Date.now(),
      event,
      cwnd: this.state.cwnd,
      ssthresh: this.state.ssthresh,
      phase: this.state.phase,
      note,
    }
    this.history.push(record)
    return record
  }

  private createPacket(type: PacketRecord['type'], seq?: number, lost?: boolean): PacketRecord {
    const packet: PacketRecord = {
      id: ++this.packetIdCounter,
      type,
      seq,
      lost,
      timestamp: Date.now(),
    }
    this.packets.push(packet)
    return packet
  }

  trigger(
    event: CongestionEvent
  ): { success: boolean; record?: CongestionRecord; packet?: PacketRecord; error?: string } {
    let packet: PacketRecord | undefined

    switch (event) {
      case 'SEND_PACKET': {
        packet = this.createPacket('DATA', ++this.seqCounter)
        const record = this.createRecord(event, `发送数据包 #${this.seqCounter}`)
        return { success: true, record, packet }
      }

      case 'ACK_RECEIVED': {
        packet = this.createPacket('ACK')

        if (this.state.inRecovery) {
          this.state.inRecovery = false
          this.state.phase = 'CONGESTION_AVOIDANCE'
        }

        if (this.state.phase === 'SLOW_START') {
          this.state.cwnd = this.clampCwnd(this.state.cwnd + 1)
          if (this.state.cwnd >= this.state.ssthresh) {
            this.state.phase = 'CONGESTION_AVOIDANCE'
          }
        } else if (this.state.phase === 'CONGESTION_AVOIDANCE') {
          this.state.cwnd = this.clampCwnd(this.state.cwnd + 1 / this.state.cwnd)
        } else if (this.state.phase === 'FAST_RECOVERY') {
          this.state.phase = 'RECOVERY_DONE'
          this.state.cwnd = this.clampCwnd(this.state.ssthresh)
          this.state.phase = 'CONGESTION_AVOIDANCE'
        }

        this.state.dupacks = 0

        const record = this.createRecord(event, '收到新ACK，更新拥塞窗口')
        return { success: true, record, packet }
      }

      case 'DUP_ACK': {
        packet = this.createPacket('DUP_ACK')
        this.state.dupacks += 1

        if (this.state.dupacks === 3) {
          this.state.ssthresh = Math.max(this.state.cwnd / 2, 2)
          this.state.cwnd = this.clampCwnd(this.state.ssthresh + 3)
          this.state.phase = 'FAST_RECOVERY'
          this.state.inRecovery = true
          this.state.retransmitCount += 1

          const retransmitPacket = this.createPacket('RETRANSMIT', this.seqCounter)
          const record = this.createRecord(event, '收到3个重复ACK，快速重传')
          return { success: true, record, packet: retransmitPacket }
        } else if (this.state.dupacks > 3 && this.state.phase === 'FAST_RECOVERY') {
          this.state.cwnd = this.clampCwnd(this.state.cwnd + 1)
          const record = this.createRecord(event, `快速恢复中，拥塞窗口+1 (dupacks=${this.state.dupacks})`)
          return { success: true, record, packet }
        }

        const record = this.createRecord(event, `收到重复ACK (dupacks=${this.state.dupacks})`)
        return { success: true, record, packet }
      }

      case 'TIMEOUT_RETRANSMIT': {
        this.state.ssthresh = Math.max(this.state.cwnd / 2, 2)
        this.state.cwnd = 1
        this.state.dupacks = 0
        this.state.phase = 'SLOW_START'
        this.state.inRecovery = false
        this.state.retransmitCount += 1

        let lostCount = 0
        for (let i = this.packets.length - 1; i >= 0 && lostCount < 2; i--) {
          if (this.packets[i].type === 'DATA' && !this.packets[i].lost) {
            this.packets[i].lost = true
            lostCount++
          }
        }

        packet = this.createPacket('RETRANSMIT', this.seqCounter)

        const record = this.createRecord(event, '超时重传，cwnd重置为1')
        return { success: true, record, packet }
      }

      default:
        return { success: false, error: `Unknown congestion event: ${event}` }
    }
  }

  reset(): CongestionState {
    this.state = {
      cwnd: 1,
      ssthresh: 64,
      dupacks: 0,
      phase: 'SLOW_START',
      inRecovery: false,
      retransmitCount: 0,
    }
    this.history = []
    this.packets = []
    this.packetIdCounter = 0
    this.seqCounter = 0
    return { ...this.state }
  }
}

export class TcpStateMachine {
  private currentState: TcpState = 'CLOSED'
  private history: TransitionRecord[] = []
  private congestionControl: CongestionControl

  constructor() {
    this.congestionControl = new CongestionControl()
  }

  getCurrentState(): TcpState {
    return this.currentState
  }

  getAvailableEvents(): TcpEvent[] {
    const events: TcpEvent[] = []
    for (const rule of TRANSITION_RULES) {
      if (rule.from === this.currentState && !events.includes(rule.event)) {
        events.push(rule.event)
      }
    }
    return events
  }

  trigger(event: TcpEvent): { success: boolean; record?: TransitionRecord; error?: string } {
    const key = `${this.currentState}:${event}`
    const nextState = transitionMap.get(key)

    if (!nextState) {
      return {
        success: false,
        error: `Invalid transition: event "${EVENT_DISPLAY_NAMES[event]}" is not allowed in state "${this.currentState}"`,
      }
    }

    const previousState = this.currentState
    this.currentState = nextState

    const record: TransitionRecord = {
      from: previousState,
      to: nextState,
      event,
      timestamp: Date.now(),
    }
    this.history.push(record)

    return { success: true, record }
  }

  reset(): { currentState: TcpState; availableEvents: TcpEvent[] } {
    this.currentState = 'CLOSED'
    this.history = []
    this.congestionControl.reset()
    return {
      currentState: this.currentState,
      availableEvents: this.getAvailableEvents(),
    }
  }

  getHistory(): TransitionRecord[] {
    return [...this.history]
  }

  getGraphData(): { nodes: GraphNode[]; edges: GraphEdge[] } {
    const nodes: GraphNode[] = (Object.keys(NODE_POSITIONS) as TcpState[]).map((id) => {
      const pos = NODE_POSITIONS[id]
      return {
        id,
        label: id,
        x: pos.x,
        y: pos.y,
        type: pos.type,
        description: STATE_DESCRIPTIONS[id],
      }
    })

    const edges: GraphEdge[] = TRANSITION_RULES.map((rule) => ({
      from: rule.from,
      to: rule.to,
      event: rule.event,
      label: EVENT_DISPLAY_NAMES[rule.event],
    }))

    return { nodes, edges }
  }

  getCongestionState(): CongestionState {
    return this.congestionControl.getState()
  }

  getCongestionHistory(): CongestionRecord[] {
    return this.congestionControl.getHistory()
  }

  getPackets(): PacketRecord[] {
    return this.congestionControl.getPackets()
  }

  triggerCongestion(
    event: CongestionEvent
  ): { success: boolean; record?: CongestionRecord; packet?: PacketRecord; error?: string } {
    return this.congestionControl.trigger(event)
  }

  resetCongestion(): CongestionState {
    return this.congestionControl.reset()
  }
}

export const STATE_DESCRIPTIONS_MAP = STATE_DESCRIPTIONS
export const EVENT_DISPLAY_NAMES_MAP = EVENT_DISPLAY_NAMES
