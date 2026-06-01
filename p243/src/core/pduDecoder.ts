import { DecodeResult, PduPart, AddressInfo, UdhInfo } from '../types/pdu';
import { decode7Bit } from './encoding7bit';
import { decodeUcs2 } from './encodingUcs2';
import { decodeNumber, decodeScts, hexToByte, swapNibbles, parseUdh } from './utils';

const parseAddress = (pdu: string, start: number): { info: AddressInfo; end: number } => {
  const length = hexToByte(pdu.substring(start, start + 2));
  const type = hexToByte(pdu.substring(start + 2, start + 4));
  const addressHexLength = Math.ceil(length / 2) * 2;
  const addressHex = pdu.substring(start + 4, start + 4 + addressHexLength);
  const number = decodeNumber(addressHex, type);

  return {
    info: {
      length,
      type,
      number
    },
    end: start + 4 + addressHexLength
  };
};

const getPduTypeName = (pduType: number): string => {
  const mti = pduType & 0x03;
  const udhi = (pduType & 0x40) ? ' (含 UDHI)' : '';
  switch (mti) {
    case 0x00: return `SMS-DELIVER (MT)${udhi}`;
    case 0x01: return `SMS-SUBMIT (MO)${udhi}`;
    case 0x02: return `SMS-STATUS-REPORT${udhi}`;
    default: return `未知 (0x${pduType.toString(16).padStart(2, '0')})${udhi}`;
  }
};

const getDcsName = (dcs: number): { encoding: '7bit' | 'ucs2'; description: string } => {
  if ((dcs & 0x0C) === 0x08) {
    return { encoding: 'ucs2', description: 'UCS2 (16-bit Unicode)' };
  }
  if ((dcs & 0x04) === 0x00) {
    return { encoding: '7bit', description: '7-bit 默认字母表' };
  }
  if ((dcs & 0x04) === 0x04) {
    return { encoding: '7bit', description: '8-bit 数据' };
  }
  return { encoding: '7bit', description: '7-bit 默认字母表' };
};

export const decodePdu = (pdu: string): DecodeResult | null => {
  try {
    pdu = pdu.replace(/\s/g, '').toUpperCase();

    if (pdu.length < 4 || pdu.length % 2 !== 0) {
      return null;
    }

    const parts: PduPart[] = [];
    let offset = 0;

    const smscLength = hexToByte(pdu.substring(0, 2));
    let smsc: AddressInfo = { length: 0, type: 0, number: '' };

    if (smscLength > 0) {
      const smscEnd = 2 + smscLength * 2;
      const smscType = hexToByte(pdu.substring(2, 4));
      const smscHex = pdu.substring(4, smscEnd);
      const smscNumber = decodeNumber(smscHex, smscType);
      smsc = { length: smscLength, type: smscType, number: smscNumber };

      parts.push({
        name: 'SMSC 地址',
        hex: pdu.substring(0, smscEnd),
        description: smscNumber,
        offset: [0, smscEnd]
      });
      offset = smscEnd;
    } else {
      parts.push({
        name: 'SMSC 地址',
        hex: '00',
        description: '无 SMSC',
        offset: [0, 2]
      });
      offset = 2;
    }

    const pduType = hexToByte(pdu.substring(offset, offset + 2));
    const pduTypeHex = pdu.substring(offset, offset + 2);
    const hasUdhi = (pduType & 0x40) !== 0;
    parts.push({
      name: 'PDU 类型 (TP-MTI)',
      hex: pduTypeHex,
      description: getPduTypeName(pduType),
      offset: [offset, offset + 2]
    });
    offset += 2;

    const isDeliver = (pduType & 0x03) === 0x00;
    const isSubmit = (pduType & 0x03) === 0x01;

    let mr: number | undefined;
    if (isSubmit) {
      mr = hexToByte(pdu.substring(offset, offset + 2));
      parts.push({
        name: '消息参考号 (TP-MR)',
        hex: pdu.substring(offset, offset + 2),
        description: `0x${mr.toString(16).padStart(2, '0')} (${mr})`,
        offset: [offset, offset + 2]
      });
      offset += 2;
    }

    let oa: AddressInfo | undefined;
    let da: AddressInfo | undefined;

    if (isDeliver) {
      const oaResult = parseAddress(pdu, offset);
      oa = oaResult.info;
      parts.push({
        name: '发起方地址 (TP-OA)',
        hex: pdu.substring(offset, oaResult.end),
        description: `号码: ${oa.number}, TON/NPI: 0x${oa.type.toString(16).padStart(2, '0')}`,
        offset: [offset, oaResult.end]
      });
      offset = oaResult.end;
    } else if (isSubmit) {
      const daResult = parseAddress(pdu, offset);
      da = daResult.info;
      parts.push({
        name: '目标地址 (TP-DA)',
        hex: pdu.substring(offset, daResult.end),
        description: `号码: ${da.number}, TON/NPI: 0x${da.type.toString(16).padStart(2, '0')}`,
        offset: [offset, daResult.end]
      });
      offset = daResult.end;
    }

    const pid = hexToByte(pdu.substring(offset, offset + 2));
    parts.push({
      name: '协议标识 (TP-PID)',
      hex: pdu.substring(offset, offset + 2),
      description: pid === 0 ? '0x00 - 普通短信' : `0x${pid.toString(16).padStart(2, '0')}`,
      offset: [offset, offset + 2]
    });
    offset += 2;

    const dcs = hexToByte(pdu.substring(offset, offset + 2));
    const dcsInfo = getDcsName(dcs);
    parts.push({
      name: '数据编码方案 (TP-DCS)',
      hex: pdu.substring(offset, offset + 2),
      description: `0x${dcs.toString(16).padStart(2, '0')} - ${dcsInfo.description}`,
      offset: [offset, offset + 2]
    });
    offset += 2;

    let scts: string | undefined;
    if (isDeliver) {
      const sctsHex = pdu.substring(offset, offset + 14);
      scts = decodeScts(sctsHex);
      parts.push({
        name: '服务中心时间戳 (TP-SCTS)',
        hex: sctsHex,
        description: scts,
        offset: [offset, offset + 14]
      });
      offset += 14;
    }

    const udl = hexToByte(pdu.substring(offset, offset + 2));
    parts.push({
      name: '用户数据长度 (TP-UDL)',
      hex: pdu.substring(offset, offset + 2),
      description: `${udl} ${dcsInfo.encoding === '7bit' ? 'septets' : '字节'}`,
      offset: [offset, offset + 2]
    });
    offset += 2;

    const udHexRaw = pdu.substring(offset);
    let udHex = udHexRaw;
    let udhInfo: UdhInfo | undefined;

    if (hasUdhi && udHexRaw.length > 0) {
      const parsed = parseUdh(udHexRaw);
      udhInfo = parsed.udhInfo;
      udHex = parsed.udHex;

      if (udhInfo.hasUdh && udhInfo.udhHex) {
        parts.push({
          name: '用户数据头 (UDH)',
          hex: udhInfo.udhHex,
          description: udhInfo.concatRef !== undefined
            ? `拼接短信: 参考号=${udhInfo.concatRef}, 总数=${udhInfo.concatTotal}, 序号=${udhInfo.concatSeq}`
            : `UDH 长度: ${udhInfo.udhLength} 字节`,
          offset: [offset, offset + udhInfo.udhHex.length]
        });
      }
    }

    let udText = '';
    let udLength = udl;

    if (dcsInfo.encoding === 'ucs2') {
      if (udhInfo?.hasUdh) {
        const udhBytes = udhInfo.udhLength + 1;
        const messageBytes = udl - udhBytes;
        const messageHex = udHex.substring(0, messageBytes * 2);
        udText = decodeUcs2(messageHex);
      } else {
        udText = decodeUcs2(udHex);
      }
    } else {
      const udhLengthBytes = udhInfo?.hasUdh ? udhInfo.udhLength + 1 : 0;
      const decoded = decode7Bit(udHex, udl, udhLengthBytes);
      udText = decoded.text;
    }

    parts.push({
      name: '用户数据 (TP-UD)',
      hex: udHexRaw,
      description: udText || '(空)',
      offset: [offset, offset + udHexRaw.length]
    });

    return {
      smsc,
      pduType: getPduTypeName(pduType),
      pduTypeHex,
      mr,
      oa,
      da,
      pid,
      dcs,
      encoding: dcsInfo.encoding,
      scts,
      udl,
      ud: {
        hex: udHex,
        text: udText,
        length: udLength
      },
      rawPdu: pdu,
      parts,
      udh: udhInfo
    };
  } catch (e) {
    return null;
  }
};

export const combineMultiPartMessages = (results: DecodeResult[]): string => {
  const sorted = [...results].sort((a, b) => {
    const seqA = a.udh?.concatSeq || 0;
    const seqB = b.udh?.concatSeq || 0;
    return seqA - seqB;
  });
  return sorted.map(r => r.ud.text).join('');
};
