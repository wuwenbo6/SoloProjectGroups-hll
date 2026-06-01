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

export const CONGESTION_PHASE_COLORS: Record<CongestionPhase, string> = {
  SLOW_START: '#4ade80',
  CONGESTION_AVOIDANCE: '#00e5ff',
  FAST_RECOVERY: '#ffab00',
  RECOVERY_DONE: '#a78bfa',
}
