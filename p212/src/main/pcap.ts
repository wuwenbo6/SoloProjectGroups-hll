import { CapturedFrame } from './monitor';

const PCAP_MAGIC = 0xA1B2C3D4;
const PCAP_VERSION_MAJOR = 2;
const PCAP_VERSION_MINOR = 4;

const DLT_USER0 = 147;

const MSTAP_PSEUDO_HEADER_SIZE = 4;

export function buildPcapHeader(): Buffer {
  const buf = Buffer.alloc(24);
  buf.writeUInt32LE(PCAP_MAGIC, 0);
  buf.writeUInt16LE(PCAP_VERSION_MAJOR, 4);
  buf.writeUInt16LE(PCAP_VERSION_MINOR, 6);
  buf.writeInt32LE(0, 8);
  buf.writeUInt32LE(0, 12);
  buf.writeUInt32LE(65535, 16);
  buf.writeUInt32LE(DLT_USER0, 20);
  return buf;
}

export function buildPcapPacket(frame: CapturedFrame): Buffer {
  const tsSec = Math.floor(frame.timestamp / 1000);
  const tsUsec = (frame.timestamp % 1000) * 1000;

  const rawBytes = hexToBytes(frame.rawHex);
  const pseudoHeader = Buffer.alloc(MSTAP_PSEUDO_HEADER_SIZE);
  pseudoHeader.writeUInt8(frame.frameType, 0);
  pseudoHeader.writeUInt8(frame.destinationAddress, 1);
  pseudoHeader.writeUInt8(frame.sourceAddress, 2);
  pseudoHeader.writeUInt8(0, 3);

  const packetData = Buffer.concat([pseudoHeader, Buffer.from(rawBytes)]);
  const inclLen = packetData.length;
  const origLen = packetData.length;

  const recordHeader = Buffer.alloc(16);
  recordHeader.writeUInt32LE(tsSec, 0);
  recordHeader.writeUInt32LE(tsUsec, 4);
  recordHeader.writeUInt32LE(inclLen, 8);
  recordHeader.writeUInt32LE(origLen, 12);

  return Buffer.concat([recordHeader, packetData]);
}

export function exportPcap(frames: CapturedFrame[]): Buffer {
  const parts: Buffer[] = [buildPcapHeader()];

  for (const frame of frames) {
    parts.push(buildPcapPacket(frame));
  }

  return Buffer.concat(parts);
}

function hexToBytes(hex: string): number[] {
  const bytes: number[] = [];
  const parts = hex.trim().split(/\s+/);
  for (const part of parts) {
    const val = parseInt(part, 16);
    if (!isNaN(val)) {
      bytes.push(val);
    }
  }
  return bytes;
}
