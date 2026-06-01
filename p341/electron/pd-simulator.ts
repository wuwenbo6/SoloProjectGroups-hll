import { parsePDMessage, formatPDMessageForRenderer } from './pd-parser'

interface SimulationStep {
  bytes: number[]
  direction: string
  delay?: number
  powerCurve?: { from: number; to: number; duration: number }
  current?: number
  skipMessageId?: boolean
  isHardReset?: boolean
  label?: string
}

interface Scenario {
  name: string
  description: string
  steps: SimulationStep[]
}

function createFixedPDO(voltage: number, current: number): number {
  const voltageBits = Math.round(voltage / 0.05) & 0x3ff
  const currentBits = Math.round(current / 0.01) & 0x3ff
  return (voltageBits << 10) | currentBits
}

function createAPDO(minVoltage: number, maxVoltage: number, maxCurrent: number): number {
  const maxVoltageBits = Math.round(maxVoltage / 0.1) & 0xff
  const minVoltageBits = Math.round(minVoltage / 0.1) & 0xff
  const currentBits = Math.round(maxCurrent / 0.05) & 0x7f
  return 0xc0000000 | (maxVoltageBits << 17) | (minVoltageBits << 8) | currentBits
}

function createHeader(messageType: number, numDataObjects: number, messageId: number = 0): number {
  return (numDataObjects << 12) | (messageId << 9) | (1 << 8) | (1 << 6) | messageType
}

function createMessageBytes(header: number, pdos: number[] = []): number[] {
  const bytes: number[] = []
  bytes.push(header & 0xff)
  bytes.push((header >> 8) & 0xff)
  for (const pdo of pdos) {
    bytes.push(pdo & 0xff)
    bytes.push((pdo >> 8) & 0xff)
    bytes.push((pdo >> 16) & 0xff)
    bytes.push((pdo >> 24) & 0xff)
  }
  return bytes
}

function createGoodCRC(messageId: number = 0): number[] {
  const header = createHeader(1, 0, messageId)
  return [header & 0xff, (header >> 8) & 0xff]
}

function createSoftReset(messageId: number = 0): number[] {
  const header = createHeader(12, 0, messageId)
  return [header & 0xff, (header >> 8) & 0xff]
}

function createRequest(objectPosition: number, current: number, maxCurrent?: number): number[] {
  const currentBits = Math.round(current / 0.01) & 0x3ff
  const maxCurrentBits = Math.round((maxCurrent || current) / 0.01) & 0x3ff
  const requestData = (objectPosition << 28) | (maxCurrentBits << 10) | currentBits | (1 << 24)
  const header = createHeader(2, 1)
  return createMessageBytes(header, [requestData])
}

function createHardResetSignal(): number[] {
  return [0x0D, 0x00]
}

function makeNegotiationSteps(pdos: number[], requestPos: number, requestCurrent: number, targetVoltage: number, transitionFrom: number, transitionTo: number, transitionDuration: number): SimulationStep[] {
  return [
    { bytes: createMessageBytes(createHeader(1, pdos.length), pdos), direction: 'SOP', current: 0, label: 'Source_Capabilities' },
    { bytes: createGoodCRC(0), direction: 'SOP', label: 'GoodCRC' },
    { bytes: createRequest(requestPos, requestCurrent), direction: 'SOP', label: 'Request' },
    { bytes: createGoodCRC(1), direction: 'SOP', label: 'GoodCRC' },
    { bytes: createMessageBytes(createHeader(15, 0, 1)), direction: 'SOP', label: 'Accept' },
    { bytes: createGoodCRC(1), direction: 'SOP', label: 'GoodCRC' },
    { bytes: createMessageBytes(createHeader(17, 0, 1)), direction: 'SOP', powerCurve: { from: transitionFrom, to: transitionTo, duration: transitionDuration }, current: requestCurrent, label: 'PS_RDY' },
    { bytes: createGoodCRC(1), direction: 'SOP', label: 'GoodCRC' },
  ]
}

function createExtendedMessageBytes(extMsgType: number, messageId: number, extData: number[]): number[] {
  const header = (1 << 15) | (messageId << 9) | (1 << 8) | (1 << 6) | extMsgType
  const extHeader = extData.length & 0x1ff
  const bytes: number[] = []
  bytes.push(header & 0xff)
  bytes.push((header >> 8) & 0xff)
  bytes.push(extHeader & 0xff)
  bytes.push((extHeader >> 8) & 0xff)
  for (const b of extData) {
    bytes.push(b & 0xff)
  }
  return bytes
}

const scenarios: Record<string, Scenario> = {
  'standard-5v': {
    name: 'Standard 5V',
    description: 'Simple 5V/3A negotiation',
    steps: makeNegotiationSteps([createFixedPDO(5, 3)], 1, 3, 5, 5, 5, 500),
  },
  'standard-9v': {
    name: 'Standard 9V',
    description: '9V/3A QC negotiation',
    steps: makeNegotiationSteps([createFixedPDO(5, 3), createFixedPDO(9, 3), createFixedPDO(20, 5)], 2, 3, 9, 5, 9, 800),
  },
  'standard-20v': {
    name: 'Standard 20V',
    description: '20V/5A PD negotiation',
    steps: makeNegotiationSteps([createFixedPDO(5, 3), createFixedPDO(9, 3), createFixedPDO(15, 3), createFixedPDO(20, 5)], 4, 5, 20, 5, 20, 1200),
  },
  'pps-negotiation': {
    name: 'PPS Negotiation',
    description: 'Programmable Power Supply negotiation',
    steps: makeNegotiationSteps([createFixedPDO(5, 3), createFixedPDO(9, 3), createAPDO(3.3, 11, 3)], 3, 2.5, 8.4, 5, 8.4, 1000),
  },
  'rejected-request': {
    name: 'Rejected Request',
    description: 'Request for unsupported voltage gets rejected',
    steps: [
      { bytes: createMessageBytes(createHeader(1, 1), [createFixedPDO(5, 3)]), direction: 'SOP', current: 0, label: 'Source_Capabilities' },
      { bytes: createGoodCRC(0), direction: 'SOP', label: 'GoodCRC' },
      { bytes: createRequest(2, 3), direction: 'SOP', label: 'Request' },
      { bytes: createGoodCRC(1), direction: 'SOP', label: 'GoodCRC' },
      { bytes: createMessageBytes(createHeader(16, 0, 1)), direction: 'SOP', label: 'Reject' },
      { bytes: createGoodCRC(1), direction: 'SOP', label: 'GoodCRC' },
    ],
  },
  'renegotiation': {
    name: 'Renegotiation',
    description: 'Power contract renegotiation',
    steps: [
      ...makeNegotiationSteps([createFixedPDO(5, 3), createFixedPDO(9, 3)], 1, 3, 5, 5, 5, 500),
      { bytes: createMessageBytes(createHeader(1, 2), [createFixedPDO(5, 3), createFixedPDO(9, 3)]), direction: 'SOP', delay: 2000, label: 'Source_Capabilities(更新)' },
      { bytes: createGoodCRC(0), direction: 'SOP', label: 'GoodCRC' },
      { bytes: createRequest(2, 3), direction: 'SOP', label: 'Request(9V)' },
      { bytes: createGoodCRC(1), direction: 'SOP', label: 'GoodCRC' },
      { bytes: createMessageBytes(createHeader(15, 0, 1)), direction: 'SOP', label: 'Accept' },
      { bytes: createGoodCRC(1), direction: 'SOP', label: 'GoodCRC' },
      { bytes: createMessageBytes(createHeader(17, 0, 1)), direction: 'SOP', powerCurve: { from: 5, to: 9, duration: 800 }, current: 3, label: 'PS_RDY' },
      { bytes: createGoodCRC(1), direction: 'SOP', label: 'GoodCRC' },
    ],
  },
  'msgid-gap-retransmit': {
    name: 'MessageID Gap + Retransmit',
    description: 'MessageID gap detected, soft reset & retransmit',
    steps: [
      { bytes: createMessageBytes(createHeader(1, 3), [createFixedPDO(5, 3), createFixedPDO(9, 3), createFixedPDO(20, 5)]), direction: 'SOP', current: 0, label: 'Source_Capabilities' },
      { bytes: createGoodCRC(0), direction: 'SOP', label: 'GoodCRC' },
      { bytes: createMessageBytes(createHeader(2, 1, 3), [createRequest(2, 3)[2] | (2 << 28) | (300 << 10) | 300 | (1 << 24)]), direction: 'SOP', skipMessageId: true, label: 'Request(MSG_ID=3, GAP!)' },
      { bytes: createGoodCRC(3), direction: 'SOP', label: 'GoodCRC' },
      { bytes: createSoftReset(1), direction: 'SOP', delay: 300, label: 'Soft_Reset(MSG_ID不连续)' },
      { bytes: createGoodCRC(2), direction: 'SOP', label: 'GoodCRC' },
      { bytes: createGoodCRC(0), direction: 'SOP', label: 'Accept(Soft_Reset)' },
      { bytes: createGoodCRC(0), direction: 'SOP', delay: 500, label: 'GoodCRC' },
      { bytes: createMessageBytes(createHeader(1, 3), [createFixedPDO(5, 3), createFixedPDO(9, 3), createFixedPDO(20, 5)]), direction: 'SOP', label: 'Source_Capabilities(重传)' },
      { bytes: createGoodCRC(0), direction: 'SOP', label: 'GoodCRC' },
      { bytes: createRequest(2, 3), direction: 'SOP', label: 'Request(9V, 重传)' },
      { bytes: createGoodCRC(1), direction: 'SOP', label: 'GoodCRC' },
      { bytes: createMessageBytes(createHeader(15, 0, 1)), direction: 'SOP', label: 'Accept' },
      { bytes: createGoodCRC(1), direction: 'SOP', label: 'GoodCRC' },
      { bytes: createMessageBytes(createHeader(17, 0, 1)), direction: 'SOP', powerCurve: { from: 5, to: 9, duration: 800 }, current: 3, label: 'PS_RDY' },
      { bytes: createGoodCRC(1), direction: 'SOP', label: 'GoodCRC' },
    ],
  },
  'hard-reset-renegotiate': {
    name: 'Hard Reset + Renegotiate',
    description: 'Hard reset after error, then re-negotiate from scratch',
    steps: [
      { bytes: createMessageBytes(createHeader(1, 3), [createFixedPDO(5, 3), createFixedPDO(9, 3), createFixedPDO(20, 5)]), direction: 'SOP', current: 0, label: 'Source_Capabilities' },
      { bytes: createGoodCRC(0), direction: 'SOP', label: 'GoodCRC' },
      { bytes: createRequest(2, 3), direction: 'SOP', label: 'Request' },
      { bytes: createGoodCRC(1), direction: 'SOP', label: 'GoodCRC' },
      { bytes: createMessageBytes(createHeader(15, 0, 1)), direction: 'SOP', label: 'Accept' },
      { bytes: createGoodCRC(1), direction: 'SOP', label: 'GoodCRC' },
      { bytes: createMessageBytes(createHeader(17, 0, 1)), direction: 'SOP', powerCurve: { from: 5, to: 9, duration: 800 }, current: 3, label: 'PS_RDY' },
      { bytes: createGoodCRC(1), direction: 'SOP', label: 'GoodCRC' },
      { bytes: createHardResetSignal(), direction: 'SOP', delay: 3000, isHardReset: true, label: 'Hard_Reset(异常触发)' },
      { bytes: createMessageBytes(createHeader(1, 2), [createFixedPDO(5, 3), createFixedPDO(9, 3)]), direction: 'SOP', delay: 1500, current: 0, label: 'Source_Capabilities(硬复位后重新协商)' },
      { bytes: createGoodCRC(0), direction: 'SOP', label: 'GoodCRC' },
      { bytes: createRequest(1, 3), direction: 'SOP', label: 'Request(5V安全电压)' },
      { bytes: createGoodCRC(1), direction: 'SOP', label: 'GoodCRC' },
      { bytes: createMessageBytes(createHeader(15, 0, 1)), direction: 'SOP', label: 'Accept' },
      { bytes: createGoodCRC(1), direction: 'SOP', label: 'GoodCRC' },
      { bytes: createMessageBytes(createHeader(17, 0, 1)), direction: 'SOP', powerCurve: { from: 9, to: 5, duration: 500 }, current: 3, label: 'PS_RDY' },
      { bytes: createGoodCRC(1), direction: 'SOP', label: 'GoodCRC' },
    ],
  },
  'pps-extended-status': {
    name: 'PPS Extended + Status',
    description: 'PPS negotiation with extended messages and PPS_Status monitoring',
    steps: [
      { bytes: createMessageBytes(createHeader(1, 3), [createFixedPDO(5, 3), createFixedPDO(9, 3), createAPDO(3.3, 11, 3)]), direction: 'SOP', current: 0, label: 'Source_Capabilities(含APDO)' },
      { bytes: createGoodCRC(0), direction: 'SOP', label: 'GoodCRC' },
      { bytes: createRequest(3, 2.5), direction: 'SOP', label: 'Request(PPS 8.4V)' },
      { bytes: createGoodCRC(1), direction: 'SOP', label: 'GoodCRC' },
      { bytes: createMessageBytes(createHeader(15, 0, 1)), direction: 'SOP', label: 'Accept' },
      { bytes: createGoodCRC(1), direction: 'SOP', label: 'GoodCRC' },
      { bytes: createMessageBytes(createHeader(17, 0, 1)), direction: 'SOP', powerCurve: { from: 5, to: 8.4, duration: 1000 }, current: 2.5, label: 'PS_RDY' },
      { bytes: createGoodCRC(1), direction: 'SOP', label: 'GoodCRC' },
      { bytes: createExtendedMessageBytes(0x0F, 0, [0x30]), direction: 'SOP', delay: 500, label: 'PPS_Status(功率受限=1, SourcePPS=1)' },
      { bytes: createGoodCRC(2), direction: 'SOP', label: 'GoodCRC' },
      { bytes: createExtendedMessageBytes(0x01, 0, [0x58, 0x02, 0x34, 0x12, 0x01, 0x00, 0x00, 0x00, 0x78, 0x56, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00]), direction: 'SOP', delay: 800, label: 'Source_Capabilities_Extended(VID=0x0258, PID=0x1234)' },
      { bytes: createGoodCRC(2), direction: 'SOP', label: 'GoodCRC' },
    ],
  },
}

interface MessageIdTracker {
  lastMessageId: number
  expectedNextId: number
  gapDetected: boolean
  retransmitRequested: boolean
}

export class PDSimulator {
  private running: boolean = false
  private currentStep: number = 0
  private speed: number = 1
  private scenario: Scenario | null = null
  private listeners: Record<string, Function[]> = {}
  private timeouts: NodeJS.Timeout[] = []
  private messageIdCounter: number = 0
  private msgIdTracker: MessageIdTracker
  private hardResetOccurred: boolean = false

  constructor() {
    this.msgIdTracker = {
      lastMessageId: -1,
      expectedNextId: 0,
      gapDetected: false,
      retransmitRequested: false,
    }
  }

  on(event: string, callback: Function): void {
    if (!this.listeners[event]) {
      this.listeners[event] = []
    }
    this.listeners[event].push(callback)
  }

  removeAllListeners(): void {
    this.listeners = {}
  }

  private emit(event: string, data?: any): void {
    if (this.listeners[event]) {
      this.listeners[event].forEach((cb) => cb(data))
    }
  }

  private clearAllTimeouts(): void {
    this.timeouts.forEach((t) => clearTimeout(t))
    this.timeouts = []
  }

  private resetMessageIdTracker(): void {
    this.msgIdTracker = {
      lastMessageId: -1,
      expectedNextId: 0,
      gapDetected: false,
      retransmitRequested: false,
    }
  }

  private checkMessageIdContinuity(receivedMsgId: number, skipCheck: boolean = false): { isGap: boolean; expectedId: number } {
    if (skipCheck) {
      return { isGap: false, expectedId: this.msgIdTracker.expectedNextId }
    }

    const expectedId = this.msgIdTracker.expectedNextId

    if (this.msgIdTracker.lastMessageId === -1) {
      this.msgIdTracker.lastMessageId = receivedMsgId
      this.msgIdTracker.expectedNextId = (receivedMsgId + 1) % 8
      return { isGap: false, expectedId }
    }

    if (receivedMsgId !== expectedId) {
      this.msgIdTracker.gapDetected = true
      this.emit('message-id-gap', {
        expectedId,
        receivedId: receivedMsgId,
        lastId: this.msgIdTracker.lastMessageId,
        timestamp: Date.now(),
      })
      return { isGap: true, expectedId }
    }

    this.msgIdTracker.lastMessageId = receivedMsgId
    this.msgIdTracker.expectedNextId = (receivedMsgId + 1) % 8
    return { isGap: false, expectedId }
  }

  private schedulePowerCurve(from: number, to: number, duration: number, current: number): void {
    const steps = 20
    const stepDuration = duration / steps / this.speed
    const deltaV = (to - from) / steps

    for (let i = 0; i <= steps; i++) {
      const timeout = setTimeout(() => {
        if (this.running) {
          const voltage = from + deltaV * i
          this.emit('power-curve-point', {
            timestamp: Date.now(),
            voltage: Math.round(voltage * 100) / 100,
            current: current,
            power: Math.round(voltage * current * 100) / 100,
          })
        }
      }, i * stepDuration)
      this.timeouts.push(timeout)
    }
  }

  private scheduleNegotiationUpdate(): void {
    const timeout = setTimeout(() => {
      if (this.running && this.scenario) {
        const phase = this.getNegotiationPhase()
        this.emit('negotiation-update', {
          phase,
          sourceCapabilities: [],
          selectedCapability: 0,
          requestedVoltage: 0,
          requestedCurrent: 0,
          activeVoltage: this.hardResetOccurred ? 5 : 5,
          activeCurrent: 0,
          hardResetOccurred: this.hardResetOccurred,
          messageIdGap: this.msgIdTracker.gapDetected,
          history: [],
        })
      }
    }, 0)
    this.timeouts.push(timeout)
  }

  private getNegotiationPhase(): string {
    if (!this.scenario) return 'idle'
    if (this.hardResetOccurred) return 'hard_reset'
    if (this.msgIdTracker.gapDetected && !this.msgIdTracker.retransmitRequested) return 'msgid_gap'
    const step = this.currentStep
    const totalSteps = this.scenario.steps.length
    if (step === 0) return 'idle'
    if (step <= 1) return 'capabilities_sent'
    if (step <= 3) return 'request_sent'
    if (step <= 5) return 'accepted'
    if (step < totalSteps - 1) return 'power_transition'
    return 'ready'
  }

  start(scenarioName: string, speed: number = 1): void {
    this.stop()
    this.running = true
    this.speed = speed
    this.scenario = scenarios[scenarioName] || scenarios['standard-5v']
    this.currentStep = 0
    this.messageIdCounter = 0
    this.hardResetOccurred = false
    this.resetMessageIdTracker()

    this.emit('device-status', {
      connected: true,
      deviceName: 'PD Simulator',
      firmwareVersion: 'v1.0.0',
      captureCount: 0,
    })
    this.scheduleNegotiationUpdate()
    this.runNextStep()
  }

  private runNextStep(): void {
    if (!this.running || !this.scenario) return

    if (this.currentStep >= this.scenario.steps.length) {
      this.emit('device-status', {
        connected: true,
        deviceName: 'PD Simulator',
        firmwareVersion: 'v1.0.0',
        captureCount: this.currentStep,
      })
      this.running = false
      return
    }

    const step = this.scenario.steps[this.currentStep]
    const baseDelay = step.delay || 150
    const delay = baseDelay / this.speed

    const timeout = setTimeout(() => {
      if (!this.running) return

      if (step.isHardReset) {
        this.hardResetOccurred = true
        this.resetMessageIdTracker()
        this.emit('hard-reset', {
          timestamp: Date.now(),
          message: step.label || 'Hard Reset',
        })
      }

      const parsed = parsePDMessage(step.bytes, step.direction)
      const formatted = formatPDMessageForRenderer(parsed, this.messageIdCounter++)

      const { isGap } = this.checkMessageIdContinuity(parsed.header.messageId, step.skipMessageId)

      if (isGap && !this.msgIdTracker.retransmitRequested) {
        this.msgIdTracker.retransmitRequested = true
        formatted._meta = {
          messageIdGap: true,
          expectedId: this.msgIdTracker.expectedNextId,
          receivedId: parsed.header.messageId,
        }
      }

      if (step.label) {
        formatted._label = step.label
      }

      if (step.isHardReset) {
        formatted._isHardReset = true
      }

      this.emit('message', formatted)

      if (step.powerCurve) {
        this.schedulePowerCurve(step.powerCurve.from, step.powerCurve.to, step.powerCurve.duration, step.current || 2)
      }

      this.currentStep++
      this.scheduleNegotiationUpdate()
      this.runNextStep()
    }, delay)

    this.timeouts.push(timeout)
  }

  stop(): void {
    this.running = false
    this.clearAllTimeouts()
    this.emit('device-status', {
      connected: false,
      deviceName: '',
      firmwareVersion: '',
      captureCount: 0,
    })
  }
}
