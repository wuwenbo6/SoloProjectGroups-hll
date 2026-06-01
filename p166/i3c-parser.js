const I3C_CCC_CODES = {
  0x00: 'RESERVED_00',
  0x01: 'RESERVED_01',
  0x02: 'RESERVED_02',
  0x03: 'RESERVED_03',
  0x04: 'RESERVED_04',
  0x05: 'RESERVED_05',
  0x06: 'ENEC',
  0x07: 'DISEC',
  0x08: 'ENTAS0',
  0x09: 'ENTAS1',
  0x0A: 'ENTAS2',
  0x0B: 'ENTAS3',
  0x0C: 'SETDASA',
  0x0D: 'SETNEWDA',
  0x0E: 'SETMWL',
  0x0F: 'SETMRL',
  0x10: 'RESERVED_10',
  0x11: 'GETCAPS',
  0x12: 'GETPID',
  0x13: 'GETBCR',
  0x14: 'GETDCR',
  0x15: 'GETSTATUS',
  0x16: 'GETACCCR',
  0x17: 'GETMXDS',
  0x18: 'RESERVED_18',
  0x19: 'GETHDRCAP',
  0x1A: 'RESERVED_1A',
  0x1B: 'RESERVED_1B',
  0x1C: 'RESERVED_1C',
  0x1D: 'RESERVED_1D',
  0x1E: 'RESERVED_1E',
  0x1F: 'RESERVED_1F',
  0x20: 'ENHDR',
  0x21: 'DIHDR',
  0x22: 'SETSID',
  0x23: 'SETAASA',
  0x24: 'SETXTIME',
  0x25: 'SETHDRPWR',
  0x26: 'RESERVED_26',
  0x27: 'RESERVED_27',
  0x28: 'RSTDAA',
  0x29: 'SLVRST',
  0x2A: 'SETMUX',
  0x2B: 'GETMUX',
  0x2C: 'CHKADDR',
  0x2D: 'PREPARE',
  0x2E: 'GETACCMST',
  0x2F: 'RESET',
  0x30: 'SETBRGTGT',
  0x31: 'GETBRGTGT',
  0x32: 'RESERVED_32',
  0x33: 'GETDXFER',
  0x34: 'RESERVED_34',
  0x35: 'RESERVED_35',
  0x36: 'RESERVED_36',
  0x37: 'RESERVED_37',
  0x38: 'RESERVED_38',
  0x39: 'RESERVED_39',
  0x3A: 'RESERVED_3A',
  0x3B: 'RESERVED_3B',
  0x3C: 'RESERVED_3C',
  0x3D: 'RESERVED_3D',
  0x3E: 'RESERVED_3E',
  0x3F: 'RESERVED_3F',
  0x40: 'RESERVED_40',
  0x41: 'RESERVED_41',
  0x42: 'RESERVED_42',
  0x43: 'RESERVED_43',
  0x44: 'RESERVED_44',
  0x45: 'RESERVED_45',
  0x46: 'RESERVED_46',
  0x47: 'RESERVED_47',
  0x48: 'RESERVED_48',
  0x49: 'RESERVED_49',
  0x4A: 'RESERVED_4A',
  0x4B: 'RESERVED_4B',
  0x4C: 'RESERVED_4C',
  0x4D: 'RESERVED_4D',
  0x4E: 'RESERVED_4E',
  0x4F: 'RESERVED_4F',
  0x50: 'RESERVED_50',
  0x51: 'RESERVED_51',
  0x52: 'RESERVED_52',
  0x53: 'RESERVED_53',
  0x54: 'RESERVED_54',
  0x55: 'RESERVED_55',
  0x56: 'RESERVED_56',
  0x57: 'RESERVED_57',
  0x58: 'RESERVED_58',
  0x59: 'RESERVED_59',
  0x5A: 'RESERVED_5A',
  0x5B: 'RESERVED_5B',
  0x5C: 'RESERVED_5C',
  0x5D: 'RESERVED_5D',
  0x5E: 'RESERVED_5E',
  0x5F: 'RESERVED_5F',
  0x60: 'VENDOR_60',
  0x61: 'VENDOR_61',
  0x62: 'VENDOR_62',
  0x63: 'VENDOR_63',
  0x64: 'VENDOR_64',
  0x65: 'VENDOR_65',
  0x66: 'VENDOR_66',
  0x67: 'VENDOR_67',
  0x68: 'VENDOR_68',
  0x69: 'VENDOR_69',
  0x6A: 'VENDOR_6A',
  0x6B: 'VENDOR_6B',
  0x6C: 'VENDOR_6C',
  0x6D: 'VENDOR_6D',
  0x6E: 'VENDOR_6E',
  0x6F: 'VENDOR_6F',
  0x70: 'VENDOR_70',
  0x71: 'VENDOR_71',
  0x72: 'VENDOR_72',
  0x73: 'VENDOR_73',
  0x74: 'VENDOR_74',
  0x75: 'VENDOR_75',
  0x76: 'VENDOR_76',
  0x77: 'VENDOR_77',
  0x78: 'VENDOR_78',
  0x79: 'VENDOR_79',
  0x7A: 'VENDOR_7A',
  0x7B: 'VENDOR_7B',
  0x7C: 'VENDOR_7C',
  0x7D: 'VENDOR_7D',
  0x7E: 'VENDOR_7E',
  0x7F: 'VENDOR_7F'
};

const I3C_CCC_DESCRIPTIONS = {
  'ENEC': 'Enable Events',
  'DISEC': 'Disable Events',
  'ENTAS0': 'Enter Activity State 0',
  'ENTAS1': 'Enter Activity State 1',
  'ENTAS2': 'Enter Activity State 2',
  'ENTAS3': 'Enter Activity State 3',
  'SETDASA': 'Set Dynamic Address from Static Address',
  'SETNEWDA': 'Set New Dynamic Address',
  'SETMWL': 'Set Maximum Write Length',
  'SETMRL': 'Set Maximum Read Length',
  'GETCAPS': 'Get Device Capabilities',
  'GETPID': 'Get Provisional ID',
  'GETBCR': 'Get Bus Characteristic Register',
  'GETDCR': 'Get Device Characteristic Register',
  'GETSTATUS': 'Get Device Status',
  'GETACCCR': 'Get Accepted Converted Command Register',
  'GETMXDS': 'Get Maximum Data Speed',
  'GETHDRCAP': 'Get HDR Capabilities',
  'ENHDR': 'Enable HDR Mode',
  'DIHDR': 'Disable HDR Mode',
  'SETSID': 'Set I3C Slave ID',
  'SETAASA': 'Set All Devices as Active State',
  'SETXTIME': 'Set Transfer Time Control',
  'SETHDRPWR': 'Set HDR Power',
  'RSTDAA': 'Reset Dynamic Address Assignment',
  'SLVRST': 'Slave Reset',
  'SETMUX': 'Set MUX Configuration',
  'GETMUX': 'Get MUX Configuration',
  'CHKADDR': 'Check I3C Address',
  'PREPARE': 'Prepare for Role Change',
  'GETACCMST': 'Get Active Master',
  'RESET': 'Reset I3C Bus',
  'SETBRGTGT': 'Set Bridge Target',
  'GETBRGTGT': 'Get Bridge Target',
  'GETDXFER': 'Get Device Transfer Characteristics'
};

const ERROR_TYPES = {
  MISSING_ACK: { code: 'MISSING_ACK', severity: 'error', description: 'Missing ACK/NACK after byte transfer' },
  NACK_RECEIVED: { code: 'NACK_RECEIVED', severity: 'warning', description: 'NACK received - device not responding or busy' },
  PARITY_ERROR: { code: 'PARITY_ERROR', severity: 'error', description: 'Parity bit mismatch detected' },
  BUS_TIMEOUT: { code: 'BUS_TIMEOUT', severity: 'warning', description: 'Bus idle time exceeds expected threshold' },
  ARBITRATION_LOST: { code: 'ARBITRATION_LOST', severity: 'warning', description: 'Possible arbitration lost on SDA' },
  INCOMPLETE_TRANSACTION: { code: 'INCOMPLETE_TRANSACTION', severity: 'error', description: 'Transaction ended without STOP' },
  INVALID_ADDRESS: { code: 'INVALID_ADDRESS', severity: 'warning', description: 'Invalid or reserved I3C address detected' },
  BIT_STUFFING_ERROR: { code: 'BIT_STUFFING_ERROR', severity: 'error', description: 'More than 8 consecutive bits without transition' },
  CLOCK_STRETCH: { code: 'CLOCK_STRETCH', severity: 'info', description: 'Clock stretching detected by slave' },
  NO_ACK_AFTER_ADDRESS: { code: 'NO_ACK_AFTER_ADDRESS', severity: 'error', description: 'No ACK after address byte - no device at this address' },
  DATA_AFTER_NACK: { code: 'DATA_AFTER_NACK', severity: 'warning', description: 'Data bytes sent after receiving NACK' }
};

function getCCCName(code) {
  return I3C_CCC_CODES[code] || `CCC_0x${code.toString(16).toUpperCase().padStart(2, '0')}`;
}

function getCCCDescription(code) {
  const name = getCCCName(code);
  return I3C_CCC_DESCRIPTIONS[name] || 'Unknown Command';
}

function getCCCInfo(code) {
  const name = getCCCName(code);
  return {
    code,
    hex: `0x${code.toString(16).toUpperCase().padStart(2, '0')}`,
    name,
    description: I3C_CCC_DESCRIPTIONS[name] || 'Unknown Command',
    isStandard: !name.startsWith('RESERVED') && !name.startsWith('VENDOR'),
    isVendor: name.startsWith('VENDOR'),
    isReserved: name.startsWith('RESERVED')
  };
}

function countSetBits(byte) {
  let count = 0;
  while (byte) {
    count += byte & 1;
    byte >>= 1;
  }
  return count;
}

class I3CParser {
  constructor() {
    this.reset();
  }

  reset() {
    this.header = null;
    this.transactions = [];
    this.signals = [];
    this.errors = [];
    this.metadata = {
      startTime: Infinity,
      endTime: -Infinity,
      totalTransactions: 0,
      totalErrors: 0,
      totalWarnings: 0,
      totalLines: 0,
      parsedLines: 0,
      errorStats: {}
    };

    this.parserState = {
      currentTransaction: null,
      inTransaction: false,
      bitIndex: 0,
      currentByte: 0,
      isAddressPhase: false,
      isRead: false,
      lastLine: null,
      headerParsed: false,
      sdaIdx: -1,
      sclIdx: -1,
      timeIdx: -1,
      pendingLines: [],
      lastHighSclTime: 0,
      lastHighSdaTime: 0,
      lastBusIdleTime: 0,
      consecutiveSameBits: 0,
      lastBitValue: null,
      expectedParity: null
    };
  }

  addError(type, details, transaction = null, time = null) {
    const error = {
      ...type,
      details,
      time: time !== null ? time : (this.parserState.currentTransaction ? this.parserState.currentTransaction.startTime : this.metadata.startTime),
      transactionId: transaction ? transaction.id : null
    };

    this.errors.push(error);

    const key = type.code;
    if (!this.metadata.errorStats[key]) {
      this.metadata.errorStats[key] = { count: 0, type, details: [] };
    }
    this.metadata.errorStats[key].count++;

    if (type.severity === 'error') {
      this.metadata.totalErrors++;
    } else if (type.severity === 'warning') {
      this.metadata.totalWarnings++;
    }
  }

  parseHeader(headerLine) {
    this.header = headerLine.split(',').map(h => h.trim());
    this.parserState.sdaIdx = this.header.findIndex(h => h.toLowerCase().includes('sda'));
    this.parserState.sclIdx = this.header.findIndex(h => h.toLowerCase().includes('scl'));
    this.parserState.timeIdx = this.header.findIndex(h => h.toLowerCase().includes('time') || h.toLowerCase().includes('timestamp'));
    this.parserState.headerParsed = true;
    return this.header;
  }

  parseChunk(chunkContent, isLastChunk = false) {
    const lines = chunkContent.split('\n');

    if (!this.parserState.headerParsed && lines.length > 0) {
      this.parseHeader(lines[0]);
      lines.shift();
    }

    if (this.parserState.pendingLines.length > 0) {
      lines.unshift(...this.parserState.pendingLines);
      this.parserState.pendingLines = [];
    }

    if (!isLastChunk && lines.length > 0) {
      this.parserState.pendingLines.push(lines.pop());
    }

    const results = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const result = this.parseLine(line);
      if (result) {
        results.push(result);
      }

      this.metadata.parsedLines++;
    }

    if (isLastChunk) {
      if (this.parserState.inTransaction && this.parserState.currentTransaction) {
        this.parserState.currentTransaction.endTime = this.metadata.endTime;
        this.addError(ERROR_TYPES.INCOMPLETE_TRANSACTION, 
          `Transaction at ${this.parserState.currentTransaction.startTime.toFixed(6)}s ended without STOP condition`,
          this.parserState.currentTransaction);
        this.transactions.push(this.parserState.currentTransaction);
        this.metadata.totalTransactions++;
        this.parserState.inTransaction = false;
        this.parserState.currentTransaction = null;
      }
      
      if (this.parserState.bitIndex > 0 && this.parserState.inTransaction) {
        this.addError(ERROR_TYPES.MISSING_ACK,
          `Incomplete byte at end of file: ${this.parserState.bitIndex} bits received, expected 9`,
          this.parserState.currentTransaction);
      }
    }

    return {
      signals: results,
      transactions: this.transactions.slice(-results.length > 0 ? Math.max(1, Math.floor(results.length / 10)) : 0),
      progress: {
        parsedLines: this.metadata.parsedLines,
        totalLines: this.metadata.totalLines
      }
    };
  }

  parseLine(line) {
    const values = line.split(',').map(v => v.trim());
    const time = this.parserState.timeIdx >= 0 ? parseFloat(values[this.parserState.timeIdx]) : this.metadata.parsedLines * 0.001;
    const sda = this.parserState.sdaIdx >= 0 ? parseInt(values[this.parserState.sdaIdx]) : null;
    const scl = this.parserState.sclIdx >= 0 ? parseInt(values[this.parserState.sclIdx]) : null;

    if (time < this.metadata.startTime) this.metadata.startTime = time;
    if (time > this.metadata.endTime) this.metadata.endTime = time;

    if (scl === 1) {
      if (this.parserState.lastHighSclTime > 0 && time - this.parserState.lastHighSclTime > 0.001) {
        this.addError(ERROR_TYPES.CLOCK_STRETCH,
          `Clock stretching detected: SCL held low for ${((time - this.parserState.lastHighSclTime) * 1000).toFixed(2)}ms`,
          this.parserState.currentTransaction, time);
      }
      this.parserState.lastHighSclTime = time;
    }

    if (sda === 0 && scl === 0 && time - this.parserState.lastBusIdleTime > 0.01) {
      this.addError(ERROR_TYPES.BUS_TIMEOUT,
        `Bus timeout: both SDA and SCL held low for ${((time - this.parserState.lastBusIdleTime) * 1000).toFixed(2)}ms`,
        this.parserState.currentTransaction, time);
    }
    this.parserState.lastBusIdleTime = time;

    const signal = {
      time,
      sda,
      scl,
      rawLine: line
    };
    this.signals.push(signal);

    if (this.parserState.lastLine !== null) {
      const prevValues = this.parserState.lastLine.split(',').map(v => v.trim());
      const prevSda = this.parserState.sdaIdx >= 0 ? parseInt(prevValues[this.parserState.sdaIdx]) : null;
      const prevScl = this.parserState.sclIdx >= 0 ? parseInt(prevValues[this.parserState.sclIdx]) : null;

      if (prevSda !== null && prevScl !== null) {
        if (prevSda !== sda && prevScl === 1 && scl === 1) {
          this.parserState.consecutiveSameBits = 0;
        }
      }
    }

    if (this.parserState.lastLine !== null) {
      const prevValues = this.parserState.lastLine.split(',').map(v => v.trim());
      const prevSda = this.parserState.sdaIdx >= 0 ? parseInt(prevValues[this.parserState.sdaIdx]) : null;

      if (sda === 1 && scl === 1 && prevSda === 0) {
        if (this.parserState.inTransaction && this.parserState.currentTransaction) {
          if (this.parserState.bitIndex > 0 && this.parserState.bitIndex < 9) {
            this.addError(ERROR_TYPES.INCOMPLETE_TRANSACTION,
              `Transaction aborted mid-byte: ${this.parserState.bitIndex} bits received`,
              this.parserState.currentTransaction, time);
          }
          this.parserState.currentTransaction.endTime = time;
          this.transactions.push(this.parserState.currentTransaction);
          this.metadata.totalTransactions++;
        }
        this.parserState.inTransaction = false;
        this.parserState.currentTransaction = null;
        this.parserState.bitIndex = 0;
        this.parserState.currentByte = 0;
        this.parserState.consecutiveSameBits = 0;
      }

      if (sda === 0 && scl === 1 && prevSda === 1) {
        if (this.parserState.inTransaction && this.parserState.currentTransaction) {
          if (this.parserState.bitIndex > 0 && this.parserState.bitIndex < 9) {
            this.addError(ERROR_TYPES.INCOMPLETE_TRANSACTION,
              `Repeated START during mid-byte transfer`,
              this.parserState.currentTransaction, time);
          }
          this.parserState.currentTransaction.endTime = time;
          this.transactions.push(this.parserState.currentTransaction);
          this.metadata.totalTransactions++;
        }
        this.parserState.currentTransaction = {
          id: this.transactions.length,
          startTime: time,
          endTime: null,
          type: 'START',
          isRepeatedStart: this.parserState.inTransaction,
          bytes: [],
          errors: []
        };
        this.parserState.inTransaction = true;
        this.parserState.isAddressPhase = true;
        this.parserState.bitIndex = 0;
        this.parserState.currentByte = 0;
        this.parserState.consecutiveSameBits = 0;
      }
    }

    if (this.parserState.inTransaction && scl === 1 && this.parserState.currentTransaction) {
      if (this.parserState.lastLine !== null) {
        const prevValues = this.parserState.lastLine.split(',').map(v => v.trim());
        const prevScl = this.parserState.sclIdx >= 0 ? parseInt(prevValues[this.parserState.sclIdx]) : null;
        const prevSda = this.parserState.sdaIdx >= 0 ? parseInt(prevValues[this.parserState.sdaIdx]) : null;

        if (prevScl === 0) {
          if (this.parserState.lastBitValue === sda) {
            this.parserState.consecutiveSameBits++;
            if (this.parserState.consecutiveSameBits > 10 && this.parserState.bitIndex > 0) {
              this.addError(ERROR_TYPES.BIT_STUFFING_ERROR,
                `${this.parserState.consecutiveSameBits} consecutive identical bits detected`,
                this.parserState.currentTransaction, time);
            }
          } else {
            this.parserState.consecutiveSameBits = 0;
          }
          this.parserState.lastBitValue = sda;

          if (this.parserState.bitIndex < 8) {
            this.parserState.currentByte = (this.parserState.currentByte << 1) | (sda ? 1 : 0);
            this.parserState.bitIndex++;
          } else if (this.parserState.bitIndex === 8) {
            const ack = sda === 0 ? 'ACK' : 'NACK';
            const byteInfo = {
              value: this.parserState.currentByte,
              hex: `0x${this.parserState.currentByte.toString(16).toUpperCase().padStart(2, '0')}`,
              binary: this.parserState.currentByte.toString(2).padStart(8, '0'),
              ack: ack,
              isAddress: this.parserState.isAddressPhase,
              isRead: this.parserState.isAddressPhase ? (this.parserState.currentByte & 0x01) === 1 : this.parserState.isRead,
              time: time
            };

            if (this.parserState.isAddressPhase) {
              byteInfo.address = (this.parserState.currentByte >> 1) & 0x7F;
              byteInfo.rw = (this.parserState.currentByte & 0x01) === 1 ? 'READ' : 'WRITE';
              this.parserState.isRead = byteInfo.isRead;
              this.parserState.isAddressPhase = false;

              if (byteInfo.address === 0x00 || byteInfo.address === 0x7F || byteInfo.address === 0x7E) {
              } else if (byteInfo.address === 0x00) {
                this.addError(ERROR_TYPES.INVALID_ADDRESS,
                  `Address 0x00 is reserved for I3C broadcast`,
                  this.parserState.currentTransaction, time);
              }

              if (this.parserState.currentTransaction.bytes.length === 0 && byteInfo.address === 0x7E) {
                this.parserState.currentTransaction.type = 'BROADCAST';
              } else if (this.parserState.currentTransaction.bytes.length === 0 && byteInfo.address === 0x7F) {
                this.parserState.currentTransaction.type = 'CCC';
              } else {
                this.parserState.currentTransaction.type = 'TRANSFER';
              }
            } else {
              if (this.parserState.currentTransaction.type === 'CCC' && this.parserState.currentTransaction.bytes.length === 1) {
                byteInfo.isCCC = true;
                byteInfo.cccName = getCCCName(this.parserState.currentByte);
                byteInfo.cccDescription = getCCCDescription(this.parserState.currentByte);
              }

              if (ack === 'NACK' && this.parserState.currentTransaction.bytes.length > 0) {
                const lastByte = this.parserState.currentTransaction.bytes[this.parserState.currentTransaction.bytes.length - 1];
                if (lastByte && lastByte.ack === 'NACK') {
                  this.addError(ERROR_TYPES.DATA_AFTER_NACK,
                    `Byte ${this.parserState.currentTransaction.bytes.length} sent after receiving NACK on previous byte`,
                    this.parserState.currentTransaction, time);
                }
              }
            }

            if (ack === 'NACK') {
              if (this.parserState.currentTransaction.bytes.length === 0) {
                this.addError(ERROR_TYPES.NO_ACK_AFTER_ADDRESS,
                  `No device acknowledged address ${byteInfo.hex}`,
                  this.parserState.currentTransaction, time);
              } else {
                this.addError(ERROR_TYPES.NACK_RECEIVED,
                  `NACK received at byte ${this.parserState.currentTransaction.bytes.length} (value: ${byteInfo.hex})`,
                  this.parserState.currentTransaction, time);
              }
            }

            this.parserState.currentTransaction.bytes.push(byteInfo);
            this.parserState.bitIndex = 0;
            this.parserState.currentByte = 0;
            this.parserState.consecutiveSameBits = 0;
          }
        }
      }
    }

    this.parserState.lastLine = line;
    return signal;
  }

  finalize() {
    if (this.parserState.inTransaction && this.parserState.currentTransaction) {
      this.parserState.currentTransaction.endTime = this.metadata.endTime;
      this.addError(ERROR_TYPES.INCOMPLETE_TRANSACTION,
        `Transaction at ${this.parserState.currentTransaction.startTime.toFixed(6)}s ended without STOP condition`,
        this.parserState.currentTransaction);
      this.transactions.push(this.parserState.currentTransaction);
      this.metadata.totalTransactions++;
      this.parserState.inTransaction = false;
      this.parserState.currentTransaction = null;
    }

    return this.getFullResult();
  }

  getFullResult() {
    return {
      header: this.header,
      transactions: this.transactions,
      signals: this.signals,
      errors: this.errors,
      metadata: this.metadata
    };
  }
}

function parseSaleaeCSV(csvContent) {
  const parser = new I3CParser();
  parser.parseChunk(csvContent, true);
  return parser.finalize();
}

function parseI3CTransactions(csvContent) {
  const result = parseSaleaeCSV(csvContent);
  const transactions = [];

  for (const trans of result.transactions) {
    if (trans.bytes.length === 0) continue;

    const firstByte = trans.bytes[0];
    const parsedTrans = {
      id: trans.id,
      startTime: trans.startTime,
      endTime: trans.endTime,
      type: trans.type,
      isRepeatedStart: trans.isRepeatedStart,
      address: firstByte.address,
      addressHex: `0x${firstByte.address.toString(16).toUpperCase().padStart(2, '0')}`,
      direction: firstByte.rw,
      bytes: trans.bytes,
      errors: trans.errors,
      decodedData: []
    };

    if (trans.type === 'BROADCAST') {
      parsedTrans.description = 'Broadcast Address (0x7E)';
    } else if (trans.type === 'CCC') {
      parsedTrans.description = 'Common Command Code (CCC)';
      if (trans.bytes.length > 1) {
        const cccByte = trans.bytes[1];
        parsedTrans.cccCode = cccByte.value;
        parsedTrans.cccName = cccByte.cccName;
        parsedTrans.cccDescription = cccByte.cccDescription;
        parsedTrans.cccData = trans.bytes.slice(2).map(b => b.hex);
      }
    } else {
      const dataBytes = trans.bytes.slice(1);
      parsedTrans.dataBytes = dataBytes;
      parsedTrans.dataHex = dataBytes.map(b => b.hex).join(' ');

      if (dataBytes.length > 0) {
        parsedTrans.description = `${firstByte.rw} ${dataBytes.length} byte(s) to/from ${parsedTrans.addressHex}`;
      } else {
        parsedTrans.description = `${firstByte.rw} to/from ${parsedTrans.addressHex}`;
      }
    }

    transactions.push(parsedTrans);
  }

  return {
    transactions,
    signals: result.signals,
    errors: result.errors,
    metadata: result.metadata,
    header: result.header
  };
}

function buildPCAPNG(parsedData, fileName) {
  const sections = [];
  const options = [];

  const shb = createSectionHeaderBlock();
  sections.push(shb);

  const idb = createInterfaceDescriptionBlock(276, 'I3C', 'I3C Bus Analyzer');
  sections.push(idb);

  for (const trans of parsedData.transactions) {
    const epb = createEnhancedPacketBlock(0, trans, parsedData.signals);
    sections.push(epb);
  }

  const buffer = Buffer.concat(sections);
  
  return {
    buffer,
    length: buffer.length,
    packetCount: parsedData.transactions.length
  };
}

function createSectionHeaderBlock() {
  const blockType = Buffer.from([0x0a, 0x0d, 0x0d, 0x0a]);
  const blockTotalLength = Buffer.alloc(4);
  const byteOrderMagic = Buffer.from([0x4d, 0x3c, 0x2b, 0x1a]);
  const versionMajor = Buffer.from([0x01, 0x00]);
  const versionMinor = Buffer.from([0x00, 0x00]);
  const sectionLength = Buffer.from([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);

  const hwOptions = createOptionString(2, 'Electron');
  const osOptions = createOptionString(3, 'I3C Bus Analyzer');
  const userApplOptions = createOptionString(4, 'I3C Analyzer v1.0');
  const endOfOptions = Buffer.from([0x00, 0x00, 0x00, 0x00]);

  const body = Buffer.concat([
    byteOrderMagic,
    versionMajor,
    versionMinor,
    sectionLength,
    hwOptions,
    osOptions,
    userApplOptions,
    endOfOptions
  ]);

  const totalLength = 12 + body.length + 4;
  blockTotalLength.writeUInt32LE(totalLength);

  const blockTrailerLength = Buffer.alloc(4);
  blockTrailerLength.writeUInt32LE(totalLength);

  return Buffer.concat([
    blockType,
    blockTotalLength,
    body,
    blockTrailerLength
  ]);
}

function createInterfaceDescriptionBlock(linkType, name, description) {
  const blockType = Buffer.from([0x01, 0x00, 0x00, 0x00]);
  const blockTotalLength = Buffer.alloc(4);
  const linkTypeBuffer = Buffer.alloc(2);
  linkTypeBuffer.writeUInt16LE(linkType);
  const reserved = Buffer.from([0x00, 0x00]);
  const snapLen = Buffer.from([0xff, 0xff, 0x00, 0x00]);

  const ifNameOptions = createOptionString(2, name);
  const ifDescOptions = createOptionString(3, description);
  const endOfOptions = Buffer.from([0x00, 0x00, 0x00, 0x00]);

  const body = Buffer.concat([
    linkTypeBuffer,
    reserved,
    snapLen,
    ifNameOptions,
    ifDescOptions,
    endOfOptions
  ]);

  const totalLength = 12 + body.length + 4;
  blockTotalLength.writeUInt32LE(totalLength);

  const blockTrailerLength = Buffer.alloc(4);
  blockTrailerLength.writeUInt32LE(totalLength);

  return Buffer.concat([
    blockType,
    blockTotalLength,
    body,
    blockTrailerLength
  ]);
}

function createEnhancedPacketBlock(interfaceId, transaction, signals) {
  const blockType = Buffer.from([0x06, 0x00, 0x00, 0x00]);
  const blockTotalLength = Buffer.alloc(4);
  const interfaceIdBuffer = Buffer.alloc(4);
  interfaceIdBuffer.writeUInt32LE(interfaceId);

  const timestamp = Math.floor(transaction.startTime * 1000000);
  const timestampHigh = Buffer.alloc(4);
  const timestampLow = Buffer.alloc(4);
  timestampHigh.writeUInt32LE((timestamp >> 32) & 0xFFFFFFFF);
  timestampLow.writeUInt32LE(timestamp & 0xFFFFFFFF);

  const packetData = encodeTransactionToPacket(transaction);
  
  const capturedLength = Buffer.alloc(4);
  const originalLength = Buffer.alloc(4);
  capturedLength.writeUInt32LE(packetData.length);
  originalLength.writeUInt32LE(packetData.length);

  const paddedPacketData = padTo4Bytes(packetData);

  const packetFlags = createOptionUint32(2, transaction.errors && transaction.errors.length > 0 ? 1 : 0);
  const transactionType = createOptionUint32(3, transaction.type === 'CCC' ? 1 : transaction.type === 'BROADCAST' ? 2 : 0);
  const endOfOptions = Buffer.from([0x00, 0x00, 0x00, 0x00]);

  const body = Buffer.concat([
    interfaceIdBuffer,
    timestampHigh,
    timestampLow,
    capturedLength,
    originalLength,
    paddedPacketData,
    packetFlags,
    transactionType,
    endOfOptions
  ]);

  const totalLength = 12 + body.length + 4;
  blockTotalLength.writeUInt32LE(totalLength);

  const blockTrailerLength = Buffer.alloc(4);
  blockTrailerLength.writeUInt32LE(totalLength);

  return Buffer.concat([
    blockType,
    blockTotalLength,
    body,
    blockTrailerLength
  ]);
}

function encodeTransactionToPacket(transaction) {
  const parts = [];

  parts.push(Buffer.from([
    transaction.type === 'START' ? 0x01 : transaction.type === 'TRANSFER' ? 0x02 : 
    transaction.type === 'CCC' ? 0x03 : transaction.type === 'BROADCAST' ? 0x04 : 0x00
  ]));

  const addressByte = transaction.bytes[0] || { value: 0 };
  parts.push(Buffer.from([addressByte.value]));

  const directionByte = transaction.direction === 'READ' ? 0x01 : 0x00;
  parts.push(Buffer.from([directionByte]));

  const dataCount = Math.max(0, transaction.bytes.length - 1);
  const countBuffer = Buffer.alloc(2);
  countBuffer.writeUInt16LE(dataCount);
  parts.push(countBuffer);

  for (let i = 1; i < transaction.bytes.length; i++) {
    const byte = transaction.bytes[i];
    parts.push(Buffer.from([byte.value]));
    parts.push(Buffer.from([byte.ack === 'ACK' ? 0x01 : 0x00]));
  }

  const startTime = Buffer.alloc(4);
  startTime.writeUInt32LE(Math.floor(transaction.startTime * 1000000));
  parts.push(startTime);

  const endTime = Buffer.alloc(4);
  endTime.writeUInt32LE(Math.floor(transaction.endTime * 1000000));
  parts.push(endTime);

  return Buffer.concat(parts);
}

function createOptionString(code, str) {
  const codeBuffer = Buffer.alloc(2);
  codeBuffer.writeUInt16LE(code);
  
  const strBuffer = Buffer.from(str, 'utf-8');
  const paddedStr = padTo4Bytes(strBuffer);
  
  const lengthBuffer = Buffer.alloc(2);
  lengthBuffer.writeUInt16LE(paddedStr.length);
  
  return Buffer.concat([codeBuffer, lengthBuffer, paddedStr]);
}

function createOptionUint32(code, value) {
  const codeBuffer = Buffer.alloc(2);
  codeBuffer.writeUInt16LE(code);
  
  const valueBuffer = Buffer.alloc(4);
  valueBuffer.writeUInt32LE(value);
  
  const lengthBuffer = Buffer.alloc(2);
  lengthBuffer.writeUInt16LE(4);
  
  return Buffer.concat([codeBuffer, lengthBuffer, valueBuffer]);
}

function padTo4Bytes(buffer) {
  const paddingLength = (4 - (buffer.length % 4)) % 4;
  if (paddingLength === 0) return buffer;
  return Buffer.concat([buffer, Buffer.alloc(paddingLength)]);
}

module.exports = {
  I3CParser,
  parseSaleaeCSV,
  parseI3CTransactions,
  getCCCName,
  getCCCDescription,
  getCCCInfo,
  buildPCAPNG,
  ERROR_TYPES,
  I3C_CCC_CODES,
  I3C_CCC_DESCRIPTIONS
};
