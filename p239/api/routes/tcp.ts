import { Router, type Request, type Response } from 'express'
import { TcpStateMachine, type TcpEvent, type CongestionEvent } from '../tcpStateMachine.js'

const router = Router()
const machine = new TcpStateMachine()

const VALID_EVENTS: TcpEvent[] = [
  'ACTIVE_OPEN',
  'PASSIVE_OPEN',
  'SEND',
  'CLOSE',
  'SYN_RCVD',
  'SYN_ACK_RCVD',
  'ACK_RCVD',
  'FIN_RCVD',
  'FIN_ACK_RCVD',
  'RCV',
  'TIMEOUT',
]

const VALID_CONGESTION_EVENTS: CongestionEvent[] = [
  'SEND_PACKET',
  'ACK_RECEIVED',
  'DUP_ACK',
  'TIMEOUT_RETRANSMIT',
]

router.get('/state', (_req: Request, res: Response): void => {
  res.json({
    currentState: machine.getCurrentState(),
    availableEvents: machine.getAvailableEvents(),
    history: machine.getHistory(),
  })
})

router.post('/trigger', (req: Request, res: Response): void => {
  const { event } = req.body

  if (!event || !VALID_EVENTS.includes(event)) {
    res.status(400).json({
      success: false,
      error: `Invalid event: "${event}". Must be one of: ${VALID_EVENTS.join(', ')}`,
    })
    return
  }

  const result = machine.trigger(event as TcpEvent)

  if (!result.success) {
    res.status(409).json({
      success: false,
      error: result.error,
      currentState: machine.getCurrentState(),
    })
    return
  }

  res.json({
    success: true,
    previousState: result.record!.from,
    currentState: result.record!.to,
    event: result.record!.event,
    timestamp: result.record!.timestamp,
  })
})

router.post('/reset', (_req: Request, res: Response): void => {
  const result = machine.reset()
  res.json({
    success: true,
    ...result,
  })
})

router.get('/graph', (_req: Request, res: Response): void => {
  res.json(machine.getGraphData())
})

router.get('/congestion/state', (_req: Request, res: Response): void => {
  res.json({
    state: machine.getCongestionState(),
    history: machine.getCongestionHistory(),
    packets: machine.getPackets(),
  })
})

router.post('/congestion/trigger', (req: Request, res: Response): void => {
  const { event } = req.body

  if (!event || !VALID_CONGESTION_EVENTS.includes(event)) {
    res.status(400).json({
      success: false,
      error: `Invalid congestion event: "${event}". Must be one of: ${VALID_CONGESTION_EVENTS.join(', ')}`,
    })
    return
  }

  const result = machine.triggerCongestion(event as CongestionEvent)

  if (!result.success) {
    res.status(400).json({
      success: false,
      error: result.error,
      state: machine.getCongestionState(),
    })
    return
  }

  res.json({
    success: true,
    record: result.record,
    packet: result.packet,
    state: machine.getCongestionState(),
  })
})

router.post('/congestion/reset', (_req: Request, res: Response): void => {
  const result = machine.resetCongestion()
  res.json({
    success: true,
    state: result,
  })
})

export default router
