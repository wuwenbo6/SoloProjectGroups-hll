import { MifareCard } from './card'
import { AuthenticationModule } from './auth'
import { InternalSectorData } from './card'

export class VirtualReader {
  private card: MifareCard
  private authModule: AuthenticationModule
  private connected: boolean = false
  private readonly id: string = 'virtual-reader-001'
  private readonly name: string = 'Virtual PC/SC Reader'

  constructor(card: MifareCard, authModule: AuthenticationModule) {
    this.card = card
    this.authModule = authModule
  }

  connect(): void {
    this.connected = true
  }

  disconnect(): void {
    this.connected = false
    this.card.deauthenticateAll()
  }

  getInfo(): { id: string; name: string; isVirtual: boolean; connected: boolean } {
    return {
      id: this.id,
      name: this.name,
      isVirtual: true,
      connected: this.connected
    }
  }

  transmit(apdu: number[]): { data: number[]; sw1: number; sw2: number } {
    if (!this.connected) {
      return { data: [], sw1: 0x6a, sw2: 0x81 }
    }

    if (apdu.length < 4) {
      return { data: [], sw1: 0x67, sw2: 0x00 }
    }

    const cla = apdu[0]
    const ins = apdu[1]
    const p1 = apdu[2]
    const p2 = apdu[3]

    switch (ins) {
      case 0xa4: {
        return { data: [0x00, 0x01, 0x02, 0x03], sw1: 0x90, sw2: 0x00 }
      }

      case 0x60: {
        const sector = p2
        const keyType = p1 === 0x00 ? 'A' as const : 'B' as const
        const keyData = apdu.slice(5, 11)
        const result = this.authModule.authenticate(sector, keyType, keyData)
        if (result.success) {
          return { data: [], sw1: 0x90, sw2: 0x00 }
        }
        return { data: [], sw1: 0x00, sw2: 0x05 }
      }

      case 0xb0: {
        const blockNumber = p2
        const blockData = this.card.readBlock(blockNumber)
        if (blockData === null) {
          return { data: [], sw1: 0x63, sw2: 0x01 }
        }
        return { data: blockData, sw1: 0x90, sw2: 0x00 }
      }

      case 0xd6: {
        const blockNumber = p2
        const dataLength = apdu[4]
        const writeData = apdu.slice(5, 5 + dataLength)
        const result = this.card.writeBlock(blockNumber, writeData)
        if (result.success) {
          return { data: [], sw1: 0x90, sw2: 0x00 }
        }
        return { data: [], sw1: 0x63, sw2: 0x02 }
      }

      default:
        return { data: [], sw1: 0x6d, sw2: 0x00 }
    }
  }

  getAllSectors(): InternalSectorData[] {
    return this.card.getAllSectors()
  }
}
