const { Buffer } = require('buffer');

class AtrParser {
  static parse(atrHex) {
    const atrBuf = Buffer.from(atrHex, 'hex');
    if (atrBuf.length < 2) {
      throw new Error('ATR too short');
    }

    const result = {
      raw: atrHex,
      ts: atrBuf[0],
      tsConvention: atrBuf[0] === 0x3B ? 'direct' : 'inverse',
      t0: atrBuf[1],
      historicalBytesCount: atrBuf[1] & 0x0F,
      interfaceBytes: [],
      historicalBytes: '',
      historicalBytesRaw: Buffer.alloc(0),
      tck: null,
      checksumValid: null,
    };

    let offset = 2;
    let td = atrBuf[1];
    let hasTck = false;

    for (let i = 0; i < 4; i++) {
      if (td & 0x10) {
        result.interfaceBytes.push({ byte: 'TA', value: atrBuf[offset++] });
      }
      if (td & 0x20) {
        result.interfaceBytes.push({ byte: 'TB', value: atrBuf[offset++] });
      }
      if (td & 0x40) {
        result.interfaceBytes.push({ byte: 'TC', value: atrBuf[offset++] });
      }
      if (td & 0x80) {
        td = atrBuf[offset++];
        if (td & 0x0F) hasTck = true;
      } else {
        break;
      }
    }

    if (result.historicalBytesCount > 0 && offset + result.historicalBytesCount <= atrBuf.length) {
      result.historicalBytesRaw = atrBuf.subarray(offset, offset + result.historicalBytesCount);
      result.historicalBytes = result.historicalBytesRaw.toString('hex');
      result.historicalChars = this._parseHistoricalBytes(result.historicalBytesRaw);
      offset += result.historicalBytesCount;
    }

    if (hasTck && offset < atrBuf.length) {
      result.tck = atrBuf[offset];

      let checksum = 0;
      for (let i = 1; i < offset; i++) {
        checksum ^= atrBuf[i];
      }
      result.checksumValid = (checksum === result.tck);
    }

    return result;
  }

  static _parseHistoricalBytes(histBuf) {
    const chars = [];
    let offset = 0;

    while (offset < histBuf.length) {
      const tag = histBuf[offset];

      if (tag === 0x00 || tag === 0x80 || tag === 0x81 || tag === 0x82 ||
          tag === 0x83 || tag === 0x84 || tag === 0xA0 || tag === 0xC0) {
        if (offset + 1 >= histBuf.length) break;

        let len = histBuf[offset + 1];
        let dataOffset = offset + 2;

        if (tag === 0x80 && len === 0x01) {
          if (dataOffset + 1 > histBuf.length) break;
          chars.push({
            type: 'country_code',
            description: 'Country code',
            value: histBuf[dataOffset],
          });
          offset = dataOffset + 1;
        } else if (tag === 0x81 && len === 0x01) {
          if (dataOffset + 1 > histBuf.length) break;
          chars.push({
            type: 'issuer_id',
            description: 'Issuer identification number',
            value: histBuf[dataOffset],
          });
          offset = dataOffset + 1;
        } else if (tag === 0x82 && len === 0x02) {
          if (dataOffset + 2 > histBuf.length) break;
          chars.push({
            type: 'card_service',
            description: 'Card service data',
            value: histBuf.subarray(dataOffset, dataOffset + 2).toString('hex'),
          });
          offset = dataOffset + 2;
        } else if (tag === 0x83 && len > 0) {
          if (dataOffset + len > histBuf.length) len = histBuf.length - dataOffset;
          chars.push({
            type: 'initial_access_data',
            description: 'Initial access data',
            value: histBuf.subarray(dataOffset, dataOffset + len).toString('hex'),
          });
          offset = dataOffset + len;
        } else if (tag === 0x84 && len > 0) {
          if (dataOffset + len > histBuf.length) len = histBuf.length - dataOffset;
          chars.push({
            type: 'card_capabilities',
            description: 'Card capabilities',
            value: histBuf.subarray(dataOffset, dataOffset + len).toString('hex'),
          });
          offset = dataOffset + len;
        } else if (tag === 0xA0 && len > 0) {
          if (dataOffset + len > histBuf.length) len = histBuf.length - dataOffset;
          chars.push({
            type: 'aid',
            description: 'Application identifier (AID)',
            value: histBuf.subarray(dataOffset, dataOffset + + len).toString('hex'),
          });
          offset = dataOffset + len;
        } else if (tag === 0xC0 && len > 0) {
          if (dataOffset + len > histBuf.length) len = histBuf.length - dataOffset;
          chars.push({
            type: 'extended_compact_tlv',
            description: 'Extended compact TLV data',
            value: histBuf.subarray(dataOffset, dataOffset + len).toString('hex'),
          });
          offset = dataOffset + len;
        } else if (tag === 0x00 && len > 0) {
          if (dataOffset + len > histBuf.length) len = histBuf.length - dataOffset;
          chars.push({
            type: 'lifecycle',
            description: 'Lifecycle status byte',
            value: histBuf.subarray(dataOffset, dataOffset + len).toString('hex'),
          });
          offset = dataOffset + len;
        } else {
          offset += 2 + len;
        }
      } else {
        chars.push({
          type: 'proprietary',
          description: 'Proprietary encoding',
          value: histBuf[offset].toString(16).padStart(2, '0'),
        });
        offset += 1;
      }
    }

    return chars;
  }

  static formatHumanReadable(parsed) {
    const lines = [];
    lines.push(`Raw ATR: ${parsed.raw}`);
    lines.push(`TS: 0x${parsed.ts.toString(16).padStart(2, '0')} (${parsed.tsConvention} convention)`);
    lines.push(`T0: 0x${parsed.t0.toString(16).padStart(2, '0')} (${parsed.historicalBytesCount} historical bytes)`);

    if (parsed.interfaceBytes.length > 0) {
      lines.push('Interface bytes:');
      for (const ib of parsed.interfaceBytes) {
        lines.push(`  ${ib.byte}: 0x${ib.value.toString(16).padStart(2, '0')}`);
      }
    }

    if (parsed.historicalBytes) {
      lines.push(`Historical bytes: ${parsed.historicalBytes}`);
      if (parsed.historicalChars && parsed.historicalChars.length > 0) {
        lines.push('Historical characters:');
        for (const hc of parsed.historicalChars) {
          lines.push(`  [${hc.type}] ${hc.description}: ${hc.value}`);
        }
      }
    }

    if (parsed.tck !== null) {
      const validStr = parsed.checksumValid === true ? 'valid' : parsed.checksumValid === false ? 'invalid' : 'n/a';
      lines.push(`TCK: 0x${parsed.tck.toString(16).padStart(2, '0')} (${validStr})`);
    }

    return lines.join('\n');
  }
}

module.exports = { AtrParser };
