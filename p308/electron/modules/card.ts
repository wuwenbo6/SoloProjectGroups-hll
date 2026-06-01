export interface InternalBlockData {
  blockNumber: number
  data: number[]
  isReadOnly: boolean
  isTrailer: boolean
  isValueBlock?: boolean
}

export interface InternalSectorData {
  sectorNumber: number
  blocks: InternalBlockData[]
  keyA: number[]
  keyB: number[]
  accessBits: number[]
  authenticated: boolean
  authenticatedWith: 'A' | 'B' | null
}

const MANUFACTURER_BLOCK: number[] = [
  0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
  0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f
]

export class MifareCard {
  private sectors: InternalSectorData[] = []

  constructor() {
    this.initializeCard()
  }

  private initializeCard(): void {
    this.sectors = []
    for (let s = 0; s < 16; s++) {
      const sector: InternalSectorData = {
        sectorNumber: s,
        blocks: [],
        keyA: [0xff, 0xff, 0xff, 0xff, 0xff, 0xff],
        keyB: [0xff, 0xff, 0xff, 0xff, 0xff, 0xff],
        accessBits: [0xff, 0x07, 0x80, 0x00],
        authenticated: false,
        authenticatedWith: null
      }

      for (let b = 0; b < 4; b++) {
        const blockNumber = s * 4 + b
        const isTrailer = b === 3
        const isReadOnly = blockNumber === 0

        let data: number[] = []
        if (blockNumber === 0) {
          data = [...MANUFACTURER_BLOCK]
        } else if (isTrailer) {
          data = [
            ...sector.keyA,
            ...sector.accessBits,
            ...sector.keyB
          ]
        } else {
          data = new Array(16).fill(0x00)
        }

        sector.blocks.push({
          blockNumber,
          data,
          isReadOnly,
          isTrailer
        })
      }

      this.sectors.push(sector)
    }
  }

  readBlock(blockNumber: number): number[] | null {
    if (blockNumber < 0 || blockNumber > 63) return null
    const sectorIndex = Math.floor(blockNumber / 4)
    const sector = this.sectors[sectorIndex]

    if (!sector.authenticated) return null

    if (blockNumber === 0 && !sector.authenticated) return null

    const blockIndex = blockNumber % 4
    const block = sector.blocks[blockIndex]

    if (block.isTrailer) {
      if (sector.authenticatedWith === 'A') {
        return [...block.data.slice(0, 6), ...block.data.slice(6, 10), 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
      }
      return [...block.data]
    }

    return [...block.data]
  }

  writeBlock(blockNumber: number, data: number[]): { success: boolean; error?: string } {
    if (blockNumber < 0 || blockNumber > 63) {
      return { success: false, error: 'Invalid block number' }
    }
    if (data.length !== 16) {
      return { success: false, error: 'Data must be 16 bytes' }
    }

    const sectorIndex = Math.floor(blockNumber / 4)
    const sector = this.sectors[sectorIndex]

    if (!sector.authenticated) {
      return { success: false, error: 'Sector not authenticated' }
    }

    if (sector.authenticatedWith === 'A') {
      return { success: false, error: 'Write requires Key B authentication' }
    }

    const blockIndex = blockNumber % 4
    const block = sector.blocks[blockIndex]

    if (block.isReadOnly) {
      return { success: false, error: 'Block is read-only (manufacturer block)' }
    }

    if (block.isTrailer) {
      const newKeyA = data.slice(0, 6)
      const newAccessBits = data.slice(6, 10)
      const newKeyB = data.slice(10, 16)
      sector.keyA = [...newKeyA]
      sector.accessBits = [...newAccessBits]
      sector.keyB = [...newKeyB]
      block.data = [...data]
    } else {
      if (this.isValueBlock(blockNumber)) {
        const validation = MifareCard.validateValueBlockFormat(data)
        if (!validation.valid) {
          return { success: false, error: `Value Block format error: ${validation.error}` }
        }
      }
      block.data = [...data]
    }

    return { success: true }
  }

  authenticateSector(sectorNumber: number, keyType: 'A' | 'B', key: number[]): boolean {
    if (sectorNumber < 0 || sectorNumber > 15) return false
    const sector = this.sectors[sectorNumber]

    if (keyType === 'A') {
      const match = key.length === 6 && key.every((b, i) => b === sector.keyA[i])
      if (match) {
        sector.authenticated = true
        sector.authenticatedWith = 'A'
        return true
      }
    } else {
      const match = key.length === 6 && key.every((b, i) => b === sector.keyB[i])
      if (match) {
        sector.authenticated = true
        sector.authenticatedWith = 'B'
        return true
      }
    }

    return false
  }

  deauthenticateSector(sectorNumber: number): void {
    if (sectorNumber < 0 || sectorNumber > 15) return
    const sector = this.sectors[sectorNumber]
    sector.authenticated = false
    sector.authenticatedWith = null
  }

  deauthenticateAll(): void {
    for (const sector of this.sectors) {
      sector.authenticated = false
      sector.authenticatedWith = null
    }
  }

  isSectorAuthenticated(sectorNumber: number): boolean {
    if (sectorNumber < 0 || sectorNumber > 15) return false
    return this.sectors[sectorNumber].authenticated
  }

  getSectorKeyType(sectorNumber: number): 'A' | 'B' | null {
    if (sectorNumber < 0 || sectorNumber > 15) return null
    return this.sectors[sectorNumber].authenticatedWith
  }

  getAllSectors(): InternalSectorData[] {
    return this.sectors.map((sector) => ({
      ...sector,
      blocks: sector.blocks.map((block) => ({
        ...block,
        data: [...block.data],
        isValueBlock: this.isValueBlock(block.blockNumber)
      })),
      keyA: [...sector.keyA],
      keyB: [...sector.keyB],
      accessBits: [...sector.accessBits]
    }))
  }

  reset(): void {
    this.initializeCard()
  }

  isValueBlock(blockNumber: number): boolean {
    if (blockNumber < 0 || blockNumber > 63) return false
    const sectorIndex = Math.floor(blockNumber / 4)
    const blockIndex = blockNumber % 4

    if (blockIndex === 3) return false

    const sector = this.sectors[sectorIndex]
    const access = sector.accessBits

    const byte0 = access[0]
    const byte1 = access[1]
    const byte2 = access[2]

    const C1 = ((byte1 >> (blockIndex + 4)) & 1) === 1
    const C2 = ((byte2 >> blockIndex) & 1) === 1
    const C3 = ((byte2 >> (blockIndex + 4)) & 1) === 1

    return C1 === true && C2 === true && C3 === false
  }

  static validateValueBlockFormat(data: number[]): {
    valid: boolean
    value?: number
    address?: number
    error?: string
  } {
    if (data.length !== 16) {
      return { valid: false, error: 'Value Block must be 16 bytes' }
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
      return { valid: false, error: 'Address bytes B1 and B2 must match' }
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

  static createValueBlock(value: number, address: number): number[] {
    const data = new Array(16).fill(0)

    data[0] = value & 0xff
    data[1] = (value >> 8) & 0xff
    data[2] = (value >> 16) & 0xff
    data[3] = (value >> 24) & 0xff

    for (let i = 0; i < 4; i++) {
      data[i + 4] = ~data[i] & 0xff
    }

    for (let i = 0; i < 4; i++) {
      data[i + 8] = data[i]
    }

    data[12] = address & 0xff
    data[13] = ~data[12] & 0xff
    data[14] = data[12]
    data[15] = data[13]

    return data
  }
}
