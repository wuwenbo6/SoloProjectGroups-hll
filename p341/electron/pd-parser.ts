type PDMessageType =
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
  | 'VENDOR_DEFINED'
  | 'PING'
  | 'HARDRST'
  | 'UNKNOWN'
  | 'PPS_STATUS'
  | 'SOURCE_CAPABILITIES_EXTENDED'
  | 'BATTERY_CAPABILITIES'
  | 'GET_BATTERY_CAP'
  | 'GET_COUNTRY_INFO'
  | 'COUNTRY_INFO'
  | 'FW_UPDATE_REQUEST'
  | 'FW_UPDATE_RESPONSE'
  | 'SECURITY_REQUEST'
  | 'SECURITY_RESPONSE'
  | 'SINK_CAPABILITIES_EXTENDED'

interface PDMessageHeader {
  extended: boolean
  numDataObjects: number
  messageId: number
  portPowerRole: boolean
  specRevision: number
  messageType: number
  messageTypeName: PDMessageType
  chunked?: boolean
  chunkNumber?: number
  requestChunk?: number
  dataSize?: number
}

interface PDDataObject {
  position: number
  type: 'fixed' | 'battery' | 'variable' | 'apdo'
  voltage?: number
  current?: number
  minVoltage?: number
  maxVoltage?: number
  maxPower?: number
  maxCurrent?: number
  raw: number
  ppsPowerLimited?: boolean
  dualRolePower?: boolean
  usbCommunicationsCapable?: boolean
  unconstrainedPower?: boolean
}

interface PPSStatusData {
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

interface ExtendedMessageData {
  messageType: string
  rawData: number[]
  ppsStatus?: PPSStatusData
  sourceCapExtended?: {
    vid: number
    pid: number
    xid: number
    fwVersion: number
    numPDOs: number
  }
}

interface PDMessage {
  header: PDMessageHeader
  dataObjects: PDDataObject[]
  rawBytes: number[]
  direction: string
  timestamp: number
  extendedData?: ExtendedMessageData
}

interface RendererPDMessage {
  id: string
  timestamp: number
  rawHex: string
  header: {
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
  dataObjects?: Array<{
    position: number
    type: 'fixed' | 'battery' | 'variable' | 'apsdo'
    voltageMV: number
    currentMA: number
    maxPowerMW: number
    rawValue: number
    minVoltageMV?: number
    maxVoltageMV?: number
    ppsPowerLimited?: boolean
    dualRolePower?: boolean
    usbCommunicationsCapable?: boolean
    unconstrainedPower?: boolean
  }>
  direction: 'SOP' | "SOP'"
  _label?: string
  _meta?: {
    messageIdGap: boolean
    expectedId: number
    receivedId: number
  }
  _isHardReset?: boolean
  extendedData?: ExtendedMessageData
}

const CONTROL_MESSAGE_TYPES: Record<number, PDMessageType> = {
  1: 'GOODCRC',
  2: 'GOTOMIN',
  3: 'ACCEPT',
  4: 'REJECT',
  5: 'PING',
  6: 'PS_RDY',
  10: 'NOT_SUPPORTED',
  11: 'WAIT',
  12: 'SOFT_RESET',
  13: 'HARDRST',
}

const DATA_MESSAGE_TYPES: Record<number, PDMessageType> = {
  1: 'SOURCE_CAPABILITIES',
  2: 'REQUEST',
  3: 'BIST',
  4: 'SINK_CAPABILITIES',
  5: 'BATTERY_STATUS',
  6: 'ALERT',
  7: 'GET_SOURCE_CAP',
  8: 'GET_SINK_CAP',
  9: 'DR_SWAP',
  10: 'PR_SWAP',
  11: 'VCONN_SWAP',
  12: 'WAIT',
  13: 'NOT_SUPPORTED',
  14: 'GOTOMIN',
  15: 'ACCEPT',
  16: 'REJECT',
  17: 'PS_RDY',
  18: 'SOFT_RESET',
  20: 'VENDOR_DEFINED',
}

const EXTENDED_MESSAGE_TYPES: Record<number, PDMessageType> = {
  1: 'SOURCE_CAPABILITIES_EXTENDED',
  2: 'SINK_CAPABILITIES_EXTENDED',
  3: 'BATTERY_CAPABILITIES',
  4: 'GET_BATTERY_CAP',
  5: 'GET_COUNTRY_INFO',
  6: 'COUNTRY_INFO',
  7: 'FW_UPDATE_REQUEST',
  8: 'FW_UPDATE_RESPONSE',
  9: 'SECURITY_REQUEST',
  10: 'SECURITY_RESPONSE',
  15: 'PPS_STATUS',
}

function parseHeader(raw16: number): PDMessageHeader {
  const extended = ((raw16 >> 15) & 0x01) === 1
  const numDataObjects = (raw16 >> 12) & 0x07
  const messageId = (raw16 >> 9) & 0x07
  const portPowerRole = ((raw16 >> 8) & 0x01) === 1
  const specRevision = (raw16 >> 6) & 0x03
  const messageType = raw16 & 0x3f

  let messageTypeName: PDMessageType = 'UNKNOWN'
  if (extended) {
    messageTypeName = EXTENDED_MESSAGE_TYPES[messageType] || 'UNKNOWN'
  } else if (numDataObjects === 0) {
    messageTypeName = CONTROL_MESSAGE_TYPES[messageType] || 'UNKNOWN'
  } else {
    messageTypeName = DATA_MESSAGE_TYPES[messageType] || 'UNKNOWN'
  }

  const result: PDMessageHeader = {
    extended,
    numDataObjects,
    messageId,
    portPowerRole,
    specRevision,
    messageType,
    messageTypeName,
  }

  return result
}

function parseExtendedHeader(raw16: number): { chunked: boolean; chunkNumber: number; requestChunk: number; dataSize: number } {
  return {
    chunked: ((raw16 >> 15) & 0x01) === 1,
    chunkNumber: (raw16 >> 8) & 0x07,
    requestChunk: (raw16 >> 9) & 0x07,
    dataSize: raw16 & 0x1ff,
  }
}

function parsePPSStatus(rawByte: number): PPSStatusData {
  return {
    outputVoltageMV: 0,
    outputCurrentMA: 0,
    flags: {
      overCurrent: (rawByte & 0x01) === 1,
      overVoltage: ((rawByte >> 1) & 0x01) === 1,
      inputOverCurrent: ((rawByte >> 2) & 0x01) === 1,
      inputOverVoltage: ((rawByte >> 3) & 0x01) === 1,
      powerLimited: ((rawByte >> 4) & 0x01) === 1,
      sourcePpsCapable: ((rawByte >> 5) & 0x01) === 1,
      sinkPpsCapable: ((rawByte >> 6) & 0x01) === 1,
    },
    rawByte,
  }
}

function parsePDO(raw32: number, position: number): PDDataObject {
  const typeBits = (raw32 >> 30) & 0x03
  let type: 'fixed' | 'battery' | 'variable' | 'apdo'

  switch (typeBits) {
    case 0:
      type = 'fixed'
      break
    case 1:
      type = 'battery'
      break
    case 2:
      type = 'variable'
      break
    case 3:
      type = 'apdo'
      break
    default:
      type = 'fixed'
  }

  const result: PDDataObject = {
    position,
    type,
    raw: raw32,
  }

  if (type === 'fixed') {
    result.voltage = ((raw32 >> 10) & 0x3ff) * 0.05
    result.current = (raw32 & 0x3ff) * 0.01
    result.dualRolePower = ((raw32 >> 29) & 0x01) === 1
    result.usbCommunicationsCapable = ((raw32 >> 28) & 0x01) === 1
    result.unconstrainedPower = ((raw32 >> 27) & 0x01) === 1
  } else if (type === 'battery') {
    result.minVoltage = ((raw32 >> 10) & 0x3ff) * 0.05
    result.maxPower = (raw32 & 0x3ff) * 0.25
  } else if (type === 'variable') {
    result.maxVoltage = ((raw32 >> 20) & 0x3ff) * 0.05
    result.minVoltage = ((raw32 >> 10) & 0x3ff) * 0.05
    result.maxCurrent = (raw32 & 0x3ff) * 0.01
  } else if (type === 'apdo') {
    result.maxVoltage = ((raw32 >> 17) & 0xff) * 0.1
    result.minVoltage = ((raw32 >> 8) & 0xff) * 0.1
    result.maxCurrent = (raw32 & 0x7f) * 0.05
    result.ppsPowerLimited = ((raw32 >> 27) & 0x01) === 1
  }

  return result
}

function parsePDMessage(rawBytes: number[], direction: string = 'SOP'): PDMessage {
  const headerRaw = (rawBytes[1] << 8) | rawBytes[0]
  const header = parseHeader(headerRaw)
  const dataObjects: PDDataObject[] = []
  let extendedData: ExtendedMessageData | undefined

  if (header.extended && rawBytes.length > 2) {
    const extHeaderRaw = (rawBytes[3] << 8) | rawBytes[2]
    const extHeader = parseExtendedHeader(extHeaderRaw)
    header.chunked = extHeader.chunked
    header.chunkNumber = extHeader.chunkNumber
    header.requestChunk = extHeader.requestChunk
    header.dataSize = extHeader.dataSize

    const extPayload = rawBytes.slice(4, 4 + extHeader.dataSize)

    if (header.messageTypeName === 'PPS_STATUS' && extPayload.length >= 1) {
      const ppsStatus = parsePPSStatus(extPayload[0])
      extendedData = {
        messageType: 'PPS_STATUS',
        rawData: extPayload,
        ppsStatus,
      }
    } else if (header.messageTypeName === 'SOURCE_CAPABILITIES_EXTENDED' && extPayload.length >= 16) {
      const vid = extPayload[1] | (extPayload[0] << 8)
      const pid = extPayload[3] | (extPayload[2] << 8)
      const xid = extPayload[7] | (extPayload[6] << 8) | (extPayload[5] << 16) | (extPayload[4] << 24)
      const fwVersion = extPayload[9] | (extPayload[8] << 8)
      const numPDOs = extPayload[10] & 0x07
      extendedData = {
        messageType: 'SOURCE_CAPABILITIES_EXTENDED',
        rawData: extPayload,
        sourceCapExtended: { vid, pid, xid, fwVersion, numPDOs },
      }
    } else {
      extendedData = {
        messageType: header.messageTypeName,
        rawData: extPayload,
      }
    }
  } else {
    for (let i = 0; i < header.numDataObjects; i++) {
      const offset = 2 + i * 4
      if (offset + 3 < rawBytes.length) {
        const pdoRaw =
          (rawBytes[offset + 3] << 24) |
          (rawBytes[offset + 2] << 16) |
          (rawBytes[offset + 1] << 8) |
          rawBytes[offset]
        dataObjects.push(parsePDO(pdoRaw, i + 1))
      }
    }
  }

  return {
    header,
    dataObjects,
    rawBytes,
    direction,
    timestamp: Date.now(),
    extendedData,
  }
}

function formatPDMessageForRenderer(msg: PDMessage, counter: number): RendererPDMessage {
  const rawHex = msg.rawBytes.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')

  const rendererDataObjects = msg.dataObjects.map((pdo) => {
    const base: any = {
      position: pdo.position,
      type: (pdo.type === 'apdo' ? 'apsdo' : pdo.type) as 'fixed' | 'battery' | 'variable' | 'apsdo',
      voltageMV: Math.round((pdo.voltage || pdo.maxVoltage || 0) * 1000),
      currentMA: Math.round((pdo.current || pdo.maxCurrent || 0) * 1000),
      maxPowerMW: Math.round((pdo.maxPower || 0) * 1000),
      rawValue: pdo.raw,
    }
    if (pdo.type === 'apdo') {
      base.minVoltageMV = Math.round((pdo.minVoltage || 0) * 1000)
      base.maxVoltageMV = Math.round((pdo.maxVoltage || 0) * 1000)
      base.ppsPowerLimited = pdo.ppsPowerLimited
    }
    if (pdo.type === 'fixed') {
      base.dualRolePower = pdo.dualRolePower
      base.usbCommunicationsCapable = pdo.usbCommunicationsCapable
      base.unconstrainedPower = pdo.unconstrainedPower
    }
    return base
  })

  return {
    id: `msg-${Date.now()}-${counter}`,
    timestamp: msg.timestamp,
    rawHex,
    header: {
      messageType: msg.header.messageTypeName,
      messageId: msg.header.messageId,
      portDataRole: msg.header.portPowerRole ? 'Source' : 'Sink',
      portPowerRole: msg.header.portPowerRole ? 'Source' : 'Sink',
      specificationRevision: msg.header.specRevision,
      numDataObjects: msg.header.numDataObjects,
      extended: msg.header.extended,
      chunked: msg.header.chunked,
      chunkNumber: msg.header.chunkNumber,
      dataSize: msg.header.dataSize,
    },
    dataObjects: rendererDataObjects.length > 0 ? rendererDataObjects : undefined,
    direction: msg.direction as 'SOP' | "SOP'",
    extendedData: msg.extendedData,
  }
}

export { parsePDMessage, parseHeader, parsePDO, formatPDMessageForRenderer }
export type { PDMessage, PDMessageHeader, PDDataObject, PDMessageType, RendererPDMessage, ExtendedMessageData, PPSStatusData }
