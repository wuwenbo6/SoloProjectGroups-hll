import { PacketType } from '../../../shared/types';
import type { PacketHeader } from '../../../shared/types';

export const PACKET_HEADER_SIZE = 16;
export const PACKET_SYNC = 0xeb90;

export function parsePacketHeader(buffer: Buffer, offset: number): PacketHeader {
  if (buffer.length - offset < PACKET_HEADER_SIZE) {
    throw new Error('Buffer too small for packet header');
  }

  const sync = buffer.readUInt16LE(offset);
  
  if (sync !== PACKET_SYNC) {
    throw new Error(`Invalid packet sync: expected 0x${PACKET_SYNC.toString(16)}, got 0x${sync.toString(16)} at offset ${offset}`);
  }

  const chunkInfo = buffer.readUInt16LE(offset + 2);
  const packetType = chunkInfo & 0x07ff;
  const secondaryHeaderPresent = ((chunkInfo >> 11) & 0x01) === 1;
  const hasChecksum = ((chunkInfo >> 12) & 0x01) === 1;
  
  const packetLength = buffer.readUInt32LE(offset + 4);
  const timestamp = buffer.readBigUInt64LE(offset + 8);
  
  const headerSize = PACKET_HEADER_SIZE + (secondaryHeaderPresent ? 12 : 0) + (hasChecksum ? 2 : 0);
  const dataLength = packetLength - headerSize;

  return {
    sync,
    packetType: packetType in PacketType ? packetType : PacketType.UNKNOWN,
    packetLength,
    dataLength: Math.max(0, dataLength),
    timestamp,
    sequenceNumber: 0,
    checksumPresent: hasChecksum,
    secondaryHeaderPresent,
    hasChecksum
  };
}

export function isValidPacketSync(buffer: Buffer, offset: number): boolean {
  if (buffer.length - offset < 2) return false;
  return buffer.readUInt16LE(offset) === PACKET_SYNC;
}

export function formatTimestamp(timestampNs: bigint): string {
  const ns = Number(timestampNs % 1000000000n);
  const sec = Number(timestampNs / 1000000000n);
  return `${sec}.${ns.toString().padStart(9, '0')}`;
}

export function getPacketDataOffset(header: PacketHeader): number {
  let offset = PACKET_HEADER_SIZE;
  if (header.secondaryHeaderPresent) offset += 12;
  return offset;
}
