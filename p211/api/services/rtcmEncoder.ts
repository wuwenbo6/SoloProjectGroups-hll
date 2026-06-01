import type { RawxEpoch, RawxMeasurement, ParsedUbxFile } from './ubxParser.js'
import type { SppResult } from './sppSolver.js'

const RTCM_PREAMBLE = 0xd3

const GNSS_TO_RTCM: Record<string, number> = {
  G: 0,
  R: 1,
  E: 2,
  C: 3,
  J: 4,
  S: 5,
}

function crc24q(data: Buffer, offset: number, length: number): number {
  const crcTable = [
    0x000000, 0x864cfb, 0x8ad50d, 0x0c99f6, 0x93e6e1, 0x15aa1a, 0x1933ec, 0x9f7f17,
    0xa18139, 0x27cdc2, 0x2b5434, 0xad18cf, 0x3267d8, 0xb42b23, 0xb8b2d5, 0x3efe2e,
    0xc54e89, 0x430272, 0x4f9b84, 0xc9d77f, 0x56a868, 0xd0e493, 0xdc7d65, 0x5a319e,
    0x64cfb0, 0xe2834b, 0xee1abd, 0x685646, 0xf72951, 0x7165aa, 0x7dfc5c, 0xfbb0a7,
    0xcdb9db, 0x4bf520, 0x476cd6, 0xc1202d, 0x5e5f3a, 0xd813c1, 0xd48a37, 0x52c6cc,
    0x6c38e2, 0xea7419, 0xe6edef, 0x609214, 0xffde03, 0x7992f8, 0x750b0e, 0xf347f5,
    0x08f752, 0x8ebba9, 0x82225f, 0x046ea4, 0x9b11b3, 0x1d5d48, 0x11c4be, 0x978845,
    0xa9766b, 0x2f3a90, 0x23a366, 0xa5ef9d, 0x3a908a, 0xbcdc71, 0xb04587, 0x36097c,
    0x18b3b9, 0x9eff42, 0x9266b4, 0x142a4f, 0x8b5558, 0x0d19a3, 0x018055, 0x87ccae,
    0xb93280, 0x3f7e7b, 0x33e78d, 0xb5ab76, 0x2ad461, 0xac989a, 0xa0016c, 0x264d97,
    0xddfd30, 0x5bb1cb, 0x57283d, 0xd164c6, 0x4e1bd1, 0xc8572a, 0xc4cedc, 0x428227,
    0x7c7c09, 0xfa30f2, 0xf6a904, 0x70e5ff, 0xef9ae8, 0x69d613, 0x654fe5, 0xe3031e,
    0xd50a62, 0x534699, 0x5fdf6f, 0xd99394, 0x46ec83, 0xc0a078, 0xcc398e, 0x4a7575,
    0x748b5b, 0xf2c7a0, 0xfe5e56, 0x7812ad, 0xe76dba, 0x612141, 0x6db8b7, 0xebf44c,
    0x1044eb, 0x960810, 0x9a91e6, 0x1cdd1d, 0x83a20a, 0x05eef1, 0x097707, 0x8f3bfc,
    0xb1c5d2, 0x378929, 0x3b10df, 0xbd5c24, 0x222333, 0xa46fc8, 0xa8f63e, 0x2ebac5,
    0x306773, 0xb62b88, 0xbab27e, 0x3efe85, 0xa38192, 0x25cd69, 0x29549f, 0xaf1864,
    0x91e64a, 0x17aab1, 0x1b3347, 0x9d7fbc, 0x0200ab, 0x844c50, 0x88d5a6, 0x0e995d,
    0xf529fa, 0x736501, 0x7ffcf7, 0xf9b00c, 0x66cf1b, 0xe083e0, 0xec1a16, 0x6a56ed,
    0x54a8c3, 0xd2e438, 0xde7dce, 0x583135, 0xc74e22, 0x4102d9, 0x4d9b2f, 0xcbd7d4,
    0xfddea8, 0x7b9253, 0x770ba5, 0xf1475e, 0x6e3849, 0xe874b2, 0xe4ed44, 0x62a1bf,
    0x5c5f91, 0xda136a, 0xd68a9c, 0x50c667, 0xcfb970, 0x49f58b, 0x456c7d, 0xc32086,
    0x389021, 0xbedcda, 0xb2452c, 0x3409d7, 0xab76c0, 0x2d3a3b, 0x21a3cd, 0xa7ef36,
    0x991118, 0x1f5de3, 0x13c415, 0x9588ee, 0x0af7f9, 0x8cbb02, 0x8022f4, 0x066e0f,
    0x28d4ca, 0xae9831, 0xa201c7, 0x244d3c, 0xbb322b, 0x3d7ed0, 0x31e726, 0xb7abdd,
    0x8955f3, 0x0f1908, 0x0380fe, 0x85cc05, 0x1ab312, 0x9cffe9, 0x90661f, 0x162ae4,
    0xed9a43, 0x6bd6b8, 0x674f4e, 0xe103b5, 0x7e7ca2, 0xf83059, 0xf4a9af, 0x72e554,
    0x4c1b7a, 0xca5781, 0xc6ce77, 0x40828c, 0xdffd9b, 0x59b160, 0x552896, 0xd3646d,
    0xe56a61, 0x63269a, 0x6fbf6c, 0xe9f397, 0x768c80, 0xf0c07b, 0xfc598d, 0x7a1576,
    0x44eb58, 0xc2a7a3, 0xce3e55, 0x4872ae, 0xd70db9, 0x514142, 0x5dd8b4, 0xdb944f,
    0x2024e8, 0xa66813, 0xaaf1e5, 0x2cbd1e, 0xb3c209, 0x358ef2, 0x391704, 0xbf5bff,
    0x81a5d1, 0x07e92a, 0x0b70dc, 0x8d3c27, 0x124330, 0x940fcb, 0x98963d, 0x1edac6,
  ]

  let crc = 0
  for (let i = offset; i < offset + length; i++) {
    crc = ((crc << 8) & 0xffffff) ^ crcTable[((crc >> 16) & 0xff) ^ (data[i] & 0xff)]
  }
  return crc & 0xffffff
}

class BitEncoder {
  private buffer: Buffer
  private bytePos: number
  private bitPos: number

  constructor(maxLength: number) {
    this.buffer = Buffer.alloc(maxLength)
    this.bytePos = 0
    this.bitPos = 0
  }

  addBits(value: number, numBits: number) {
    if (numBits === 0) return
    if (numBits > 32) {
      this.addBits(Math.floor(value / Math.pow(2, numBits - 32)), numBits - 32)
      value = value & 0xffffffff
      numBits = 32
    }

    let bitsLeft = numBits
    while (bitsLeft > 0) {
      const bitsToAdd = Math.min(8 - this.bitPos, bitsLeft)
      const shift = 8 - this.bitPos - bitsToAdd
      const mask = ((1 << bitsToAdd) - 1) << shift
      const shifted = ((value >>> (bitsLeft - bitsToAdd)) << shift) & mask

      this.buffer[this.bytePos] = (this.buffer[this.bytePos] & ~mask) | shifted

      this.bitPos += bitsToAdd
      bitsLeft -= bitsToAdd

      if (this.bitPos >= 8) {
        this.bytePos++
        this.bitPos = 0
      }
    }
  }

  addSigned(value: number, numBits: number) {
    if (value >= 0) {
      this.addBits(value, numBits)
    } else {
      this.addBits((1 << numBits) + value, numBits)
    }
  }

  addBytes(bytes: Buffer) {
    for (let i = 0; i < bytes.length; i++) {
      this.addBits(bytes[i], 8)
    }
  }

  getLength(): number {
    return this.bytePos + (this.bitPos > 0 ? 1 : 0)
  }

  getBuffer(): Buffer {
    return this.buffer.subarray(0, this.getLength())
  }
}

function wrapRtcmMessage(messageType: number, payload: Buffer): Buffer {
  const messageLength = payload.length
  const header = Buffer.alloc(3)
  header[0] = RTCM_PREAMBLE
  header[1] = ((messageType >>> 4) & 0x3f)
  header[2] = ((messageType << 4) & 0xf0) | ((messageLength >>> 6) & 0x0f)

  const messageData = Buffer.concat([header, payload.subarray(0, Math.min(messageLength, 1023))])

  const crc = crc24q(messageData, 0, messageData.length)
  const crcBytes = Buffer.alloc(3)
  crcBytes[0] = (crc >>> 16) & 0xff
  crcBytes[1] = (crc >>> 8) & 0xff
  crcBytes[2] = crc & 0xff

  return Buffer.concat([messageData, crcBytes])
}

export function encodeRtcm1002(
  epoch: RawxEpoch,
  measurements: RawxMeasurement[],
  referenceStationId: number = 1000
): Buffer {
  const encoder = new BitEncoder(1000)

  encoder.addBits(referenceStationId, 12)
  encoder.addBits(Math.floor(epoch.rcvTow * 1000) & 0xfffff, 20)

  const gpsMeas = measurements.filter((m) => m.system === 'G')
  encoder.addBits(gpsMeas.length, 5)

  const syncFlag = 0
  encoder.addBits(syncFlag, 1)

  const divergence = 0
  encoder.addBits(divergence, 1)

  const smoothing = 0
  encoder.addBits(smoothing, 3)

  const smoothingInterval = 0
  encoder.addBits(smoothingInterval, 3)

  for (const meas of gpsMeas) {
    encoder.addBits(meas.svId, 6)

    const l1Code = meas.sigId === 0 ? 0 : meas.sigId === 6 ? 1 : 0
    encoder.addBits(l1Code, 2)

    const prRaw = meas.prMes
    const prScaled = Math.round(prRaw * 0.02)
    encoder.addBits(prScaled >>> 8, 24)

    const prHigh = prScaled & 0xff
    encoder.addBits(prHigh, 8)

    const cpRaw = meas.cpMes
    const cpScaled = Math.round(cpRaw * 1000)
    encoder.addSigned(cpScaled, 20)

    const lockTime = Math.min(meas.locktime, 511)
    const lockIndicator = Math.floor(lockTime / 32)
    encoder.addBits(lockIndicator, 4)

    const cno = meas.cno > 0 ? Math.min(Math.round(meas.cno / 6), 15) : 0
    encoder.addBits(cno, 4)

    const l2Code = 0
    encoder.addBits(l2Code, 2)

    const l2c2 = 0
    encoder.addBits(l2c2, 2)
  }

  const payload = encoder.getBuffer()
  return wrapRtcmMessage(1002, payload)
}

export function encodeRtcm1006(
  ecefX: number,
  ecefY: number,
  ecefZ: number,
  referenceStationId: number = 1000,
  antennaHeight: number = 0
): Buffer {
  const encoder = new BitEncoder(100)

  encoder.addBits(referenceStationId, 12)

  const arpEcefX = Math.round(ecefX * 10000)
  encoder.addBits(arpEcefX & 0x7fffffff, 38)

  const arpEcefY = Math.round(ecefY * 10000)
  encoder.addBits(arpEcefY & 0x7fffffff, 38)

  const arpEcefZ = Math.round(ecefZ * 10000)
  encoder.addBits(arpEcefZ & 0x7fffffff, 38)

  encoder.addBits(1, 1)

  const heightScaled = Math.round(antennaHeight * 100)
  encoder.addBits(heightScaled, 16)

  const payload = encoder.getBuffer()
  return wrapRtcmMessage(1006, payload)
}

export interface RtcmGenerationResult {
  messages: { type: number; size: number }[]
  totalSize: number
  buffer: Buffer
}

export function generateRtcm(
  parsedData: ParsedUbxFile,
  sppResults: SppResult[],
  referenceStationId: number = 1000
): RtcmGenerationResult {
  const allBuffers: Buffer[] = []
  const messages: { type: number; size: number }[] = []

  if (sppResults.length > 0) {
    const avgX = sppResults.reduce((a, r) => a + r.x, 0) / sppResults.length
    const avgY = sppResults.reduce((a, r) => a + r.y, 0) / sppResults.length
    const avgZ = sppResults.reduce((a, r) => a + r.z, 0) / sppResults.length

    const msg1006 = encodeRtcm1006(avgX, avgY, avgZ, referenceStationId, 0)
    allBuffers.push(msg1006)
    messages.push({ type: 1006, size: msg1006.length })
  }

  const epochCount = Math.min(parsedData.epochs.length, 100)
  for (let i = 0; i < epochCount; i++) {
    const epoch = parsedData.epochs[i]
    const msg1002 = encodeRtcm1002(epoch, epoch.measurements, referenceStationId)
    allBuffers.push(msg1002)
    messages.push({ type: 1002, size: msg1002.length })
  }

  const buffer = Buffer.concat(allBuffers)

  return {
    messages,
    totalSize: buffer.length,
    buffer,
  }
}

export function generateRtcmReport(result: RtcmGenerationResult): string {
  let report = ''
  report += 'RTCM 3.2 差分数据报告\n'
  report += '='.repeat(50) + '\n\n'
  report += `消息总数: ${result.messages.length}\n`
  report += `总大小: ${result.totalSize} bytes\n\n`
  report += '消息类型统计:\n'

  const typeCount = new Map<number, number>()
  for (const msg of result.messages) {
    typeCount.set(msg.type, (typeCount.get(msg.type) || 0) + 1)
  }

  for (const [type, count] of typeCount) {
    report += `  MSM ${type}: ${count} 条\n`
  }

  report += '\n支持的消息类型:\n'
  report += '  1002 - GPS L1/L2 伪距和载波相位观测\n'
  report += '  1006 - 基站天线 ECEF 坐标\n'

  return report
}
