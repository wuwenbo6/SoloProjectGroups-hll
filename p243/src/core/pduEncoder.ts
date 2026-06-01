import { EncodeParams, EncodeResult, PduPart, MultiEncodeResult } from '../types/pdu';
import { encode7Bit } from './encoding7bit';
import { encodeUcs2 } from './encodingUcs2';
import { encodeNumber, detectTonNpi, byteToHex, swapNibbles, buildConcatUdh, splitMessage, getMaxMessageLength } from './utils';

const buildSinglePdu = (
  params: EncodeParams,
  messagePart: string,
  partNumber: number,
  totalParts: number,
  concatRef: number,
  baseMr: number = 0
): EncodeResult => {
  try {
    const parts: PduPart[] = [];
    let offset = 0;
    let pdu = '';

    const isMultiPart = totalParts > 1;
    const udhLengthBytes = isMultiPart ? 6 : 0;

    let smscHex = '';
    if (params.smscNumber && params.smscNumber.length > 0) {
      const smscEncoded = encodeNumber(params.smscNumber);
      const smscLength = 1 + Math.ceil(smscEncoded.hex.length / 2);
      smscHex = byteToHex(smscLength) + byteToHex(smscEncoded.type) + smscEncoded.hex;
    } else {
      smscHex = '00';
    }
    pdu += smscHex;
    parts.push({
      name: 'SMSC 地址',
      hex: smscHex,
      description: params.smscNumber || '无 SMSC',
      offset: [offset, offset + smscHex.length]
    });
    offset += smscHex.length;

    let pduType = 0x01;
    if (params.messageType === 'submit') {
      pduType = 0x01;
      if (params.requestStatusReport) {
        pduType |= 0x20;
      }
      if (isMultiPart) {
        pduType |= 0x40;
      }
    } else {
      pduType = 0x00;
      if (isMultiPart) {
        pduType |= 0x40;
      }
    }
    const pduTypeHex = byteToHex(pduType);
    pdu += pduTypeHex;
    parts.push({
      name: 'PDU 类型 (TP-MTI)',
      hex: pduTypeHex,
      description: `0x${pduTypeHex} - ${params.messageType === 'submit' ? 'SMS-SUBMIT' : 'SMS-DELIVER'}${isMultiPart ? ' (含 UDHI)' : ''}`,
      offset: [offset, offset + 2]
    });
    offset += 2;

    if (params.messageType === 'submit') {
      const mrHex = byteToHex((baseMr + partNumber - 1) & 0xFF);
      pdu += mrHex;
      parts.push({
        name: '消息参考号 (TP-MR)',
        hex: mrHex,
        description: `0x${mrHex} (${(baseMr + partNumber - 1) & 0xFF})`,
        offset: [offset, offset + 2]
      });
      offset += 2;
    }

    const destNumber = params.destinationNumber || '';
    const cleanDest = destNumber.replace(/\s/g, '').replace(/^\+/, '');
    const destLen = cleanDest.length;
    const destTonNpi = detectTonNpi(destNumber);
    const destEncoded = swapNibbles(cleanDest);

    const destLenHex = byteToHex(destLen);
    const destTonNpiHex = byteToHex(destTonNpi);

    const destAddrHex = destLenHex + destTonNpiHex + destEncoded;
    pdu += destAddrHex;
    parts.push({
      name: params.messageType === 'submit' ? '目标地址 (TP-DA)' : '发起方地址 (TP-OA)',
      hex: destAddrHex,
      description: `号码: ${destNumber}, TON/NPI: 0x${destTonNpiHex}`,
      offset: [offset, offset + destAddrHex.length]
    });
    offset += destAddrHex.length;

    const pidHex = '00';
    pdu += pidHex;
    parts.push({
      name: '协议标识 (TP-PID)',
      hex: pidHex,
      description: '0x00 - 普通短信',
      offset: [offset, offset + 2]
    });
    offset += 2;

    let dcs = 0x00;
    if (params.encoding === 'ucs2') {
      dcs = 0x08;
    }
    const dcsHex = byteToHex(dcs);
    pdu += dcsHex;
    parts.push({
      name: '数据编码方案 (TP-DCS)',
      hex: dcsHex,
      description: `0x${dcsHex} - ${params.encoding === 'ucs2' ? 'UCS2 (16-bit)' : '7-bit 默认字母表'}`,
      offset: [offset, offset + 2]
    });
    offset += 2;

    if (params.messageType === 'submit' && params.validityPeriod) {
      const vp = Math.min(255, Math.max(0, Math.floor(params.validityPeriod / 24)));
      const vpHex = byteToHex(vp);
      pdu += vpHex;
      parts.push({
        name: '有效期 (TP-VP)',
        hex: vpHex,
        description: `${params.validityPeriod} 小时`,
        offset: [offset, offset + 2]
      });
      offset += 2;
    }

    let udHex = '';
    let udLength = 0;
    let udhHex = '';

    if (isMultiPart) {
      udhHex = buildConcatUdh(concatRef, totalParts, partNumber);
      parts.push({
        name: '用户数据头 (UDH)',
        hex: udhHex,
        description: `拼接短信: 参考号=${concatRef}, 总数=${totalParts}, 序号=${partNumber}`,
        offset: [offset, offset + udhHex.length]
      });
      offset += udhHex.length;
    }

    if (params.encoding === '7bit') {
      const encoded = encode7Bit(messagePart || '', udhLengthBytes);
      udHex = encoded.hex;
      udLength = encoded.length;
      if (isMultiPart) {
        const udhSeptets = Math.ceil((udhLengthBytes * 8) / 7);
        udLength += udhSeptets;
      }
    } else {
      const encoded = encodeUcs2(messagePart || '');
      udHex = encoded.hex;
      udLength = encoded.length + udhLengthBytes;
    }

    const udlHex = byteToHex(udLength);
    pdu += udlHex;
    parts.push({
      name: '用户数据长度 (TP-UDL)',
      hex: udlHex,
      description: `${udLength} ${params.encoding === '7bit' ? 'septets' : '字节'}${isMultiPart ? ' (含 UDH)' : ''}`,
      offset: [offset, offset + 2]
    });
    offset += 2;

    if (udhHex) {
      pdu += udhHex;
    }
    if (udHex) {
      pdu += udHex;
    }

    parts.push({
      name: '用户数据 (TP-UD)',
      hex: (udhHex || '') + udHex,
      description: messagePart || '(空)',
      offset: [offset - 2, offset + (udhHex || '').length + udHex.length]
    });

    return {
      success: true,
      pdu,
      pduLength: pdu.length / 2,
      parts,
      multiPart: isMultiPart ? {
        total: totalParts,
        partNumber,
        reference: concatRef
      } : undefined
    };
  } catch (error) {
    return {
      success: false,
      pdu: '',
      pduLength: 0,
      parts: [],
      error: error instanceof Error ? error.message : '编码失败'
    };
  }
};

export const encodePdu = (params: EncodeParams): EncodeResult => {
  const messageParts = splitMessage(params.messageText, params.encoding);
  if (messageParts.length === 1) {
    return buildSinglePdu(params, messageParts[0], 1, 1, 0);
  }
  const concatRef = Math.floor(Math.random() * 256);
  return buildSinglePdu(params, messageParts[0], 1, messageParts.length, concatRef);
};

export const encodeMultiPdu = (params: EncodeParams): MultiEncodeResult => {
  try {
    const messageParts = splitMessage(params.messageText, params.encoding);
    const totalParts = messageParts.length;

    if (totalParts === 1) {
      const result = buildSinglePdu(params, messageParts[0], 1, 1, 0);
      return {
        success: result.success,
        pdus: [result],
        totalParts: 1,
        error: result.error
      };
    }

    const concatRef = Math.floor(Math.random() * 256);
    const pdus: EncodeResult[] = [];

    for (let i = 0; i < messageParts.length; i++) {
      const result = buildSinglePdu(params, messageParts[i], i + 1, totalParts, concatRef, i);
      if (!result.success) {
        return {
          success: false,
          pdus: [],
          totalParts: 0,
          error: result.error
        };
      }
      pdus.push(result);
    }

    return {
      success: true,
      pdus,
      totalParts
    };
  } catch (error) {
    return {
      success: false,
      pdus: [],
      totalParts: 0,
      error: error instanceof Error ? error.message : '编码失败'
    };
  }
};
