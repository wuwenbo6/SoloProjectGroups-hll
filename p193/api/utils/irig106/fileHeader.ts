import type { FileHeader } from '../../../shared/types';

export const FILE_HEADER_SIZE = 24;
export const SYNC_PATTERN = Buffer.from([0x49, 0x52, 0x49, 0x47, 0x31, 0x30, 0x36, 0x00]);

export function parseFileHeader(buffer: Buffer): FileHeader {
  if (buffer.length < FILE_HEADER_SIZE) {
    throw new Error('Buffer too small for file header');
  }

  const syncPattern = buffer.toString('ascii', 0, 8);
  const expectedSync = 'IRIG106\x00';
  
  if (!buffer.slice(0, 8).equals(SYNC_PATTERN)) {
    throw new Error(`Invalid sync pattern: expected "${expectedSync}", got "${syncPattern}"`);
  }

  const version = buffer.readUInt16LE(8);
  const versionMajor = (version & 0xff00) >> 8;
  const versionMinor = version & 0x00ff;
  
  const fileSize = buffer.readBigUInt64LE(10);
  const creationTimeSec = buffer.readUInt32LE(18);
  const creationTime = new Date(creationTimeSec * 1000);
  const packetCount = 0;

  return {
    syncPattern: syncPattern.replace(/\x00/g, ''),
    versionMajor,
    versionMinor,
    fileSize,
    creationTime,
    packetCount
  };
}

export function isValidSyncPattern(buffer: Buffer, offset: number = 0): boolean {
  if (buffer.length - offset < 8) return false;
  return buffer.slice(offset, offset + 8).equals(SYNC_PATTERN);
}
