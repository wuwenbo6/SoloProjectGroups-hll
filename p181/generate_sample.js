import fs from 'fs';

const CRC32C_POLY = 0x1EDC6F41;
let crc32cTable = null;

function generateCRCTable() {
  if (crc32cTable) return;
  crc32cTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 1) ? (crc >>> 1) ^ CRC32C_POLY : (crc >>> 1);
    }
    crc32cTable[i] = crc >>> 0;
  }
}

function crc32c(data, initial = 0xFFFFFFFF) {
  if (!crc32cTable) generateCRCTable();
  let crc = initial >>> 0;
  for (let i = 0; i < data.length; i++) {
    const byte = data[i] & 0xff;
    const index = (crc ^ byte) & 0xff;
    crc = ((crc >>> 8) ^ crc32cTable[index]) >>> 0;
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function writeUint32LE(buffer, offset, value) {
  value = value >>> 0;
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >> 8) & 0xff;
  buffer[offset + 2] = (value >> 16) & 0xff;
  buffer[offset + 3] = (value >> 24) & 0xff;
}

function readUint32LE(buffer, offset) {
  return (buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16) | (buffer[offset + 3] << 24)) >>> 0;
}

function calculateECRC(buffer) {
  const dw0 = readUint32LE(buffer, 0);
  const dw0Modified = dw0 & ~(0x1 << 15);
  const modified = new Uint8Array(buffer.length);
  modified.set(buffer, 0);
  writeUint32LE(modified, 0, dw0Modified);

  const format = (dw0 >> 29) & 0x7;
  const length = dw0 & 0x3ff;
  const headerLen = (format === 0x2 || format === 0x6) ? 20 : 16;
  const protectedLen = headerLen + length * 4;

  const protectedData = modified.slice(0, protectedLen);
  return crc32c(protectedData);
}

function createTLPWithECRC(dw0, dw1, dw2, dw3, payload) {
  const format = (dw0 >> 29) & 0x7;
  const length = dw0 & 0x3ff;
  const headerLen = (format === 0x2 || format === 0x6) ? 20 : 16;
  const protectedLen = headerLen + length * 4;
  const totalLen = protectedLen + 4;

  const buffer = new Uint8Array(totalLen);
  writeUint32LE(buffer, 0, dw0 | (0x1 << 15));
  writeUint32LE(buffer, 4, dw1);
  writeUint32LE(buffer, 8, dw2);
  if (headerLen > 16) {
    writeUint32LE(buffer, 12, dw3);
  }

  if (payload && payload.length > 0) {
    for (let i = 0; i < payload.length; i++) {
      writeUint32LE(buffer, headerLen + i * 4, payload[i]);
    }
  }

  const ecrc = calculateECRC(buffer);
  writeUint32LE(buffer, protectedLen, ecrc);

  const dws = [];
  for (let i = 0; i < totalLen; i += 4) {
    dws.push(readUint32LE(buffer, i));
  }

  return dws;
}

function createTLPs() {
  const tlps = [];
  const allDWs = [];

  // TLP 0: Memory Write (3DW header, 4 DW data) - WITH ECRC
  // Format=0x1 (3DW), Type=0x02 (MWr), Length=4
  const tlp0 = createTLPWithECRC(
    0x42000004,
    0x00FF0001,
    0x10000000,
    0,
    [0xDEADBEEF, 0xCAFEBABE, 0x00112233, 0x44556677]
  );
  tlps.push(...tlp0);
  allDWs.push(...tlp0);

  // TLP 1: Memory Read (3DW header, no data) - WITHOUT ECRC
  // Format=0x0 (3DW), Type=0x00 (MRd), Length=2
  const dw0_1 = 0x00000002;
  const dw1_1 = 0x00FF0002;
  const dw2_1 = 0x20000000;
  tlps.push(dw0_1, dw1_1, dw2_1);
  allDWs.push(dw0_1, dw1_1, dw2_1);

  // TLP 2: Completion with Data (3DW header, 2 DW data) - WITH ECRC
  // Format=0x1 (3DW), Type=0x11 (CplD), Length=2
  const tlp2 = createTLPWithECRC(
    0x4A000002,
    0x00080000,
    0x00000001,
    0,
    [0xDEADBEEF, 0xCAFEBABE]
  );
  tlps.push(...tlp2);
  allDWs.push(...tlp2);

  // TLP 3: Completion (3DW header, no data, status UR) - WITHOUT ECRC
  // Format=0x0 (3DW), Type=0x10 (Cpl), Length=0
  const dw0_3 = 0x0A000000;
  const dw1_3 = 0x00010000;
  const dw2_3 = 0x00010002;
  tlps.push(dw0_3, dw1_3, dw2_3);
  allDWs.push(dw0_3, dw1_3, dw2_3);

  // TLP 4: Memory Write with 1 DW data - WITH ECRC (invalid CRC for testing)
  // Format=0x1 (3DW), Type=0x02 (MWr), Length=1
  const tlp4 = createTLPWithECRC(
    0x42000001,
    0x00FF0003,
    0x30000000,
    0,
    [0x12345678]
  );
  const tlp4Corrupted = [...tlp4];
  tlp4Corrupted[tlp4Corrupted.length - 1] ^= 0xFFFFFFFF;
  tlps.push(...tlp4Corrupted);
  allDWs.push(...tlp4Corrupted);

  // TLP 5: Memory Write (4DW header, 2 DW data) - WITH ECRC
  // Format=0x2 (4DW), Type=0x02 (MWr), Length=2
  const tlp5 = createTLPWithECRC(
    0x82000002,
    0x00FF0004,
    0x76543210,
    0xFEDCBA98,
    [0x11223344, 0x55667788]
  );
  tlps.push(...tlp5);
  allDWs.push(...tlp5);

  return allDWs;
}

const tlps = createTLPs();
const buffer = Buffer.alloc(tlps.length * 4);

for (let i = 0; i < tlps.length; i++) {
  buffer.writeUInt32LE(tlps[i], i * 4);
}

fs.writeFileSync('sample-tlp.bin', buffer);
console.log('Generated sample-tlp.bin with', tlps.length * 4, 'bytes');
console.log('Contains 6 TLPs: 4 with ECRC (1 invalid), 2 without ECRC');

let hexContent = '# PCIe TLP Sample Capture with ECRC\n';
hexContent += '# Format: offset: DW0 DW1 DW2 DW3 (little-endian)\n';
hexContent += '# Contains 6 TLPs: 4 with ECRC (TLP0, TLP2, TLP4=invalid, TLP5), 2 without ECRC\n\n';

for (let i = 0; i < tlps.length; i += 4) {
  const offset = (i * 4).toString(16).padStart(8, '0');
  const dws = [];
  for (let j = 0; j < 4 && i + j < tlps.length; j++) {
    dws.push(tlps[i + j].toString(16).padStart(8, '0').toUpperCase());
  }
  hexContent += `${offset}: ${dws.join(' ')}\n`;
}

fs.writeFileSync('sample-tlp.hex', hexContent);
console.log('Generated sample-tlp.hex');
