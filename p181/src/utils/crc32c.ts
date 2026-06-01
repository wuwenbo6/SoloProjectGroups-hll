const CRC32C_POLY = 0x1EDC6F41;

let crc32cTable: Uint32Array | null = null;

function generateCRCTable(): void {
  if (crc32cTable) return;

  crc32cTable = new Uint32Array(256);

  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ CRC32C_POLY;
      } else {
        crc = crc >>> 1;
      }
    }
    crc32cTable[i] = crc >>> 0;
  }
}

export function crc32c(data: Uint8Array, initial: number = 0xFFFFFFFF): number {
  if (!crc32cTable) {
    generateCRCTable();
  }

  let crc = initial >>> 0;
  const table = crc32cTable!;

  for (let i = 0; i < data.length; i++) {
    const byte = data[i] & 0xff;
    const index = (crc ^ byte) & 0xff;
    crc = ((crc >>> 8) ^ table[index]) >>> 0;
  }

  return (crc ^ 0xFFFFFFFF) >>> 0;
}

export function crc32cWithSeed(data: Uint8Array, seed: number = 0): number {
  return crc32c(data, seed ^ 0xFFFFFFFF);
}

export function writeUint32LE(buffer: Uint8Array, offset: number, value: number): void {
  value = value >>> 0;
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >> 8) & 0xff;
  buffer[offset + 2] = (value >> 16) & 0xff;
  buffer[offset + 3] = (value >> 24) & 0xff;
}

export function hasECRC(data: Uint8Array): boolean {
  if (data.length < 4) return false;
  const dw0 = readUint32LE(data, 0);
  const td = ((dw0 >> 15) & 0x1) === 1;
  return td;
}

export function getTLPHeaderLength(data: Uint8Array): number {
  if (data.length < 4) return 16;
  const dw0 = readUint32LE(data, 0);
  const format = (dw0 >> 29) & 0x7;
  return (format === 0x2 || format === 0x6) ? 20 : 16;
}

export function getTLPPayloadLength(data: Uint8Array): number {
  if (data.length < 4) return 0;
  const dw0 = readUint32LE(data, 0);
  const length = dw0 & 0x3ff;
  return length * 4;
}

export function getTLPProtectedLength(data: Uint8Array): number {
  const headerLen = getTLPHeaderLength(data);
  const payloadLen = getTLPPayloadLength(data);
  return headerLen + payloadLen;
}

export function getProtectedData(data: Uint8Array): Uint8Array | null {
  if (data.length < 4) return null;

  const dw0 = readUint32LE(data, 0);
  const dw0Modified = dw0 & ~(0x1 << 15);
  const modified = new Uint8Array(data);
  writeUint32LE(modified, 0, dw0Modified);

  const protectedLen = getTLPProtectedLength(modified);
  if (modified.length < protectedLen) return null;

  return modified.slice(0, protectedLen);
}

export function calculateECRC(data: Uint8Array): number {
  const protectedData = getProtectedData(data);
  if (!protectedData) return 0;
  return crc32c(protectedData);
}

export function verifyECRC(data: Uint8Array): { valid: boolean; expected: number; actual: number } {
  const protectedLen = getTLPProtectedLength(data);

  if (data.length < protectedLen + 4) {
    return { valid: false, expected: 0, actual: 0 };
  }

  const expectedCRC = readUint32LE(data, protectedLen);
  const actualCRC = calculateECRC(data);

  return {
    valid: expectedCRC === actualCRC,
    expected: expectedCRC,
    actual: actualCRC,
  };
}

export function injectECRC(data: Uint8Array): Uint8Array {
  const protectedLen = getTLPProtectedLength(data);
  const newData = new Uint8Array(protectedLen + 4);
  newData.set(data.slice(0, Math.min(data.length, protectedLen)), 0);

  const dw0 = readUint32LE(newData, 0);
  const dw0WithTD = dw0 | (0x1 << 15);
  writeUint32LE(newData, 0, dw0WithTD);

  const crc = calculateECRC(newData);
  writeUint32LE(newData, protectedLen, crc);

  return newData;
}

export function recalculateECRC(data: Uint8Array): Uint8Array {
  if (!hasECRC(data)) {
    return injectECRC(data);
  }

  const protectedLen = getTLPProtectedLength(data);
  const newData = new Uint8Array(data.length);
  newData.set(data, 0);

  const crc = calculateECRC(newData);
  if (protectedLen + 4 <= newData.length) {
    writeUint32LE(newData, protectedLen, crc);
  }

  return newData;
}

function readUint32LE(data: Uint8Array, offset: number): number {
  return (
    data[offset] |
    (data[offset + 1] << 8) |
    (data[offset + 2] << 16) |
    (data[offset + 3] << 24)
  ) >>> 0;
}
