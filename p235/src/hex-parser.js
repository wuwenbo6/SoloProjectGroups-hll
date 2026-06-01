const RecordTypes = {
  DATA: 0x00,
  EOF: 0x01,
  EXT_SEG_ADDR: 0x02,
  START_SEG_ADDR: 0x03,
  EXT_LIN_ADDR: 0x04,
  START_LIN_ADDR: 0x05
};

class HexParser {
  constructor() {
    this.reset();
  }

  reset() {
    this.programMemory = new Map();
    this.eepromMemory = new Map();
    this.configMemory = new Map();
    this.idMemory = new Map();
    this.extendedAddress = 0;
    this.startAddress = 0;
    this.minAddress = Infinity;
    this.maxAddress = 0;
  }

  parse(content) {
    this.reset();

    const lines = content.split(/\r?\n/);
    let lineNumber = 0;

    for (const line of lines) {
      lineNumber++;
      const trimmedLine = line.trim();

      if (!trimmedLine) continue;
      if (!trimmedLine.startsWith(':')) {
        throw new Error(`行 ${lineNumber}: 无效的HEX格式，必须以冒号开头`);
      }

      const record = this.parseRecord(trimmedLine, lineNumber);
      this.processRecord(record);
    }

    return {
      program: this.getProgramArray(),
      eeprom: this.getEepromArray(),
      config: this.getConfigArray(),
      id: this.getIdArray(),
      startAddress: this.startAddress,
      minAddress: this.minAddress,
      maxAddress: this.maxAddress,
      programSize: this.maxAddress - this.minAddress + 1
    };
  }

  parseRecord(line, lineNumber) {
    const hexData = line.slice(1);

    if (hexData.length < 10) {
      throw new Error(`行 ${lineNumber}: 记录太短`);
    }

    if (hexData.length % 2 !== 0) {
      throw new Error(`行 ${lineNumber}: 无效的十六进制长度`);
    }

    const byteCount = parseInt(hexData.slice(0, 2), 16);
    const address = parseInt(hexData.slice(2, 6), 16);
    const recordType = parseInt(hexData.slice(6, 8), 16);
    const dataStart = 8;
    const dataEnd = dataStart + byteCount * 2;
    const checksumPos = dataEnd;

    if (hexData.length < checksumPos + 2) {
      throw new Error(`行 ${lineNumber}: 数据长度不匹配`);
    }

    const data = [];
    for (let i = 0; i < byteCount; i++) {
      const byteStr = hexData.slice(dataStart + i * 2, dataStart + i * 2 + 2);
      data.push(parseInt(byteStr, 16));
    }

    const checksum = parseInt(hexData.slice(checksumPos, checksumPos + 2), 16);

    let calcChecksum = byteCount + (address >> 8) + (address & 0xFF) + recordType;
    for (const byte of data) {
      calcChecksum += byte;
    }
    calcChecksum = (-calcChecksum) & 0xFF;

    if (calcChecksum !== checksum) {
      throw new Error(`行 ${lineNumber}: 校验和错误 (预期 ${checksum.toString(16).toUpperCase()}, 实际 ${calcChecksum.toString(16).toUpperCase()})`);
    }

    return {
      byteCount,
      address,
      recordType,
      data,
      checksum
    };
  }

  processRecord(record) {
    switch (record.recordType) {
      case RecordTypes.DATA:
        this.processDataRecord(record);
        break;
      case RecordTypes.EOF:
        break;
      case RecordTypes.EXT_SEG_ADDR:
        this.processExtSegAddress(record);
        break;
      case RecordTypes.START_SEG_ADDR:
        this.processStartSegAddress(record);
        break;
      case RecordTypes.EXT_LIN_ADDR:
        this.processExtLinAddress(record);
        break;
      case RecordTypes.START_LIN_ADDR:
        this.processStartLinAddress(record);
        break;
      default:
        throw new Error(`未知的记录类型: ${record.recordType}`);
    }
  }

  processDataRecord(record) {
    const baseAddress = (this.extendedAddress << 16) | record.address;

    for (let i = 0; i < record.data.length; i++) {
      const absAddress = baseAddress + i;
      const byte = record.data[i];

      if (absAddress < 0x210000) {
        this.programMemory.set(absAddress, byte);
        this.minAddress = Math.min(this.minAddress, absAddress);
        this.maxAddress = Math.max(this.maxAddress, absAddress);
      } else if (absAddress >= 0x210000 && absAddress < 0x220000) {
        const eepromAddr = absAddress - 0x210000;
        this.eepromMemory.set(eepromAddr, byte);
      } else if (absAddress >= 0x300000 && absAddress < 0x300008) {
        const configAddr = absAddress - 0x300000;
        this.configMemory.set(configAddr, byte);
      } else if (absAddress >= 0x200000 && absAddress < 0x200008) {
        const idAddr = absAddress - 0x200000;
        this.idMemory.set(idAddr, byte);
      }
    }
  }

  processExtSegAddress(record) {
    if (record.data.length !== 2) {
      throw new Error('扩展段地址记录必须有2字节数据');
    }
    this.extendedAddress = (record.data[0] << 8) | record.data[1];
  }

  processStartSegAddress(record) {
    if (record.data.length !== 4) {
      throw new Error('起始段地址记录必须有4字节数据');
    }
    const cs = (record.data[0] << 8) | record.data[1];
    const ip = (record.data[2] << 8) | record.data[3];
    this.startAddress = (cs << 4) + ip;
  }

  processExtLinAddress(record) {
    if (record.data.length !== 2) {
      throw new Error('扩展线性地址记录必须有2字节数据');
    }
    this.extendedAddress = (record.data[0] << 8) | record.data[1];
  }

  processStartLinAddress(record) {
    if (record.data.length !== 4) {
      throw new Error('起始线性地址记录必须有4字节数据');
    }
    this.startAddress = 
      (record.data[0] << 24) |
      (record.data[1] << 16) |
      (record.data[2] << 8) |
      record.data[3];
  }

  getProgramArray() {
    const program = [];
    const keys = Array.from(this.programMemory.keys()).sort((a, b) => a - b);

    if (keys.length === 0) return [];

    const maxAddr = keys[keys.length - 1];
    for (let i = 0; i <= maxAddr; i++) {
      program.push(this.programMemory.get(i) || 0xFF);
    }

    const words = [];
    for (let i = 0; i < program.length; i += 2) {
      const low = program[i] || 0xFF;
      const high = program[i + 1] || 0xFF;
      words.push(low | (high << 8));
    }

    return words;
  }

  getEepromArray() {
    const eeprom = [];
    const keys = Array.from(this.eepromMemory.keys()).sort((a, b) => a - b);

    if (keys.length === 0) return [];

    const maxAddr = keys[keys.length - 1];
    for (let i = 0; i <= maxAddr; i++) {
      eeprom.push(this.eepromMemory.get(i) || 0xFF);
    }

    return eeprom;
  }

  getConfigArray() {
    const config = [];
    for (let i = 0; i < 8; i++) {
      const low = this.configMemory.get(i * 2) || 0xFF;
      const high = this.configMemory.get(i * 2 + 1) || 0xFF;
      config.push(low | (high << 8));
    }
    return config;
  }

  getIdArray() {
    const id = [];
    for (let i = 0; i < 8; i++) {
      const low = this.idMemory.get(i * 2) || 0xFF;
      const high = this.idMemory.get(i * 2 + 1) || 0xFF;
      id.push(low | (high << 8));
    }
    return id;
  }

  static generateHex(data, startAddress = 0) {
    const lines = [];
    const bytesPerLine = 16;
    let address = startAddress;

    for (let i = 0; i < data.length; i += bytesPerLine) {
      const chunk = data.slice(i, i + bytesPerLine);
      lines.push(this.createDataRecord(address, chunk));
      address += bytesPerLine;
    }

    lines.push(':00000001FF');

    return lines.join('\n');
  }

  static createDataRecord(address, data) {
    const byteCount = data.length;
    const record = [];

    record.push(byteCount);
    record.push((address >> 8) & 0xFF);
    record.push(address & 0xFF);
    record.push(0x00);

    for (const byte of data) {
      record.push(byte & 0xFF);
    }

    let checksum = 0;
    for (const byte of record) {
      checksum += byte;
    }
    checksum = (-checksum) & 0xFF;
    record.push(checksum);

    return ':' + record.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('');
  }
}

module.exports = HexParser;
