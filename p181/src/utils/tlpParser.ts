import { TLP, TLPHeader, ParseResult, TLP_TYPES, COMPLETION_STATUS, ECRCInfo } from '@/types/tlp';
import { hasECRC, verifyECRC, getTLPProtectedLength, calculateECRC, recalculateECRC } from './crc32c';

function readUint32LE(data: Uint8Array, offset: number): number {
  return (
    data[offset] |
    (data[offset + 1] << 8) |
    (data[offset + 2] << 16) |
    (data[offset + 3] << 24)
  ) >>> 0;
}

function readUint16LE(data: Uint8Array, offset: number): number {
  return (data[offset] | (data[offset + 1] << 8)) >>> 0;
}

function parseTLPHeader(data: Uint8Array): TLPHeader | null {
  if (data.length < 16) {
    return null;
  }

  const dw0 = readUint32LE(data, 0);
  const dw1 = readUint32LE(data, 4);
  const dw2 = readUint32LE(data, 8);
  const dw3 = readUint32LE(data, 12);

  const format = (dw0 >> 29) & 0x7;
  const typeCode = (dw0 >> 24) & 0x1f;
  const type = TLP_TYPES[typeCode] || `Unknown (0x${typeCode.toString(16).padStart(2, '0')})`;
  const length = dw0 & 0x3ff;

  const trafficClass = (dw0 >> 20) & 0x7;
  const attr = ((dw0 >> 18) & 0x3) | ((dw0 >> 13) & 0x4);
  const th = ((dw0 >> 16) & 0x1) === 1;
  const td = ((dw0 >> 15) & 0x1) === 1;
  const ep = ((dw0 >> 14) & 0x1) === 1;
  const at = (dw0 >> 10) & 0x3;

  const header: TLPHeader = {
    type,
    typeCode,
    format,
    length,
    trafficClass,
    attr,
    th,
    td,
    ep,
    at,
  };

  if (typeCode === 0x00 || typeCode === 0x01 || typeCode === 0x02) {
    const requesterId = dw1 & 0xffff;
    const tag = (dw1 >> 16) & 0xff;
    const lastDWBE = (dw1 >> 24) & 0xf;
    const firstDWBE = (dw1 >> 28) & 0xf;

    let address: number;
    if (format === 0x2 || format === 0x6) {
      address = ((dw2 & 0xfffffff0) | (dw3 << 32)) >>> 0;
    } else {
      address = dw2 & 0xfffffff0;
    }

    header.requesterId = requesterId;
    header.tag = tag;
    header.lastDWBE = lastDWBE;
    header.firstDWBE = firstDWBE;
    header.address = address;
  } else if (typeCode === 0x10 || typeCode === 0x11 || typeCode === 0x12 || typeCode === 0x13) {
    const completerId = dw1 & 0xffff;
    const statusCode = (dw1 >> 16) & 0x7;
    const status = COMPLETION_STATUS[statusCode] || `Unknown (0x${statusCode.toString(16)})`;
    const bcm = ((dw1 >> 19) & 0x1) === 1;
    const byteCount = dw1 >> 20;

    const requesterId = dw2 & 0xffff;
    const tag = (dw2 >> 16) & 0xff;
    const lowerAddress = dw2 >> 24;

    header.completerId = completerId;
    header.statusCode = statusCode;
    header.status = status;
    header.byteCount = byteCount;
    header.requesterId = requesterId;
    header.tag = tag;
    header.lowerAddress = lowerAddress;
  } else if (typeCode === 0x04 || typeCode === 0x05) {
    const requesterId = dw1 & 0xffff;
    const tag = (dw1 >> 16) & 0xff;
    const lastDWBE = (dw1 >> 24) & 0xf;
    const firstDWBE = (dw1 >> 28) & 0xf;
    const address = dw2 & 0xfffffffc;

    header.requesterId = requesterId;
    header.tag = tag;
    header.lastDWBE = lastDWBE;
    header.firstDWBE = firstDWBE;
    header.address = address;
  } else if (typeCode === 0x06 || typeCode === 0x07 || typeCode === 0x0a || typeCode === 0x0b) {
    const requesterId = dw1 & 0xffff;
    const tag = (dw1 >> 16) & 0xff;
    const lastDWBE = (dw1 >> 24) & 0xf;
    const firstDWBE = (dw1 >> 28) & 0xf;
    const deviceNumber = (dw2 >> 19) & 0x1f;
    const functionNumber = (dw2 >> 16) & 0x7;
    const registerNumber = (dw2 >> 8) & 0xff;
    const extendedRegisterNumber = dw2 & 0xff;
    const address = (dw2 & 0xffc) | (extendedRegisterNumber << 16);

    header.requesterId = requesterId;
    header.tag = tag;
    header.lastDWBE = lastDWBE;
    header.firstDWBE = firstDWBE;
    header.address = address;
  }

  return header;
}

function parsePCIeSnoopFormat(content: string): Uint8Array {
  const bytes: number[] = [];
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('@')) {
      continue;
    }

    const hexPattern = /^[0-9a-fA-F]{8}:/;
    if (!hexPattern.test(trimmed)) {
      continue;
    }

    const parts = trimmed.split(/\s+/);
    for (let i = 1; i < parts.length && i <= 4; i++) {
      const hexStr = parts[i];
      if (/^[0-9a-fA-F]{8}$/.test(hexStr)) {
        for (let j = 6; j >= 0; j -= 2) {
          const byte = parseInt(hexStr.substr(j, 2), 16);
          bytes.push(byte);
        }
      } else if (/^[0-9a-fA-F]{2}$/.test(hexStr)) {
        bytes.push(parseInt(hexStr, 16));
      }
    }
  }

  return new Uint8Array(bytes);
}

function parseRawHex(content: string): Uint8Array {
  const cleaned = content.replace(/[^0-9a-fA-F]/g, '');
  const bytes: number[] = [];

  for (let i = 0; i < cleaned.length; i += 2) {
    if (i + 1 < cleaned.length) {
      bytes.push(parseInt(cleaned.substr(i, 2), 16));
    }
  }

  return new Uint8Array(bytes);
}

export function parseTLPData(data: Uint8Array): TLP[] {
  const tlps: TLP[] = [];
  let offset = 0;
  let index = 0;

  while (offset < data.length - 4) {
    const dw0 = readUint32LE(data, offset);
    const length = dw0 & 0x3ff;
    const format = (dw0 >> 29) & 0x7;
    const td = ((dw0 >> 15) & 0x1) === 1;

    let headerLength = 16;
    if (format === 0x2 || format === 0x6) {
      headerLength = 20;
    }

    let totalLength = headerLength + length * 4;
    if (td) {
      totalLength += 4;
    }

    if (offset + totalLength > data.length) {
      break;
    }

    const tlpData = data.slice(offset, offset + totalLength);
    const header = parseTLPHeader(tlpData);

    if (!header) {
      offset += 4;
      continue;
    }

    const payload = totalLength > headerLength + (td ? 4 : 0)
      ? tlpData.slice(headerLength, totalLength - (td ? 4 : 0))
      : undefined;

    let ecrc: ECRCInfo | undefined;
    if (td) {
      const protectedLen = headerLength + length * 4;
      const ecrcResult = verifyECRC(tlpData);
      ecrc = {
        hasECRC: true,
        expected: ecrcResult.expected,
        actual: ecrcResult.actual,
        valid: ecrcResult.valid,
        position: protectedLen,
      };
    } else {
      ecrc = {
        hasECRC: false,
      };
    }

    tlps.push({
      index: index++,
      rawData: tlpData,
      header,
      payload,
      ecrc,
    });

    offset += totalLength;
  }

  return tlps;
}

export async function parseFileInChunks(
  file: File,
  onProgress?: (percent: number, tlpsParsed: number) => void,
  chunkSize: number = 1024 * 1024
): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const fileSize = file.size;
    let offset = 0;
    let allData: Uint8Array | null = null;
    let leftover: Uint8Array | null = null;
    let allTlps: TLP[] = [];
    let accumulatedData: Uint8Array = new Uint8Array(0);

    const processChunk = async () => {
      if (offset >= fileSize) {
        if (leftover && leftover.length > 0) {
          const tlps = parseTLPData(leftover);
          allTlps = [...allTlps, ...tlps.map(tlp => ({ ...tlp, index: tlp.index + allTlps.length }))];
        }

        resolve({
          tlps: allTlps,
          totalLength: fileSize,
          parseErrors: allTlps.length === 0 ? ['未能解析出任何有效的TLP数据包，请检查文件格式'] : [],
          fileName: file.name,
        });
        return;
      }

      const chunkEnd = Math.min(offset + chunkSize, fileSize);
      const blob = file.slice(offset, chunkEnd);
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          let chunkData: Uint8Array;

          if (file.name.endsWith('.hex') || file.name.endsWith('.txt')) {
            const content = e.target?.result as string;
            if (offset === 0) {
              const firstLines = content.substring(0, 500);
              if (firstLines.includes(':') && /[0-9a-fA-F]{8}:/.test(firstLines)) {
                chunkData = parsePCIeSnoopFormat(content);
              } else {
                chunkData = parseRawHex(content);
              }
            } else {
              chunkData = parsePCIeSnoopFormat(content);
            }
          } else {
            chunkData = new Uint8Array(e.target?.result as ArrayBuffer);
          }

          let dataToProcess: Uint8Array;
          if (leftover && leftover.length > 0) {
            dataToProcess = new Uint8Array(leftover.length + chunkData.length);
            dataToProcess.set(leftover, 0);
            dataToProcess.set(chunkData, leftover.length);
          } else {
            dataToProcess = chunkData;
          }

          const tlps = parseTLPData(dataToProcess);

          if (tlps.length > 0) {
            const lastTlp = tlps[tlps.length - 1];
            const lastTlpEnd = lastTlp.rawData.length +
              tlps.slice(0, -1).reduce((sum, t) => sum + t.rawData.length, 0);

            leftover = dataToProcess.slice(lastTlpEnd);

            const indexedTlps = tlps.map(tlp => ({
              ...tlp,
              index: tlp.index + allTlps.length,
            }));
            allTlps = [...allTlps, ...indexedTlps];
          } else {
            leftover = dataToProcess;
          }

          if (!allData) {
            allData = chunkData;
          }

          offset = chunkEnd;

          if (onProgress) {
            const percent = Math.round((offset / fileSize) * 100);
            onProgress(percent, allTlps.length);
          }

          setTimeout(processChunk, 0);
        } catch (error) {
          reject(new Error(`文件解析失败: ${error instanceof Error ? error.message : '未知错误'}`));
        }
      };

      reader.onerror = () => {
        reject(new Error('文件读取失败'));
      };

      if (file.name.endsWith('.hex') || file.name.endsWith('.txt')) {
        reader.readAsText(blob);
      } else {
        reader.readAsArrayBuffer(blob);
      }
    };

    processChunk();
  });
}

export { calculateECRC, recalculateECRC, hasECRC };

export function parseFile(file: File): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        let data: Uint8Array;

        if (file.name.endsWith('.hex') || file.name.endsWith('.txt')) {
          const firstLines = content.substring(0, 500);
          if (firstLines.includes(':') && /[0-9a-fA-F]{8}:/.test(firstLines)) {
            data = parsePCIeSnoopFormat(content);
          } else {
            data = parseRawHex(content);
          }
        } else {
          const bytes = new Uint8Array(e.target?.result as ArrayBuffer);
          data = bytes;
        }

        const tlps = parseTLPData(data);
        const parseErrors: string[] = [];

        if (tlps.length === 0) {
          parseErrors.push('未能解析出任何有效的TLP数据包，请检查文件格式');
        }

        resolve({
          tlps,
          totalLength: data.length,
          parseErrors,
          fileName: file.name,
        });
      } catch (error) {
        reject(new Error(`文件解析失败: ${error instanceof Error ? error.message : '未知错误'}`));
      }
    };

    reader.onerror = () => {
      reject(new Error('文件读取失败'));
    };

    if (file.name.endsWith('.hex') || file.name.endsWith('.txt')) {
      reader.readAsText(file);
    } else {
      reader.readAsArrayBuffer(file);
    }
  });
}

export function flipBit(data: Uint8Array, byteOffset: number, bitPosition: number): Uint8Array {
  if (byteOffset < 0 || byteOffset >= data.length) {
    throw new Error('字节偏移超出范围');
  }
  if (bitPosition < 0 || bitPosition > 7) {
    throw new Error('bit位置必须在0-7之间');
  }

  const newData = new Uint8Array(data);
  newData[byteOffset] ^= (1 << bitPosition);
  return newData;
}

export function toHexString(data: Uint8Array, separator: string = ' '): string {
  return Array.from(data)
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join(separator);
}

export function toHexDump(data: Uint8Array, bytesPerLine: number = 16): string {
  const lines: string[] = [];

  for (let i = 0; i < data.length; i += bytesPerLine) {
    const slice = data.slice(i, i + bytesPerLine);
    const hex = toHexString(slice, ' ');
    const ascii = Array.from(slice)
      .map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.'))
      .join('');
    lines.push(`${i.toString(16).padStart(8, '0')}:  ${hex.padEnd(bytesPerLine * 3 - 1, ' ')}  ${ascii}`);
  }

  return lines.join('\n');
}
