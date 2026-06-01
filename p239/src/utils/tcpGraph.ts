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

export const EVENT_DISPLAY_NAMES: Record<TcpEvent, string> = {
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

export const STATE_DESCRIPTIONS: Record<TcpState, string> = {
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

export const NODE_POSITIONS: Record<TcpState, { x: number; y: number; type: 'client' | 'server' | 'shared' }> = {
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

export const GRAPH_NODES: GraphNode[] = (Object.keys(NODE_POSITIONS) as TcpState[]).map((id) => {
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

export const GRAPH_EDGES: GraphEdge[] = TRANSITION_RULES.map((rule) => ({
  from: rule.from,
  to: rule.to,
  event: rule.event,
  label: EVENT_DISPLAY_NAMES[rule.event],
}))

export const NODE_COLORS = {
  client: {
    fill: '#0e1a29',
    border: '#00e5ff',
    glow: 'rgba(0, 229, 255, 0.5)',
  },
  server: {
    fill: '#1a1408',
    border: '#ffab00',
    glow: 'rgba(255, 171, 0, 0.5)',
  },
  shared: {
    fill: '#0a1a10',
    border: '#4ade80',
    glow: 'rgba(74, 222, 128, 0.5)',
  },
}
