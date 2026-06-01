import type { HARTFrame, HARTResponse } from '../../shared/types'

const HART_PREAMBLE_LENGTH = 5
const HART_PREAMBLE_BYTE = 0xFF
const HART_DELIMITER_STX = 0x02
const HART_DELIMITER_ACK = 0x06

const HART_UNITS: { [key: number]: string } = {
  0x01: '%',
  0x04: 'mA',
  0x17: '°C',
  0x18: '°F',
  0x19: 'K',
  0x1A: 'kPa',
  0x1B: 'bar',
  0x1C: 'mbar',
  0x1D: 'mmHg',
  0x1E: 'mmH2O',
  0x1F: 'psi',
  0x20: 'kg/cm²',
  0x21: 'atm',
  0x22: 'Pa',
  0x23: 'inH2O',
  0x24: 'inHg',
  0x25: 'ftH2O',
  0x26: 'g/m³',
  0x27: 'kg/m³',
  0x28: 'g/l',
  0x29: 'm/s',
  0x2A: 'km/h',
  0x2B: 'ft/s',
  0x2C: 'mph',
  0x2D: 'Hz',
  0x2E: 'rpm',
  0x2F: 'mm',
  0x30: 'cm',
  0x31: 'm',
  0x32: 'in',
  0x33: 'ft',
  0x34: 'm³/h',
  0x35: 'm³/min',
  0x36: 'l/h',
  0x37: 'l/min',
  0x38: 'gal/h',
  0x39: 'gal/min',
  0xFF: 'N/A',
}

export class HARTProtocol {
  private preambleLength: number

  constructor(preambleLength: number = HART_PREAMBLE_LENGTH) {
    this.preambleLength = preambleLength
  }

  buildFrame(command: number, address: number[] = [0x00], data: number[] = []): HARTFrame {
    const byteCount = data.length

    const frame: HARTFrame = {
      preamble: new Array(this.preambleLength).fill(HART_PREAMBLE_BYTE),
      delimiter: HART_DELIMITER_STX,
      address: [...address],
      command,
      byteCount,
      data: [...data],
      checksum: 0,
    }

    frame.checksum = this.calculateChecksum(frame)

    return frame
  }

  frameToBytes(frame: HARTFrame): Uint8Array {
    const bytes: number[] = []

    bytes.push(...frame.preamble)
    bytes.push(frame.delimiter)
    bytes.push(...frame.address)
    bytes.push(frame.command)
    bytes.push(frame.byteCount)
    bytes.push(...frame.data)
    bytes.push(frame.checksum)

    return new Uint8Array(bytes)
  }

  bytesToFrame(bytes: Uint8Array): HARTFrame | null {
    if (bytes.length < 5) return null

    let preambleEnd = 0
    while (preambleEnd < bytes.length && bytes[preambleEnd] === HART_PREAMBLE_BYTE) {
      preambleEnd++
    }

    if (preambleEnd < 2) return null

    const headerStart = preambleEnd
    if (headerStart + 3 > bytes.length) return null

    const delimiter = bytes[headerStart]
    const isLongAddress = (bytes[headerStart + 1] & 0x80) !== 0
    const addressLength = isLongAddress ? 5 : 1

    if (headerStart + addressLength + 3 > bytes.length) return null

    const address = Array.from(bytes.slice(headerStart + 1, headerStart + 1 + addressLength))
    const command = bytes[headerStart + 1 + addressLength]
    const byteCount = bytes[headerStart + 2 + addressLength]
    const dataStart = headerStart + 3 + addressLength
    const dataEnd = dataStart + byteCount

    if (dataEnd + 1 > bytes.length) return null

    const data = Array.from(bytes.slice(dataStart, dataEnd))
    const checksum = bytes[dataEnd]

    const frame: HARTFrame = {
      preamble: Array.from(bytes.slice(0, preambleEnd)),
      delimiter,
      address,
      command,
      byteCount,
      data,
      checksum,
    }

    return frame
  }

  calculateChecksum(frame: HARTFrame): number {
    let checksum = frame.delimiter

    for (const byte of frame.address) {
      checksum ^= byte
    }

    checksum ^= frame.command
    checksum ^= frame.byteCount

    for (const byte of frame.data) {
      checksum ^= byte
    }

    return checksum
  }

  verifyChecksum(frame: HARTFrame): boolean {
    return this.calculateChecksum(frame) === frame.checksum
  }

  parseResponse(frame: HARTFrame): HARTResponse | null {
    if (frame.data.length < 2) return null

    const responseCode = frame.data[0]
    const deviceStatus = frame.data[1]
    const responseData = frame.data.slice(2)

    const response: HARTResponse = {
      responseCode,
      deviceStatus,
      data: responseData,
    }

    if (frame.command === 0 && responseData.length >= 12) {
      console.log('Device ID:', responseData.slice(0, 12))
    }

    if (frame.command === 1 && responseData.length >= 4) {
      response.pv = this.parseFloat(responseData.slice(0, 4))
    }

    if (frame.command === 2 && responseData.length >= 8) {
      response.pv = this.parseFloat(responseData.slice(0, 4))
    }

    if (frame.command === 3 && responseData.length >= 20) {
      response.pv = this.parseFloat(responseData.slice(0, 4))
      response.sv = this.parseFloat(responseData.slice(4, 8))
      response.tv = this.parseFloat(responseData.slice(8, 12))
      response.fv = this.parseFloat(responseData.slice(12, 16))
      const unitCode = responseData[16]
      response.units = HART_UNITS[unitCode] || 'Unknown'
    }

    return response
  }

  private parseFloat(bytes: number[]): number {
    if (bytes.length !== 4) return NaN

    const buffer = new ArrayBuffer(4)
    const view = new DataView(buffer)

    for (let i = 0; i < 4; i++) {
      view.setUint8(i, bytes[i])
    }

    return view.getFloat32(0, false)
  }

  floatToBytes(value: number): number[] {
    const buffer = new ArrayBuffer(4)
    const view = new DataView(buffer)
    view.setFloat32(0, value, false)

    const bytes: number[] = []
    for (let i = 0; i < 4; i++) {
      bytes.push(view.getUint8(i))
    }

    return bytes
  }

  buildCommandFrame(command: number, data: number[] = []): Uint8Array {
    const frame = this.buildFrame(command, [0x00], data)
    return this.frameToBytes(frame)
  }

  getUnitDescription(unitCode: number): string {
    return HART_UNITS[unitCode] || `Unknown (0x${unitCode.toString(16).padStart(2, '0')})`
  }

  extractResponseBytes(rawBytes: Uint8Array): Uint8Array | null {
    let preambleCount = 0
    let startIndex = -1

    for (let i = 0; i < rawBytes.length; i++) {
      if (rawBytes[i] === HART_PREAMBLE_BYTE) {
        preambleCount++
      } else if (preambleCount >= 2) {
        startIndex = i
        break
      } else {
        preambleCount = 0
      }
    }

    if (startIndex < 0) return null

    return rawBytes.slice(startIndex - preambleCount)
  }
}

export function createHARTProtocol(preambleLength?: number) {
  return new HARTProtocol(preambleLength)
}
