export function bytesToHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')
}

export function hexToBytes(hex: string): number[] {
  const cleaned = hex.replace(/\s+/g, '')
  const result: number[] = []
  for (let i = 0; i < cleaned.length; i += 2) {
    const byte = parseInt(cleaned.substring(i, i + 2), 16)
    if (isNaN(byte)) return []
    result.push(byte)
  }
  return result
}

export function validateHexInput(input: string, expectedLength: number): boolean {
  const bytes = hexToBytes(input)
  return bytes.length === expectedLength && bytes.every((b) => b >= 0 && b <= 255)
}

export function formatBlockData(data: number[]): string {
  const hex = bytesToHex(data)
  const ascii = data
    .map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.'))
    .join('')
  return `${hex}  |${ascii}|`
}

export function generateRandomBytes(length: number): number[] {
  const bytes: number[] = []
  for (let i = 0; i < length; i++) {
    bytes.push(Math.floor(Math.random() * 256))
  }
  return bytes
}

export function getDefaultKeyA(): number[] {
  return [0xff, 0xff, 0xff, 0xff, 0xff, 0xff]
}

export function getDefaultKeyB(): number[] {
  return [0xff, 0xff, 0xff, 0xff, 0xff, 0xff]
}

export function getDefaultAccessBits(): number[] {
  return [0xff, 0x07, 0x80, 0x00]
}

export interface ValueBlockInfo {
  valid: boolean
  value?: number
  address?: number
  error?: string
}

export function parseValueBlock(data: number[]): ValueBlockInfo {
  if (data.length !== 16) {
    return { valid: false, error: 'Must be 16 bytes' }
  }

  const valueBytes = data.slice(0, 4)
  const invertedBytes = data.slice(4, 8)
  const valueBytesRepeat = data.slice(8, 12)
  const addrByte1 = data[12]
  const addrByte1Inv = data[13]
  const addrByte2 = data[14]
  const addrByte2Inv = data[15]

  for (let i = 0; i < 4; i++) {
    if (valueBytes[i] !== valueBytesRepeat[i]) {
      return { valid: false, error: `Value mismatch at byte ${i}` }
    }
    if (invertedBytes[i] !== (~valueBytes[i] & 0xff)) {
      return { valid: false, error: `Inverted value mismatch at byte ${i}` }
    }
  }

  if (addrByte1 !== addrByte2) {
    return { valid: false, error: 'Address bytes B1 != B2' }
  }
  if (addrByte1Inv !== (~addrByte1 & 0xff)) {
    return { valid: false, error: 'Inverted address B1 mismatch' }
  }
  if (addrByte2Inv !== (~addrByte2 & 0xff)) {
    return { valid: false, error: 'Inverted address B2 mismatch' }
  }

  const value =
    (valueBytes[0]) |
    (valueBytes[1] << 8) |
    (valueBytes[2] << 16) |
    (valueBytes[3] << 24)

  const address = addrByte1

  return { valid: true, value, address }
}
