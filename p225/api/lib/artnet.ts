import { CHANNEL_COUNT } from '../../shared/types.js';

export class ArtNetPacketBuilder {
  private static readonly HEADER = [
    0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00,
  ];

  private static readonly OP_CODE_OUTPUT = 0x5000;
  private static readonly PROTOCOL_VERSION = 0x000e;

  static buildPortAddress(net: number, switch_: number, universe: number): number {
    const clampedNet = Math.max(0, Math.min(127, net));
    const clampedSwitch = Math.max(0, Math.min(15, switch_));
    const clampedUniverse = Math.max(0, Math.min(15, universe));
    return (clampedNet << 8) | (clampedSwitch << 4) | clampedUniverse;
  }

  static buildDmxPacket(
    channels: number[],
    net: number = 0,
    switch_: number = 0,
    universe: number = 0,
    sequence: number = 0
  ): Buffer {
    const dmxData = new Uint8Array(CHANNEL_COUNT);

    for (let i = 0; i < CHANNEL_COUNT; i++) {
      dmxData[i] = Math.max(0, Math.min(255, Math.floor(channels[i] || 0)));
    }

    const packet = Buffer.alloc(18 + CHANNEL_COUNT);

    for (let i = 0; i < this.HEADER.length; i++) {
      packet[i] = this.HEADER[i];
    }

    packet.writeUInt16LE(this.OP_CODE_OUTPUT, 8);
    packet.writeUInt16BE(this.PROTOCOL_VERSION, 10);
    packet[12] = sequence;
    packet[13] = 0;

    const portAddress = this.buildPortAddress(net, switch_, universe);
    packet.writeUInt16LE(portAddress, 14);

    packet.writeUInt16BE(CHANNEL_COUNT, 16);

    for (let i = 0; i < CHANNEL_COUNT; i++) {
      packet[18 + i] = dmxData[i];
    }

    return packet;
  }

  static validatePacket(buffer: Buffer): boolean {
    if (buffer.length < 18) return false;

    for (let i = 0; i < this.HEADER.length; i++) {
      if (buffer[i] !== this.HEADER[i]) return false;
    }

    const opCode = buffer.readUInt16LE(8);
    return opCode === this.OP_CODE_OUTPUT;
  }

  static parsePortAddress(portAddress: number): { net: number; switch_: number; universe: number } {
    return {
      net: (portAddress >> 8) & 0x7f,
      switch_: (portAddress >> 4) & 0x0f,
      universe: portAddress & 0x0f,
    };
  }
}
