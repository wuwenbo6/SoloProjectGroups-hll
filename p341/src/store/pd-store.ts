import { create } from 'zustand'
import type {
  PDMessage,
  PDMessageType,
  NegotiationState,
  PowerCurvePoint,
  DeviceStatus,
  SimulationScenario,
  MessageIdGapEvent,
  HardResetEvent,
} from '../types/pd'

const MAX_MESSAGES = 500
const MAX_POWER_CURVE_POINTS = 1000

const initialNegotiation: NegotiationState = {
  phase: 'idle',
  sourceCapabilities: [],
  selectedCapability: 0,
  requestedVoltage: 0,
  requestedCurrent: 0,
  activeVoltage: 0,
  activeCurrent: 0,
  history: [],
  hardResetOccurred: false,
  messageIdGap: false,
}

const initialDeviceStatus: DeviceStatus = {
  connected: false,
  deviceName: '',
  firmwareVersion: '',
  captureCount: 0,
}

const defaultScenarios: SimulationScenario[] = [
  { id: 'standard-5v', name: 'Standard 5V', description: 'Standard 5V/3A negotiation' },
  { id: 'standard-9v', name: 'Standard 9V', description: 'Standard 9V/3A negotiation' },
  { id: 'standard-20v', name: 'Standard 20V', description: 'Standard 20V/5A negotiation' },
  { id: 'pps-negotiation', name: 'PPS Negotiation', description: 'Programmable Power Supply negotiation' },
  { id: 'rejected-request', name: 'Rejected Request', description: 'Request rejected by source' },
  { id: 'renegotiation', name: 'Renegotiation', description: 'Power contract renegotiation' },
  { id: 'msgid-gap-retransmit', name: 'MsgID Gap + Retransmit', description: 'MessageID gap detected, soft reset & retransmit' },
  { id: 'hard-reset-renegotiate', name: 'Hard Reset + Renegotiate', description: 'Hard reset after error, re-negotiate from scratch' },
]

interface PDStoreState {
  messages: PDMessage[]
  negotiation: NegotiationState
  powerCurve: PowerCurvePoint[]
  deviceStatus: DeviceStatus
  selectedMessageId: string | null
  filterType: PDMessageType | 'ALL'
  isSimulating: boolean
  simulationSpeed: number
  currentScenario: string
  scenarios: SimulationScenario[]
  messageIdGapEvents: MessageIdGapEvent[]
  hardResetEvents: HardResetEvent[]
  lastExpectedMessageId: number

  addMessage: (msg: PDMessage) => void
  updateNegotiation: (state: NegotiationState) => void
  addPowerCurvePoint: (point: PowerCurvePoint) => void
  updateDeviceStatus: (status: DeviceStatus) => void
  selectMessage: (id: string | null) => void
  setFilterType: (type: PDMessageType | 'ALL') => void
  setSimulating: (val: boolean) => void
  setSimulationSpeed: (speed: number) => void
  setCurrentScenario: (scenario: string) => void
  clearMessages: () => void
  getFilteredMessages: () => PDMessage[]
  addMessageIdGapEvent: (event: MessageIdGapEvent) => void
  addHardResetEvent: (event: HardResetEvent) => void
  setLastExpectedMessageId: (id: number) => void
  exportPowerCurveCSV: () => string
  exportMessagesCSV: () => string
}

export const usePDStore = create<PDStoreState>()((set, get) => ({
  messages: [],
  negotiation: initialNegotiation,
  powerCurve: [],
  deviceStatus: initialDeviceStatus,
  selectedMessageId: null,
  filterType: 'ALL',
  isSimulating: false,
  simulationSpeed: 1,
  currentScenario: 'standard-5v',
  scenarios: defaultScenarios,
  messageIdGapEvents: [],
  hardResetEvents: [],
  lastExpectedMessageId: 0,

  addMessage: (msg) =>
    set((state) => {
      const newMessages = [...state.messages, msg].slice(-MAX_MESSAGES)
      const newGapEvents = [...state.messageIdGapEvents]
      const newHardResetEvents = [...state.hardResetEvents]
      const newNegotiation = { ...state.negotiation }

      if (msg._meta?.messageIdGap) {
        newGapEvents.push({
          expectedId: msg._meta.expectedId,
          receivedId: msg._meta.receivedId,
          lastId: msg._meta.receivedId - 1,
          timestamp: msg.timestamp,
        })
        newNegotiation.messageIdGap = true
      }

      if (msg._isHardReset) {
        newHardResetEvents.push({
          timestamp: msg.timestamp,
          message: msg._label || 'Hard Reset',
        })
        newNegotiation.hardResetOccurred = true
        newNegotiation.phase = 'hard_reset'
      }

      if (msg.header.messageType === 'SOFT_RESET') {
        newNegotiation.phase = 'retransmitting'
        newNegotiation.messageIdGap = false
      }

      return {
        messages: newMessages,
        messageIdGapEvents: newGapEvents,
        hardResetEvents: newHardResetEvents,
        negotiation: newNegotiation,
      }
    }),

  updateNegotiation: (negotiation) => set({ negotiation }),

  addPowerCurvePoint: (point) =>
    set((state) => ({
      powerCurve: [...state.powerCurve, point].slice(-MAX_POWER_CURVE_POINTS),
    })),

  updateDeviceStatus: (deviceStatus) => set({ deviceStatus }),

  selectMessage: (selectedMessageId) => set({ selectedMessageId }),

  setFilterType: (filterType) => set({ filterType }),

  setSimulating: (isSimulating) => set({ isSimulating }),

  setSimulationSpeed: (simulationSpeed) => set({ simulationSpeed }),

  setCurrentScenario: (currentScenario) => set({ currentScenario }),

  clearMessages: () =>
    set({
      messages: [],
      powerCurve: [],
      negotiation: initialNegotiation,
      messageIdGapEvents: [],
      hardResetEvents: [],
      lastExpectedMessageId: 0,
    }),

  getFilteredMessages: () => {
    const { messages, filterType } = get()
    if (filterType === 'ALL') return messages
    return messages.filter((m) => m.header.messageType === filterType)
  },

  addMessageIdGapEvent: (event) =>
    set((state) => ({
      messageIdGapEvents: [...state.messageIdGapEvents, event],
    })),

  addHardResetEvent: (event) =>
    set((state) => ({
      hardResetEvents: [...state.hardResetEvents, event],
    })),

  setLastExpectedMessageId: (lastExpectedMessageId) => set({ lastExpectedMessageId }),

  exportPowerCurveCSV: () => {
    const { powerCurve } = get()
    const header = 'timestamp,voltage_V,current_A,power_W'
    const rows = powerCurve.map(
      (p) => `${p.timestamp},${p.voltage},${p.current},${p.power}`
    )
    return [header, ...rows].join('\n')
  },

  exportMessagesCSV: () => {
    const { messages } = get()
    const header = 'timestamp,message_type,message_id,direction,num_data_objects,raw_hex,label,voltage_mv,current_ma,is_extended,is_hard_reset'
    const rows = messages.map((m) => {
      const voltage = m.dataObjects?.[0]?.voltageMV ?? ''
      const current = m.dataObjects?.[0]?.currentMA ?? ''
      const isExtended = m.header.extended ? '1' : '0'
      const isHardReset = m._isHardReset ? '1' : '0'
      const label = m._label ?? ''
      return `${m.timestamp},${m.header.messageType},${m.header.messageId},${m.direction},${m.header.numDataObjects},"${m.rawHex}","${label}",${voltage},${current},${isExtended},${isHardReset}`
    })
    return [header, ...rows].join('\n')
  },
}))
