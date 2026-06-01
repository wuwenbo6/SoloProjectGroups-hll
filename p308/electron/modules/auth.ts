import { MifareCard } from './card'

function generateRandomBytes(length: number): number[] {
  const bytes: number[] = []
  for (let i = 0; i < length; i++) {
    bytes.push(Math.floor(Math.random() * 256))
  }
  return bytes
}

function xorBytes(a: number[], b: number[]): number[] {
  return a.map((byte, i) => byte ^ b[i % b.length])
}

class Crypto1Engine {
  private state: number[] = new Array(48).fill(0)

  private lfsr(state: number[]): number {
    const f =
      state[0] ^ state[5] ^ state[9] ^ state[10] ^ state[12] ^
      state[14] ^ state[15] ^ state[17] ^ state[18] ^ state[22] ^
      state[23] ^ state[25] ^ state[28] ^ state[32] ^ state[34] ^
      state[38] ^ state[40] ^ state[42] ^ state[43] ^ state[45] ^
      state[47]
    state.shift()
    state.push(f)
    return f
  }

  init(key: number[], uid: number[], randomChallenge: number[]): void {
    this.state = new Array(48).fill(0)

    const combined = [...uid, ...randomChallenge]
    for (let i = 0; i < 48; i++) {
      const bit = (key[Math.floor(i / 8)] >> (7 - (i % 8))) & 1
      this.lfsr(this.state)
      this.state[47] ^= bit
      if (i < combined.length * 8) {
        const inputBit = (combined[Math.floor(i / 8)] >> (7 - (i % 8))) & 1
        this.state[47] ^= inputBit
      }
    }
  }

  generateKeystream(length: number): number[] {
    const result: number[] = []
    for (let i = 0; i < length; i++) {
      let byte = 0
      for (let bit = 0; bit < 8; bit++) {
        byte = (byte << 1) | this.lfsr(this.state)
      }
      result.push(byte)
    }
    return result
  }

  encrypt(data: number[]): number[] {
    const keystream = this.generateKeystream(data.length)
    return xorBytes(data, keystream)
  }

  decrypt(data: number[]): number[] {
    return this.encrypt(data)
  }
}

export class AuthenticationModule {
  private card: MifareCard
  private crypto1: Crypto1Engine

  constructor(card: MifareCard) {
    this.card = card
    this.crypto1 = new Crypto1Engine()
  }

  authenticate(
    sector: number,
    keyType: 'A' | 'B',
    key: number[]
  ): { success: boolean; sector: number; keyType: 'A' | 'B'; error?: string } {
    if (sector < 0 || sector > 15) {
      return { success: false, sector, keyType, error: 'Invalid sector number' }
    }

    if (key.length !== 6) {
      return { success: false, sector, keyType, error: 'Key must be 6 bytes' }
    }

    const cardChallenge = generateRandomBytes(8)

    const uid = [0x00, 0x01, 0x02, 0x03]
    this.crypto1.init(key, uid, cardChallenge)

    const readerChallenge = generateRandomBytes(8)
    const encryptedReaderChallenge = this.crypto1.encrypt(readerChallenge)

    const readerResponse = generateRandomBytes(4)
    const encryptedReaderResponse = this.crypto1.encrypt(readerResponse)

    const verified = this.card.authenticateSector(sector, keyType, key)

    if (verified) {
      return {
        success: true,
        sector,
        keyType
      }
    }

    return {
      success: false,
      sector,
      keyType,
      error: `Authentication failed - ${keyType} key mismatch for sector ${sector}`
    }
  }
}
