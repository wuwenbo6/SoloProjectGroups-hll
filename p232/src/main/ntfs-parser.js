const fs = require('fs');
const path = require('path');
const { LZNT1 } = require('./lznt1');

const FILE_RECORD_HEADER_SIZE = 48;
const ATTRIBUTE_HEADER_SIZE = 24;
const MFT_ENTRY_SIZE = 1024;
const INDEX_ENTRY_SIZE = 16;

const ATTRIBUTE_FLAGS = {
  COMPRESSED: 0x0001,
  ENCRYPTED: 0x4000,
  SPARSE: 0x8000,
};

const ATTRIBUTE_TYPES = {
  0x00000000: '$STANDARD_INFORMATION',
  0x00000010: '$ATTRIBUTE_LIST',
  0x00000020: '$FILE_NAME',
  0x00000030: '$OBJECT_ID',
  0x00000040: '$SECURITY_DESCRIPTOR',
  0x00000050: '$VOLUME_NAME',
  0x00000060: '$VOLUME_INFORMATION',
  0x00000070: '$DATA',
  0x00000080: '$INDEX_ROOT',
  0x00000090: '$INDEX_ALLOCATION',
  0x000000A0: '$BITMAP',
  0x000000C0: '$REPARSE_POINT',
  0x000000D0: '$EA_INFORMATION',
  0x000000E0: '$EA',
  0x00000100: '$LOGGED_UTILITY_STREAM',
};

const FILE_FLAGS = {
  READ_ONLY: 0x0001,
  HIDDEN: 0x0002,
  SYSTEM: 0x0004,
  ARCHIVE: 0x0020,
  DEVICE: 0x0040,
  NORMAL: 0x0080,
  TEMPORARY: 0x0100,
  SPARSE_FILE: 0x0200,
  REPARSE_POINT: 0x0400,
  COMPRESSED: 0x0800,
  OFFLINE: 0x1000,
  NOT_CONTENT_INDEXED: 0x2000,
  ENCRYPTED: 0x4000,
  DIRECTORY: 0x10000000,
  INDEX_VIEW: 0x20000000,
  IN_USE: 0x0001,
  IS_DIRECTORY: 0x0002,
};

class NTFSParser {
  constructor(filePath) {
    this.filePath = filePath;
    this.fd = fs.openSync(filePath, 'r');
    this.stat = fs.fstatSync(this.fd);
    this.bootSector = null;
    this.mftOffset = 0;
    this.mftRecordSize = 1024;
    this.clusterSize = 0;
    this.sectorsPerCluster = 0;
    this.bytesPerSector = 0;
    this.totalSectors = 0;
    this.mftStartCluster = 0;
    this.mftMirrStartCluster = 0;
  }

  close() {
    if (this.fd) {
      fs.closeSync(this.fd);
      this.fd = null;
    }
  }

  readBuffer(offset, size) {
    const buf = Buffer.alloc(size);
    fs.readSync(this.fd, buf, 0, size, offset);
    return buf;
  }

  parseBootSector() {
    const bs = this.readBuffer(0, 512);

    const oemName = bs.toString('ascii', 3, 11).trim();
    if (oemName !== 'NTFS    ') {
      throw new Error(`Not an NTFS volume. OEM: "${oemName}"`);
    }

    this.bytesPerSector = bs.readUInt16LE(11);
    this.sectorsPerCluster = bs.readUInt8(13);
    this.clusterSize = this.bytesPerSector * this.sectorsPerCluster;
    this.totalSectors = bs.readUInt16LE(40) || bs.readUInt32LE(40) || Number(bs.readBigUInt64LE(40));
    this.mftStartCluster = Number(bs.readBigUInt64LE(48));
    this.mftMirrStartCluster = Number(bs.readBigUInt64LE(56));

    const mftRecordSizeClustersOrSectors = bs.readInt8(64);
    if (mftRecordSizeClustersOrSectors > 0) {
      this.mftRecordSize = this.clusterSize * mftRecordSizeClustersOrSectors;
    } else {
      this.mftRecordSize = Math.pow(2, Math.abs(mftRecordSizeClustersOrSectors));
    }

    const indexRecordSizeClustersOrSectors = bs.readInt8(68);
    if (indexRecordSizeClustersOrSectors > 0) {
      this.indexRecordSize = this.clusterSize * indexRecordSizeClustersOrSectors;
    } else {
      this.indexRecordSize = Math.pow(2, Math.abs(indexRecordSizeClustersOrSectors));
    }

    this.mftOffset = this.mftStartCluster * this.clusterSize;

    this.bootSector = {
      oemName,
      bytesPerSector: this.bytesPerSector,
      sectorsPerCluster: this.sectorsPerCluster,
      clusterSize: this.clusterSize,
      totalSectors: this.totalSectors,
      volumeSize: this.totalSectors * this.bytesPerSector,
      mftStartCluster: this.mftStartCluster,
      mftMirrStartCluster: this.mftMirrStartCluster,
      mftRecordSize: this.mftRecordSize,
      mftOffset: this.mftOffset,
      indexRecordSize: this.indexRecordSize,
    };

    return this.bootSector;
  }

  parseMFTEntry(buffer) {
    const signature = buffer.toString('ascii', 0, 4);
    if (signature !== 'FILE') {
      return null;
    }

    const fixupOffset = buffer.readUInt16LE(4);
    const fixupCount = buffer.readUInt16LE(6);
    const logSequence = buffer.readBigUInt64LE(8);
    const sequenceNumber = buffer.readUInt16LE(16);
    const hardLinkCount = buffer.readUInt16LE(18);
    const firstAttributeOffset = buffer.readUInt16LE(20);
    const flags = buffer.readUInt16LE(22);
    const usedSize = buffer.readUInt32LE(24);
    const allocatedSize = buffer.readUInt32LE(28);

    const fixupValue = buffer.readUInt16LE(fixupOffset);
    const sectorSize = this.bytesPerSector;
    const sectorsInRecord = this.mftRecordSize / sectorSize;
    for (let i = 1; i < fixupCount; i++) {
      const fixupData = buffer.readUInt16LE(fixupOffset + i * 2);
      const sectorEndOffset = i * sectorSize - 2;
      const originalValue = buffer.readUInt16LE(sectorEndOffset);
      if (originalValue !== fixupValue) {
        return null;
      }
      buffer.writeUInt16LE(fixupData, sectorEndOffset);
    }

    const attributes = [];
    let offset = firstAttributeOffset;
    while (offset < usedSize - ATTRIBUTE_HEADER_SIZE) {
      const attrType = buffer.readUInt32LE(offset);
      if (attrType === 0xFFFFFFFF || attrType === 0) break;

      const attrLen = buffer.readUInt32LE(offset + 4);
      if (attrLen === 0 || attrLen + offset > this.mftRecordSize) break;

      const nonResident = buffer.readUInt8(offset + 8);
      const attrNameOffset = buffer.readUInt16LE(offset + 10);
      const attr = this.parseAttribute(buffer, offset, attrType, attrLen, nonResident, attrNameOffset);
      if (attr) attributes.push(attr);

      offset += attrLen;
    }

    const isInUse = (flags & FILE_FLAGS.IN_USE) !== 0;
    const isDirectory = (flags & FILE_FLAGS.IS_DIRECTORY) !== 0;

    let fileName = '';
    let parentRef = 5;
    let fileSize = 0;
    let createTime = 0;
    let modifyTime = 0;

    for (const attr of attributes) {
      if (attr.type === '$FILE_NAME' && attr.resident) {
        fileName = attr.data.fileName;
        parentRef = attr.data.parentDirectoryRef;
        createTime = attr.data.createTime;
        modifyTime = attr.data.modifyTime;
        fileSize = attr.data.fileSize;
      }
    }

    let dataAttribute = null;
    let isCompressed = false;
    let isEncrypted = false;
    for (const attr of attributes) {
      if (attr.type === '$DATA') {
        dataAttribute = attr;
        if (attr.isCompressed) isCompressed = true;
        if (attr.isEncrypted) isEncrypted = true;
        break;
      }
    }

    return {
      signature,
      sequenceNumber,
      hardLinkCount,
      flags,
      isInUse,
      isDirectory,
      usedSize,
      allocatedSize,
      fileName,
      parentRef,
      parentEntryIndex: parentRef & 0x0000FFFFFFFFFFFF,
      fileSize,
      createTime,
      modifyTime,
      attributes,
      dataAttribute,
      isCompressed,
      isEncrypted,
    };
  }

  parseAttribute(buffer, offset, attrType, attrLen, nonResident, nameOffset) {
    const typeName = ATTRIBUTE_TYPES[attrType] || `0x${attrType.toString(16).toUpperCase()}`;
    const attrName = nameOffset > 0
      ? buffer.toString('utf16le', offset + nameOffset, offset + nameOffset + buffer.readUInt8(offset + 9) * 2)
      : '';
    const attrFlags = buffer.readUInt16LE(offset + 12);

    const result = {
      type: typeName,
      typeId: attrType,
      nonResident: nonResident !== 0,
      name: attrName,
      data: null,
      resident: nonResident === 0,
      flags: attrFlags,
      isCompressed: (attrFlags & ATTRIBUTE_FLAGS.COMPRESSED) !== 0,
      isEncrypted: (attrFlags & ATTRIBUTE_FLAGS.ENCRYPTED) !== 0,
      isSparse: (attrFlags & ATTRIBUTE_FLAGS.SPARSE) !== 0,
    };

    if (nonResident === 0) {
      const dataOffset = buffer.readUInt16LE(offset + 20);
      const dataLength = buffer.readUInt32LE(offset + 16);
      const attrData = buffer.subarray(offset + dataOffset, offset + dataOffset + dataLength);

      result.data = this.parseResidentAttribute(attrType, attrData);
    } else {
      const startVCN = Number(buffer.readBigUInt64LE(offset + 16));
      const lastVCN = Number(buffer.readBigUInt64LE(offset + 24));
      const dataRunsOffset = buffer.readUInt16LE(offset + 32);
      const compressionUnit = buffer.readUInt16LE(offset + 34);
      const allocSize = Number(buffer.readBigUInt64LE(offset + 40));
      const realSize = Number(buffer.readBigUInt64LE(offset + 48));
      const initializedSize = Number(buffer.readBigUInt64LE(offset + 56));

      const dataRuns = this.parseDataRuns(buffer, offset + dataRunsOffset);

      result.data = {
        startVCN,
        lastVCN,
        dataRuns,
        compressionUnit,
        allocSize,
        realSize,
        initializedSize,
      };
    }

    return result;
  }

  parseResidentAttribute(attrType, data) {
    switch (attrType) {
      case 0x00000010:
        return this.parseStandardInformation(data);
      case 0x00000020:
        return this.parseFileName(data);
      case 0x00000030:
        return this.parseObjectID(data);
      case 0x00000050:
        return { volumeName: data.toString('utf16le') };
      case 0x00000060:
        return this.parseVolumeInformation(data);
      case 0x00000070:
        return this.parseDataAttribute(data);
      case 0x00000080:
        return this.parseIndexRoot(data);
      default:
        return { raw: data.toString('hex') };
    }
  }

  parseStandardInformation(data) {
    if (data.length < 48) return { raw: data.toString('hex') };
    return {
      createTime: this.filetimeToUnix(Number(data.readBigUInt64LE(0))),
      modifyTime: this.filetimeToUnix(Number(data.readBigUInt64LE(8))),
      mftChangeTime: this.filetimeToUnix(Number(data.readBigUInt64LE(16))),
      accessTime: this.filetimeToUnix(Number(data.readBigUInt64LE(24))),
      fileAttributes: data.readUInt32LE(32),
    };
  }

  parseFileName(data) {
    if (data.length < 66) return { raw: data.toString('hex') };
    const parentDirRef = data.readBigUInt64LE(0);
    const createTime = this.filetimeToUnix(Number(data.readBigUInt64LE(8)));
    const modifyTime = this.filetimeToUnix(Number(data.readBigUInt64LE(16)));
    const mftChangeTime = this.filetimeToUnix(Number(data.readBigUInt64LE(24)));
    const accessTime = this.filetimeToUnix(Number(data.readBigUInt64LE(32)));
    const allocSize = Number(data.readBigUInt64LE(40));
    const fileSize = Number(data.readBigUInt64LE(48));
    const flags = data.readUInt32LE(56);
    const reparse = data.readUInt32LE(60);
    const nameLength = data.readUInt8(64);
    const nameSpace = data.readUInt8(65);
    const fileName = data.toString('utf16le', 66, 66 + nameLength * 2);

    return {
      parentDirectoryRef: Number(parentDirRef),
      parentEntryIndex: Number(parentDirRef & BigInt(0x0000FFFFFFFFFFFF)),
      createTime,
      modifyTime,
      mftChangeTime,
      accessTime,
      allocSize,
      fileSize,
      flags,
      reparse,
      nameLength,
      nameSpace,
      fileName,
    };
  }

  parseObjectID(data) {
    if (data.length < 16) return { raw: data.toString('hex') };
    return {
      objectId: data.subarray(0, 16).toString('hex'),
    };
  }

  parseVolumeInformation(data) {
    if (data.length < 12) return { raw: data.toString('hex') };
    return {
      majorVersion: data.readUInt8(8),
      minorVersion: data.readUInt8(9),
      flags: data.readUInt16LE(10),
    };
  }

  parseDataAttribute(data) {
    const previewLength = Math.min(data.length, 512);
    return {
      size: data.length,
      buffer: Buffer.from(data),
      preview: data.subarray(0, previewLength).toString('hex'),
      isResident: true,
    };
  }

  parseIndexRoot(data) {
    return {
      attributeType: data.readUInt32LE(0),
      collationRule: data.readUInt32LE(4),
      indexAllocSize: data.readUInt32LE(8),
      clustersPerIndexRecord: data.readUInt8(12),
      raw: data.toString('hex'),
    };
  }

  parseDataRuns(buffer, offset) {
    const runs = [];
    let currentOffset = offset;
    let previousLCN = 0;

    while (currentOffset < buffer.length) {
      const headerByte = buffer.readUInt8(currentOffset);
      if (headerByte === 0) break;

      const lengthFieldSize = headerByte & 0x0F;
      const offsetFieldSize = (headerByte >> 4) & 0x0F;

      if (lengthFieldSize === 0 || offsetFieldSize === 0) break;
      if (currentOffset + 1 + lengthFieldSize + offsetFieldSize > buffer.length) break;

      currentOffset += 1;

      let runLength = 0;
      for (let i = 0; i < lengthFieldSize; i++) {
        runLength |= buffer.readUInt8(currentOffset + i) << (i * 8);
      }
      currentOffset += lengthFieldSize;

      let runOffset = 0;
      for (let i = 0; i < offsetFieldSize - 1; i++) {
        runOffset |= buffer.readUInt8(currentOffset + i) << (i * 8);
      }
      const lastByte = buffer.readUInt8(currentOffset + offsetFieldSize - 1);
      runOffset |= lastByte << ((offsetFieldSize - 1) * 8);
      if (lastByte & 0x80) {
        runOffset -= (1 << (offsetFieldSize * 8));
      }
      currentOffset += offsetFieldSize;

      const isSparse = runOffset < 0;
      const absoluteLCN = previousLCN + runOffset;
      if (!isSparse) previousLCN = absoluteLCN;

      runs.push({
        length: runLength,
        offset: absoluteLCN,
        isSparse,
      });
    }

    return runs;
  }

  async parseMFT(options = {}, progressCallback = null) {
    if (!this.bootSector) this.parseBootSector();

    const totalEntries = Math.floor((this.stat.size - this.mftOffset) / this.mftRecordSize);
    const maxEntries = options.maxEntries || totalEntries;
    const entriesToParse = Math.min(totalEntries, maxEntries);

    const entries = [];
    const batchSize = 1000;

    for (let i = 0; i < entriesToParse; i++) {
      try {
        const offset = this.mftOffset + i * this.mftRecordSize;
        const buf = this.readBuffer(offset, this.mftRecordSize);
        const entry = this.parseMFTEntry(buf);
        if (entry) {
          entry.entryIndex = i;
          entries.push(entry);
        }
      } catch (_e) {
        // skip corrupted entries
      }

      if (progressCallback && i % batchSize === 0) {
        progressCallback({
          current: i,
          total: entriesToParse,
          percent: Math.round((i / entriesToParse) * 100),
        });
        await new Promise((r) => setImmediate(r));
      }
    }

    if (progressCallback) {
      progressCallback({ current: entriesToParse, total: entriesToParse, percent: 100 });
    }

    return entries;
  }

  buildFileTree(entries) {
    const tree = { name: 'Root', children: [], entryIndex: 5, isDirectory: true };
    const nodeMap = new Map();

    const rootEntry = entries.find((e) => e.entryIndex === 5);
    if (rootEntry) {
      tree.name = rootEntry.fileName || 'Root';
    }
    nodeMap.set(5, tree);

    for (const entry of entries) {
      if (entry.entryIndex === 5) continue;
      const parentIdx = entry.parentEntryIndex;

      if (!nodeMap.has(entry.entryIndex)) {
        const node = {
          name: entry.fileName || `Entry_${entry.entryIndex}`,
          entryIndex: entry.entryIndex,
          isDirectory: entry.isDirectory,
          isInUse: entry.isInUse,
          fileSize: entry.fileSize,
          createTime: entry.createTime,
          modifyTime: entry.modifyTime,
          children: entry.isDirectory ? [] : undefined,
          entry,
        };
        nodeMap.set(entry.entryIndex, node);

        const parent = nodeMap.get(parentIdx);
        if (parent && parent.children) {
          parent.children.push(node);
        } else {
          tree.children.push(node);
        }
      }
    }

    return tree;
  }

  readFileData(entry) {
    if (!entry.dataAttribute || !entry.dataAttribute.data) {
      return Buffer.alloc(0);
    }

    const attr = entry.dataAttribute;
    const expectedSize = entry.fileSize || attr.data?.realSize || attr.data?.initializedSize || 0;

    if (attr.resident) {
      if (attr.data.buffer) {
        return Buffer.from(attr.data.buffer);
      }
      if (attr.data.raw) {
        return Buffer.from(attr.data.raw, 'hex');
      }
      return Buffer.alloc(0);
    }

    if (attr.data.dataRuns) {
      const chunks = [];
      for (const run of attr.data.dataRuns) {
        if (run.isSparse) {
          chunks.push(Buffer.alloc(run.length * this.clusterSize, 0));
        } else {
          const runOffset = run.offset * this.clusterSize;
          const runSize = run.length * this.clusterSize;
          if (runOffset >= 0 && runOffset + runSize <= this.stat.size) {
            chunks.push(this.readBuffer(runOffset, runSize));
          }
        }
      }

      let result = Buffer.concat(chunks);

      if (attr.isCompressed && attr.data.compressionUnit > 0 && expectedSize > 0) {
        try {
          result = LZNT1.decompressAllClusters(
            result,
            this.clusterSize,
            attr.data.compressionUnit,
            expectedSize
          );
        } catch (_e) {
          // 如果解压失败，返回原始数据
        }
      }

      if (expectedSize > 0 && result.length > expectedSize) {
        result = result.slice(0, expectedSize);
      }

      return result;
    }

    return Buffer.alloc(0);
  }

  filetimeToUnix(filetime) {
    if (filetime === 0) return 0;
    const EPOCH_DIFF = 116444736000000000n;
    const ft = BigInt(filetime);
    const unixMicro = ft - EPOCH_DIFF;
    return Number(unixMicro / 10000n);
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + units[i];
  }
}

module.exports = { NTFSParser };
