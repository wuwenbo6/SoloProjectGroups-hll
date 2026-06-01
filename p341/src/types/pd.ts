export type PDMessageType =
  | 'SOURCE_CAPABILITIES'
  | 'REQUEST'
  | 'BIST'
  | 'SINK_CAPABILITIES'
  | 'BATTERY_STATUS'
  | 'ALERT'
  | 'GET_SOURCE_CAP'
  | 'GET_SINK_CAP'
  | 'DR_SWAP'
  | 'PR_SWAP'
  | 'VCONN_SWAP'
  | 'WAIT'
  | 'NOT_SUPPORTED'
  | 'GOODCRC'
  | 'GOTOMIN'
  | 'ACCEPT'
  | 'REJECT'
  | 'PS_RDY'
  | 'SOFT_RESET'
  | 'HARD_RESET'
  | 'VENDOR_DEFINED'
  | 'PPS_STATUS'
  | 'SOURCE_CAPABILITIES_EXTENDED'
  | 'BATTERY_CAPABILITIES'
  | 'SINK_CAPABILITIES_EXTENDED'

export interface PDMessage {
  id: string
  timestamp: number
  rawHex: string
  header: PDMessageHeader
  dataObjects?: PDDataObject[]
  direction: 'SOP' | "SOP'"
  _label?: string
  _meta?: MessageMeta
  _isHardReset?: boolean
  extendedData?: ExtendedMessageData
}

export interface MessageMeta {
  messageIdGap: boolean
  expectedId: number
  receivedId: number
}

export interface PDMessageHeader {
  messageType: PDMessageType
  messageId: number
  portDataRole: 'Source' | 'Sink'
  portPowerRole: 'Source' | 'Sink'
  specificationRevision: number
  numDataObjects: number
  extended?: boolean
  chunked?: boolean
  chunkNumber?: number
  dataSize?: number
}

export interface PDDataObject {
  position: number
  type: 'fixed' | 'battery' | 'variable' | 'apsdo'
  voltageMV: number
  currentMA: number
  maxPowerMW: number
  rawValue: number
  dualRolePower?: boolean
  usbCommunicationsCapable?: boolean
  unconstrainedPower?: boolean
  ppsPowerLimited?: boolean
  minVoltageMV?: number
  maxVoltageMV?: number
}

export interface ExtendedMessageData {
  messageType: string
  rawData: number[]
  ppsStatus?: {
    outputVoltageMV: number
    outputCurrentMA: number
    flags: {
      overCurrent: boolean
      overVoltage: boolean
      inputOverCurrent: boolean
      inputOverVoltage: boolean
      powerLimited: boolean
      sourcePpsCapable: boolean
      sinkPpsCapable: boolean
    }
    rawByte: number
  }
  sourceCapExtended?: {
    vid: number
    pid: number
    xid: number
    fwVersion: number
    numPDOs: number
  }
}

export interface NegotiationState {
  phase: 'idle' | 'capabilities_sent' | 'request_sent' | 'accepted' | 'power_transition' | 'ready' | 'rejected' | 'hard_reset' | 'msgid_gap' | 'retransmitting'
  sourceCapabilities: PDDataObject[]
  selectedCapability: number
  requestedVoltage: number
  requestedCurrent: number
  activeVoltage: number
  activeCurrent: number
  history: NegotiationEvent[]
  hardResetOccurred?: boolean
  messageIdGap?: boolean
}

export interface NegotiationEvent {
  timestamp: number
  phase: NegotiationState['phase']
  message: string
  voltage: number
  current: number
}

export interface DeviceStatus {
  connected: boolean
  deviceName: string
  firmwareVersion: string
  captureCount: number
}

export interface PowerCurvePoint {
  timestamp: number
  voltage: number
  current: number
  power: number
}

export interface SimulationScenario {
  id: string
  name: string
  description: string
}

export interface MessageIdGapEvent {
  expectedId: number
  receivedId: number
  lastId: number
  timestamp: number
}

export interface HardResetEvent {
  timestamp: number
  message: string
}
