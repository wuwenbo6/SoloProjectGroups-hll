import { GSM_7BIT_BASIC, GSM_7BIT_EXTENDED } from './encoding7bit';
import { EncodeResult } from '../types/pdu';

export interface AtCommand {
  command: string;
  description: string;
  expectedResponse?: string;
  delay?: number;
}

export const byteToHex = (byte: number): string => {
  return byte.toString(16).padStart(2, '0').toUpperCase();
};

export const hexToByte = (hex: string): number => {
  return parseInt(hex, 16);
};

export const bytesToHex = (bytes: number[]): string => {
  return bytes.map(byteToHex).join('');
};

export const hexToBytes = (hex: string): number[] => {
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(hexToByte(hex.substr(i, 2)));
  }
  return bytes;
};

export const swapNibbles = (hex: string): string => {
  let result = '';
  for (let i = 0; i < hex.length; i += 2) {
    if (i + 1 < hex.length) {
      result += hex[i + 1] + hex[i];
    } else {
      result += 'F' + hex[i];
    }
  }
  return result;
};

export const encodeNumber = (number: string): { hex: string; type: number } => {
  let cleanNumber = number.replace(/\s/g, '');
  let type = 0x81;

  if (cleanNumber.startsWith('+')) {
    cleanNumber = cleanNumber.substring(1);
    type = 0x91;
  }

  const length = cleanNumber.length;
  const swapped = swapNibbles(cleanNumber);

  return {
    hex: swapped,
    type
  };
};

export const decodeNumber = (hex: string, type: number): string => {
  let result = '';
  const swapped = swapNibbles(hex);
  if (swapped.endsWith('F')) {
    result = swapped.slice(0, -1);
  } else {
    result = swapped;
  }

  if (type === 0x91) {
    result = '+' + result;
  }

  return result;
};

export const detectTonNpi = (number: string): number => {
  if (number.startsWith('+')) {
    return 0x91;
  }
  if (/^[0-9]+$/.test(number)) {
    return 0x81;
  }
  return 0xD0;
};

export const encodeScts = (date: Date): string => {
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');

  const timezone = Math.abs(date.getTimezoneOffset() / -15);
  const tzHex = timezone.toString(16).padStart(2, '0').toUpperCase();

  return (
    swapNibbles(year) +
    swapNibbles(month) +
    swapNibbles(day) +
    swapNibbles(hours) +
    swapNibbles(minutes) +
    swapNibbles(seconds) +
    swapNibbles(tzHex)
  );
};

export const decodeScts = (hex: string): string => {
  const year = swapNibbles(hex.substring(0, 2));
  const month = swapNibbles(hex.substring(2, 4));
  const day = swapNibbles(hex.substring(4, 6));
  const hours = swapNibbles(hex.substring(6, 8));
  const minutes = swapNibbles(hex.substring(8, 10));
  const seconds = swapNibbles(hex.substring(10, 12));

  return `20${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

export const isValidHex = (str: string): boolean => {
  return /^[0-9A-Fa-f]+$/.test(str) && str.length % 2 === 0;
};

export const buildConcatUdh = (reference: number, total: number, sequence: number): string => {
  const udhl = 0x05;
  const iei = 0x00;
  const ieLength = 0x03;
  return (
    byteToHex(udhl) +
    byteToHex(iei) +
    byteToHex(ieLength) +
    byteToHex(reference & 0xFF) +
    byteToHex(total & 0xFF) +
    byteToHex(sequence & 0xFF)
  );
};

export const parseUdh = (hex: string): { udhInfo: import('../types/pdu').UdhInfo; udHex: string } => {
  if (hex.length < 2) {
    return { udhInfo: { hasUdh: false, udhLength: 0 }, udHex: hex };
  }

  const udhLength = hexToByte(hex.substring(0, 2));

  if (udhLength === 0 || hex.length < (udhLength + 1) * 2) {
    return { udhInfo: { hasUdh: false, udhLength: 0 }, udHex: hex };
  }

  const udhHex = hex.substring(0, (udhLength + 1) * 2);
  const udHex = hex.substring((udhLength + 1) * 2);

  let concatRef: number | undefined;
  let concatTotal: number | undefined;
  let concatSeq: number | undefined;

  let offset = 2;
  while (offset < udhHex.length) {
    const iei = hexToByte(udhHex.substring(offset, offset + 2));
    offset += 2;
    const ieLength = hexToByte(udhHex.substring(offset, offset + 2));
    offset += 2;

    if (iei === 0x00 && ieLength === 0x03) {
      concatRef = hexToByte(udhHex.substring(offset, offset + 2));
      concatTotal = hexToByte(udhHex.substring(offset + 2, offset + 4));
      concatSeq = hexToByte(udhHex.substring(offset + 4, offset + 6));
    }
    offset += ieLength * 2;
  }

  return {
    udhInfo: {
      hasUdh: true,
      udhLength,
      concatRef,
      concatTotal,
      concatSeq,
      udhHex
    },
    udHex
  };
};

export const getMaxMessageLength = (encoding: '7bit' | 'ucs2', hasUdh: boolean): number => {
  if (encoding === '7bit') {
    return hasUdh ? 153 : 160;
  } else {
    return hasUdh ? 67 : 70;
  }
};

export const splitMessage = (text: string, encoding: '7bit' | 'ucs2'): string[] => {
  const maxLenSingle = getMaxMessageLength(encoding, false);
  const maxLenMulti = getMaxMessageLength(encoding, true);

  if (encoding === '7bit') {
    let septetCount = 0;
    for (const char of text) {
      if (char in GSM_7BIT_BASIC) {
        septetCount++;
      } else if (char in GSM_7BIT_EXTENDED) {
        septetCount += 2;
      } else {
        septetCount++;
      }
    }

    if (septetCount <= maxLenSingle) {
      return [text];
    }

    const parts: string[] = [];
    let currentPart = '';
    let currentSeptets = 0;

    for (const char of text) {
      let charSeptets = 1;
      if (char in GSM_7BIT_EXTENDED) {
        charSeptets = 2;
      }

      if (currentSeptets + charSeptets > maxLenMulti) {
        parts.push(currentPart);
        currentPart = char;
        currentSeptets = charSeptets;
      } else {
        currentPart += char;
        currentSeptets += charSeptets;
      }
    }

    if (currentPart.length > 0) {
      parts.push(currentPart);
    }

    return parts;
  } else {
    if (text.length <= maxLenSingle) {
      return [text];
    }

    const parts: string[] = [];
    for (let i = 0; i < text.length; i += maxLenMulti) {
      parts.push(text.substring(i, i + maxLenMulti));
    }
    return parts;
  }
};

export const generateAtCommands = (pdus: EncodeResult[]): AtCommand[] => {
  const commands: AtCommand[] = [];

  commands.push({
    command: 'AT',
    description: '测试模块连接',
    expectedResponse: 'OK',
    delay: 100
  });

  commands.push({
    command: 'AT+CMGF=0',
    description: '设置为PDU模式',
    expectedResponse: 'OK',
    delay: 100
  });

  commands.push({
    command: 'AT+CSCS="UCS2"',
    description: '设置字符编码为UCS2',
    expectedResponse: 'OK',
    delay: 100
  });

  pdus.forEach((pduResult, index) => {
    const pdu = pduResult.pdu;
    const smscLengthHex = pdu.substring(0, 2);
    const smscLength = parseInt(smscLengthHex, 16);
    const tpduStart = (smscLength + 1) * 2;
    const tpduHex = pdu.substring(tpduStart);
    const tpduLength = tpduHex.length / 2;

    commands.push({
      command: `AT+CMGS=${tpduLength}`,
      description: `发送第 ${index + 1}/${pdus.length} 条短信`,
      expectedResponse: '>',
      delay: 200
    });

    commands.push({
      command: `${tpduHex}\x1A`,
      description: `第 ${index + 1} 条PDU数据 (Ctrl+Z结束)`,
      expectedResponse: '+CMGS: ...\\r\\nOK',
      delay: 1000
    });
  });

  return commands;
};

export const hexToBinary = (hex: string): Uint8Array => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
};

export const downloadBinaryFile = (hex: string, filename: string): void => {
  const bytes = hexToBinary(hex);
  const blob = new Blob([bytes], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const downloadTextFile = (content: string, filename: string, mimeType: string = 'text/plain'): void => {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
