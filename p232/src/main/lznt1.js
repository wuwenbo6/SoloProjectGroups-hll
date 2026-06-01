const COMPRESSION_MASK = 0x80;
const SYMBOL_FLAG = 0x00;
const TUPLE_FLAG = 0x01;
const TUPLE_MAX_LENGTH = 0xFFFF;
const MAX_OFFSET_BITS = 12;
const TUPLE_HEADER_SIZE = 3;
const MIN_COMPRESSION_RATIO = 0.9;

class LZNT1 {
  static decompress(compressed, uncompressedSize) {
    const result = Buffer.alloc(uncompressedSize);
    let srcIndex = 0;
    let dstIndex = 0;
    const srcEnd = compressed.length;

    while (srcIndex < srcEnd && dstIndex < uncompressedSize) {
      if (srcIndex + 1 > srcEnd) break;

      const flagsByte = compressed.readUInt8(srcIndex);
      srcIndex++;

      for (let flagBit = 0; flagBit < 8 && srcIndex < srcEnd && dstIndex < uncompressedSize; flagBit++) {
        if (srcIndex >= srcEnd || dstIndex >= uncompressedSize) break;

        const flag = (flagsByte >> flagBit) & 0x01;

        if (flag === SYMBOL_FLAG) {
          result[dstIndex] = compressed.readUInt8(srcIndex);
          srcIndex++;
          dstIndex++;
        } else {
          if (srcIndex + 2 > srcEnd) break;

          const tupleBytes = compressed.readUInt16LE(srcIndex);
          srcIndex += 2;

          const offsetMask = 0x0FFF;
          const lengthMask = 0xF000;
          const lengthShift = 12;

          let offset = (tupleBytes & offsetMask) + 1;
          let length = ((tupleBytes & lengthMask) >> lengthShift) + 3;

          const bytesRemaining = uncompressedSize - dstIndex;
          if (length > bytesRemaining) {
            length = bytesRemaining;
          }

          if (offset > dstIndex) {
            let validLength = 0;
            for (let i = 0; i < length; i++) {
              if (i < dstIndex) validLength++;
              else break;
            }
            length = validLength;
          }

          for (let i = 0; i < length; i++) {
            if (dstIndex >= uncompressedSize) break;
            const srcPos = dstIndex - offset + (i % offset);
            result[dstIndex] = result[srcPos];
            dstIndex++;
          }
        }
      }
    }

    if (dstIndex < uncompressedSize) {
      return result.slice(0, dstIndex);
    }

    return result;
  }

  static decompressChunk(compressedBuffer, outputSize) {
    if (!Buffer.isBuffer(compressedBuffer) || compressedBuffer.length < 2) {
      return compressedBuffer;
    }

    const signature = compressedBuffer.readUInt16LE(0);
    if ((signature & 0x8000) === 0) {
      return compressedBuffer.slice(0, Math.min(outputSize, compressedBuffer.length));
    }

    const compressedSize = (signature & 0x0FFF) + 3;

    if (compressedSize > compressedBuffer.length) {
      return compressedBuffer.slice(0, Math.min(outputSize, compressedBuffer.length));
    }

    const actualCompressed = compressedBuffer.slice(2, compressedSize);

    try {
      return LZNT1.decompress(actualCompressed, outputSize);
    } catch (_e) {
      return compressedBuffer.slice(0, Math.min(outputSize, compressedBuffer.length));
    }
  }

  static detectCompression(attributeData, compressionUnit) {
    if (compressionUnit <= 0) {
      return { isCompressed: false, compressionFormat: 0 };
    }
    return {
      isCompressed: true,
      compressionFormat: 'LZNT1',
      compressionUnit,
    };
  }

  static decompressAllClusters(clusterData, clusterSize, compressionUnit, expectedSize) {
    if (!clusterData || clusterData.length === 0) {
      return Buffer.alloc(0);
    }

    if (compressionUnit === 0 || compressionUnit < clusterSize) {
      return clusterData.slice(0, expectedSize);
    }

    const chunksPerUnit = compressionUnit / clusterSize;
    const resultChunks = [];
    let processedSize = 0;

    for (let unitStart = 0; unitStart < clusterData.length; unitStart += compressionUnit) {
      if (processedSize >= expectedSize) break;

      const unitEnd = Math.min(unitStart + compressionUnit, clusterData.length);
      const unitData = clusterData.slice(unitStart, unitEnd);

      const isAllZero = unitData.every((b) => b === 0);
      if (isAllZero) {
        resultChunks.push(Buffer.alloc(compressionUnit, 0));
        processedSize += compressionUnit;
        continue;
      }

      try {
        const decompressed = LZNT1.decompressChunk(unitData, compressionUnit);
        resultChunks.push(decompressed);
        processedSize += decompressed.length;
      } catch (_e) {
        resultChunks.push(unitData);
        processedSize += unitData.length;
      }
    }

    const result = Buffer.concat(resultChunks);
    return result.slice(0, expectedSize);
  }
}

module.exports = { LZNT1 };
