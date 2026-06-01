const SIGNATURES = [
  { name: 'JPEG', extension: '.jpg', magic: [0xFF, 0xD8, 0xFF], footer: [0xFF, 0xD9], category: 'image', validate: 'jpeg' },
  { name: 'PNG', extension: '.png', magic: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], footer: [0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82], category: 'image', validate: 'png' },
  { name: 'GIF87a', extension: '.gif', magic: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], footer: [0x00, 0x3B], category: 'image', validate: 'gif' },
  { name: 'GIF89a', extension: '.gif', magic: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], footer: [0x00, 0x3B], category: 'image', validate: 'gif' },
  { name: 'BMP', extension: '.bmp', magic: [0x42, 0x4D], footer: null, category: 'image', validate: 'bmp' },
  { name: 'WebP', extension: '.webp', magic: [0x52, 0x49, 0x46, 0x46], footer: null, category: 'image', validate: 'webp' },
  { name: 'PDF', extension: '.pdf', magic: [0x25, 0x50, 0x44, 0x46], footer: [0x25, 0x25, 0x45, 0x4F, 0x46], category: 'document', validate: 'pdf' },
  { name: 'ZIP', extension: '.zip', magic: [0x50, 0x4B, 0x03, 0x04], footer: [0x50, 0x4B, 0x05, 0x06], category: 'archive', validate: 'zip' },
  { name: 'RAR', extension: '.rar', magic: [0x52, 0x61, 0x72, 0x21, 0x1A, 0x07, 0x00], footer: null, category: 'archive', validate: 'rar' },
  { name: 'RAR5', extension: '.rar', magic: [0x52, 0x61, 0x72, 0x21, 0x1A, 0x07, 0x01, 0x00], footer: null, category: 'archive', validate: 'rar5' },
  { name: '7-Zip', extension: '.7z', magic: [0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C], footer: null, category: 'archive', validate: '7z' },
  { name: 'GZIP', extension: '.gz', magic: [0x1F, 0x8B], footer: null, category: 'archive', validate: 'gzip' },
  { name: 'BZ2', extension: '.bz2', magic: [0x42, 0x5A, 0x68], footer: null, category: 'archive', validate: 'bz2' },
  { name: 'DOC/XLS', extension: '.doc', magic: [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1], footer: null, category: 'document', validate: 'ole2' },
  { name: 'DOCX', extension: '.docx', magic: [0x50, 0x4B, 0x03, 0x04], footer: null, category: 'document', validate: 'ooxml' },
  { name: 'MP4', extension: '.mp4', magic: null, atomType: 'ftyp', category: 'video', validate: 'mp4' },
  { name: 'AVI', extension: '.avi', magic: [0x52, 0x49, 0x46, 0x46], footer: null, category: 'video', validate: 'avi' },
  { name: 'MKV', extension: '.mkv', magic: [0x1A, 0x45, 0xDF, 0xA3], footer: null, category: 'video', validate: 'ebml' },
  { name: 'MP3', extension: '.mp3', magic: [0xFF, 0xFB], footer: null, category: 'audio', altMagics: [[0x49, 0x44, 0x33]], validate: 'mp3' },
  { name: 'WAV', extension: '.wav', magic: [0x52, 0x49, 0x46, 0x46], footer: null, category: 'audio', validate: 'wav' },
  { name: 'FLAC', extension: '.flac', magic: [0x66, 0x4C, 0x61, 0x43], footer: null, category: 'audio', validate: 'flac' },
  { name: 'EXE', extension: '.exe', magic: [0x4D, 0x5A], footer: null, category: 'executable', validate: 'pe' },
  { name: 'DLL', extension: '.dll', magic: [0x4D, 0x5A], footer: null, category: 'executable', validate: 'pe' },
  { name: 'ELF', extension: '', magic: [0x7F, 0x45, 0x4C, 0x46], footer: null, category: 'executable', validate: 'elf' },
  { name: 'XML', extension: '.xml', magic: [0x3C, 0x3F, 0x78, 0x6D, 0x6C], footer: null, category: 'text', validate: 'xml' },
  { name: 'SQLite', extension: '.db', magic: [0x53, 0x51, 0x4C, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6F, 0x72, 0x6D, 0x61, 0x74, 0x20, 0x33, 0x00], footer: null, category: 'database', validate: 'sqlite' },
  { name: 'TIFF-LE', extension: '.tif', magic: [0x49, 0x49, 0x2A, 0x00], footer: null, category: 'image', validate: 'tiff' },
  { name: 'TIFF-BE', extension: '.tif', magic: [0x4D, 0x4D, 0x00, 0x2A], footer: null, category: 'image', validate: 'tiff' },
  { name: 'ICO', extension: '.ico', magic: [0x00, 0x00, 0x01, 0x00], footer: null, category: 'image', validate: 'ico' },
  { name: 'PSD', extension: '.psd', magic: [0x38, 0x42, 0x50, 0x53], footer: null, category: 'image', validate: 'psd' },
];

const SCAN_CHUNK_SIZE = 1024 * 1024;
const OVERLAP_SIZE = 64;

class SignatureScanner {
  constructor(parser) {
    this.parser = parser;
    this.results = [];
    this.cancelled = false;
  }

  cancel() {
    this.cancelled = true;
  }

  async scan(options = {}, progressCallback = null) {
    this.cancelled = false;
    this.results = [];

    const fileSize = this.parser.stat.size;
    const startOffset = options.startOffset || 0;
    const endOffset = options.endOffset || fileSize;
    const categories = options.categories || null;
    const totalBytes = endOffset - startOffset;
    let scannedBytes = 0;

    const filteredSignatures = categories
      ? SIGNATURES.filter((s) => categories.includes(s.category))
      : SIGNATURES;

    let offset = startOffset;
    let prevTail = Buffer.alloc(0);

    while (offset < endOffset && !this.cancelled) {
      const readSize = Math.min(SCAN_CHUNK_SIZE + OVERLAP_SIZE, endOffset - offset);
      const chunk = this.parser.readBuffer(offset, readSize);
      const scanBuffer = Buffer.concat([prevTail, chunk]);

      for (const sig of filteredSignatures) {
        if (this.cancelled) break;
        this.findSignatureInBuffer(scanBuffer, sig, offset - prevTail.length, endOffset);
      }

      prevTail = chunk.subarray(chunk.length - OVERLAP_SIZE);
      offset += readSize - OVERLAP_SIZE;
      scannedBytes += readSize - OVERLAP_SIZE;

      if (progressCallback) {
        progressCallback({
          current: scannedBytes,
          total: totalBytes,
          percent: Math.min(99, Math.round((scannedBytes / totalBytes) * 100)),
          foundCount: this.results.length,
        });
        await new Promise((r) => setImmediate(r));
      }
    }

    this.deduplicateResults();

    if (progressCallback) {
      progressCallback({
        current: totalBytes,
        total: totalBytes,
        percent: 100,
        foundCount: this.results.length,
      });
    }

    return this.results;
  }

  findSignatureInBuffer(buffer, signature, baseOffset, maxOffset) {
    if (signature.validate === 'mp4' && signature.atomType) {
      this.scanMP4Signature(buffer, signature, baseOffset, maxOffset);
      return;
    }

    if (!signature.magic) return;

    const magicBuf = Buffer.from(signature.magic);

    let searchStart = 0;
    while (searchStart <= buffer.length - magicBuf.length) {
      const matchIndex = buffer.indexOf(magicBuf, searchStart);
      if (matchIndex === -1) break;

      const absoluteOffset = baseOffset + matchIndex;
      if (absoluteOffset > maxOffset) break;

      const validationResult = this.validateMagicHeader(buffer, matchIndex, signature, baseOffset);
      if (validationResult.valid) {
        const fileSize = this.estimateFileSize(buffer, matchIndex, signature);
        this.results.push({
          signatureName: signature.name,
          extension: signature.extension,
          category: signature.category,
          offset: absoluteOffset,
          estimatedSize: fileSize,
          clusterOffset: Math.floor(absoluteOffset / this.parser.clusterSize),
          confidence: validationResult.confidence,
          validationScore: validationResult.score,
        });
      }

      searchStart = matchIndex + 1;
    }

    if (signature.altMagics) {
      for (const altMagic of signature.altMagics) {
        const altMagicBuf = Buffer.from(altMagic);
        let altSearchStart = 0;
        while (altSearchStart <= buffer.length - altMagicBuf.length) {
          const matchIndex = buffer.indexOf(altMagicBuf, altSearchStart);
          if (matchIndex === -1) break;

          const absoluteOffset = baseOffset + matchIndex;
          if (absoluteOffset > maxOffset) break;

          const validationResult = this.validateMagicHeader(buffer, matchIndex, signature, baseOffset, customMagic);
          if (validationResult.valid) {
            const fileSize = this.estimateFileSize(buffer, matchIndex, signature);
            this.results.push({
              signatureName: signature.name,
              extension: signature.extension,
              category: signature.category,
              offset: absoluteOffset,
              estimatedSize: fileSize,
              clusterOffset: Math.floor(absoluteOffset / this.parser.clusterSize),
              confidence: Math.max(0.6, validationResult.confidence - 0.1),
              validationScore: validationResult.score,
            });
          }

          altSearchStart = matchIndex + 1;
        }
      }
    }
  }

  scanMP4Signature(buffer, signature, baseOffset, maxOffset) {
    const atomType = signature.atomType;

    for (let i = 0; i <= buffer.length - 8; i += 4) {
      const atomSize = buffer.readUInt32BE(i);
      const atomTypeInBuf = buffer.toString('ascii', i + 4, i + 8);

      if (atomTypeInBuf === atomType) {
        const headerStart = i;
        const totalSize = atomSize === 1 ? Number(buffer.readBigUInt64BE(i + 8)) : atomSize;
        if (totalSize > 0 && totalSize < 10 * 1024 * 1024 * 1024) {
          const absoluteOffset = baseOffset + headerStart;
          if (absoluteOffset <= maxOffset) {
            this.results.push({
              signatureName: signature.name,
              extension: signature.extension,
              category: signature.category,
              offset: absoluteOffset,
              estimatedSize: totalSize,
              clusterOffset: Math.floor(absoluteOffset / this.parser.clusterSize),
              confidence: 0.92,
              validationScore: 100,
            });
          }
        }
        break;
      }

      if (atomSize === 0) {
        break;
      } else if (atomSize >= 8 && atomSize < 1024 * 1024 * 1024) {
        i += (atomSize - 4);
      } else {
        break;
      }
    }
  }

  validateMagicHeader(buffer, offset, signature, baseOffset, customMagic = null) {
    const magic = customMagic || signature.magic;
    if (!magic) return { valid: false, confidence: 0, score: 0 };

    if (!this.bufferMatchesBytes(buffer, offset, magic)) {
      return { valid: false, confidence: 0, score: 0 };
    }

    let score = 0;
    const maxScore = 100;

    score += 40;

    const clusterOffset = (baseOffset + offset) % this.parser.clusterSize;
    if (clusterOffset === 0) {
      score += 15;
    }

    if (signature.validate) {
      const structScore = this.structuralValidation(buffer, offset, signature.validate);
      score += structScore;

      if (structScore < 20) {
        return { valid: false, confidence: 0, score: 0 };
      }
    }

    if (signature.footer) {
      score += 10;
    }

    const normalizedScore = Math.min(100, score);
    const confidence = normalizedScore / 100;

    return {
      valid: normalizedScore >= 40,
      confidence,
      score: normalizedScore,
    };
  }

  bufferMatchesBytes(buffer, offset, bytes) {
    if (offset + bytes.length > buffer.length) return false;
    for (let i = 0; i < bytes.length; i++) {
      if (buffer[offset + i] !== bytes[i]) return false;
    }
    return true;
  }

  structuralValidation(buffer, offset, type) {
    switch (type) {
      case 'jpeg': return this.validateJPEG(buffer, offset);
      case 'png': return this.validatePNG(buffer, offset);
      case 'gif': return this.validateGIF(buffer, offset);
      case 'bmp': return this.validateBMP(buffer, offset);
      case 'webp': return this.validateWebP(buffer, offset);
      case 'pdf': return this.validatePDF(buffer, offset);
      case 'zip': return this.validateZIP(buffer, offset);
      case 'rar': return this.validateRAR(buffer, offset);
      case 'rar5': return this.validateRAR5(buffer, offset);
      case '7z': return this.validate7z(buffer, offset);
      case 'gzip': return this.validateGZIP(buffer, offset);
      case 'bz2': return this.validateBZ2(buffer, offset);
      case 'ole2': return this.validateOLE2(buffer, offset);
      case 'ooxml': return this.validateOOXML(buffer, offset);
      case 'avi': return this.validateAVI(buffer, offset);
      case 'ebml': return this.validateEBML(buffer, offset);
      case 'mp3': return this.validateMP3(buffer, offset);
      case 'wav': return this.validateWAV(buffer, offset);
      case 'flac': return this.validateFLAC(buffer, offset);
      case 'pe': return this.validatePE(buffer, offset);
      case 'elf': return this.validateELF(buffer, offset);
      case 'xml': return this.validateXML(buffer, offset);
      case 'sqlite': return this.validateSQLite(buffer, offset);
      case 'tiff': return this.validateTIFF(buffer, offset);
      case 'ico': return this.validateICO(buffer, offset);
      case 'psd': return this.validatePSD(buffer, offset);
      default: return 30;
    }
  }

  validateJPEG(buffer, offset) {
    if (offset + 4 > buffer.length) return 0;
    const marker = buffer[offset + 2];
    if (marker !== 0xE0 && marker !== 0xE1 && marker !== 0xE2 &&
        marker !== 0xDB && marker !== 0xC0 && marker !== 0xC2) {
      return 10;
    }

    let score = 30;
    if (marker === 0xE0) {
      if (offset + 11 < buffer.length) {
        const jfif = buffer.toString('ascii', offset + 6, offset + 11);
        if (jfif === 'JFIF\x00') score += 20;
      }
    }
    if (marker === 0xE1) {
      if (offset + 13 < buffer.length) {
        const exif = buffer.toString('ascii', offset + 6, offset + 10);
        if (exif === 'Exif') score += 20;
      }
    }

    if (offset + 4 < buffer.length) {
      const segLen = buffer.readUInt16BE(offset + 4);
      if (segLen >= 8 && segLen < 65535) score += 5;
    }

    return score;
  }

  validatePNG(buffer, offset) {
    if (offset + 24 > buffer.length) return 0;
    let score = 35;

    const ihdrLength = buffer.readUInt32BE(offset + 8);
    if (ihdrLength !== 13) return 0;

    const chunkType = buffer.toString('ascii', offset + 12, offset + 16);
    if (chunkType !== 'IHDR') return 0;

    const width = buffer.readUInt32BE(offset + 16);
    const height = buffer.readUInt32BE(offset + 20);
    const bitDepth = buffer[offset + 24];
    const colorType = buffer[offset + 25];

    if (width > 0 && width < 1000000) score += 10;
    if (height > 0 && height < 1000000) score += 10;
    if ([1, 2, 4, 8, 16].includes(bitDepth)) score += 5;
    if ([0, 2, 3, 4, 6].includes(colorType)) score += 5;

    return score;
  }

  validateGIF(buffer, offset) {
    if (offset + 13 > buffer.length) return 0;
    let score = 30;

    const width = buffer.readUInt16LE(offset + 6);
    const height = buffer.readUInt16LE(offset + 8);

    if (width > 0 && width < 65536) score += 15;
    if (height > 0 && height < 65536) score += 15;

    const flags = buffer[offset + 10];
    if ((flags & 0x80) !== 0) {
      score += 5;
    }

    return score;
  }

  validateBMP(buffer, offset) {
    if (offset + 14 > buffer.length) return 0;
    let score = 25;

    const fileSize = buffer.readUInt32LE(offset + 2);
    if (fileSize > 0 && fileSize < 1024 * 1024 * 1024) score += 20;

    const reserved1 = buffer.readUInt16LE(offset + 6);
    const reserved2 = buffer.readUInt16LE(offset + 8);
    if (reserved1 === 0 && reserved2 === 0) score += 10;

    const pixelOffset = buffer.readUInt32LE(offset + 10);
    if (pixelOffset >= 14 && pixelOffset < fileSize) score += 10;

    return score;
  }

  validateWebP(buffer, offset) {
    if (offset + 12 > buffer.length) return 0;

    const riff = buffer.toString('ascii', offset, offset + 4);
    if (riff !== 'RIFF') return 0;

    if (offset + 16 > buffer.length) return 15;

    const webp = buffer.toString('ascii', offset + 8, offset + 12);
    if (webp !== 'WEBP') return 0;

    return 55;
  }

  validatePDF(buffer, offset) {
    if (offset + 8 > buffer.length) return 0;
    let score = 30;

    const version = buffer.toString('ascii', offset + 4, offset + 8);
    if (/^\d\.\d$/.test(version)) score += 15;

    let validHeaderChars = 0;
    for (let i = 0; i < 32 && offset + i < buffer.length; i++) {
      const c = buffer[offset + i];
      if ((c >= 0x20 && c <= 0x7E) || c === 0x0A || c === 0x0D) {
        validHeaderChars++;
      }
    }
    if (validHeaderChars > 20) score += 5;

    return score;
  }

  validateZIP(buffer, offset) {
    if (offset + 30 > buffer.length) return 0;
    let score = 30;

    const version = buffer.readUInt16LE(offset + 4);
    const bitFlags = buffer.readUInt16LE(offset + 6);
    const compression = buffer.readUInt16LE(offset + 8);
    const uncompSize = buffer.readUInt32LE(offset + 20);
    const filenameLen = buffer.readUInt16LE(offset + 26);
    const extraLen = buffer.readUInt16LE(offset + 28);

    if (compression <= 99) score += 10;
    if (uncompSize >= 0 && uncompSize < 1024 * 1024 * 1024) score += 5;
    if (filenameLen > 0 && filenameLen < 1024) {
      if (offset + 30 + filenameLen <= buffer.length) {
        const filename = buffer.toString('utf8', offset + 30, offset + 30 + filenameLen);
        if (/^[\x20-\x7E]+$/.test(filename)) score += 10;
      }
    }

    return score;
  }

  validateRAR(buffer, offset) {
    if (offset + 11 > buffer.length) return 0;
    let score = 35;

    const flags = buffer.readUInt16LE(offset + 9);
    const packSize = buffer.readUInt32LE(offset + 11);
    if (packSize >= 0 && packSize < 1024 * 1024 * 1024) score += 20;

    return score;
  }

  validateRAR5(buffer, offset) {
    if (offset + 12 > buffer.length) return 0;
    return 55;
  }

  validate7z(buffer, offset) {
    if (offset + 20 > buffer.length) return 0;
    let score = 40;

    const major = buffer.readUInt8(offset + 6);
    const minor = buffer.readUInt8(offset + 7);
    if (major >= 0 && major < 20) score += 15;

    const nextHeader = Number(buffer.readBigUInt64LE(offset + 12));
    if (nextHeader >= 0) score += 5;

    return score;
  }

  validateGZIP(buffer, offset) {
    if (offset + 10 > buffer.length) return 0;
    let score = 30;

    const compression = buffer[offset + 2];
    if (compression === 0x08) score += 25;

    const flags = buffer[offset + 3];
    if ((flags & 0xE0) === 0) score += 10;

    const xfl = buffer[offset + 8];
    if ([0, 2, 4].includes(xfl)) score += 5;

    return score;
  }

  validateBZ2(buffer, offset) {
    if (offset + 4 > buffer.length) return 0;
    let score = 30;

    const version = buffer[offset + 3];
    if (version === 0x68 || version === 0x30 || version === 0x31) {
      score += 25;
    }

    return score;
  }

  validateOLE2(buffer, offset) {
    if (offset + 512 > buffer.length) return 0;
    let score = 30;

    const secShift = buffer.readUInt16LE(offset + 30);
    const minSecShift = buffer.readUInt16LE(offset + 32);
    if (secShift >= 7 && secShift <= 16) score += 15;
    if (minSecShift >= 6 && minSecShift <= 16) score += 15;

    const dirStart = buffer.readUInt32LE(offset + 48);
    if (dirStart >= 0) score += 5;

    return score;
  }

  validateOOXML(buffer, offset) {
    if (offset + 46 > buffer.length) return 0;
    let score = 0;

    const filenameLen = buffer.readUInt16LE(offset + 26);
    if (offset + 30 + filenameLen <= buffer.length) {
      const filename = buffer.toString('utf8', offset + 30, offset + 30 + filenameLen).toLowerCase();
      const ooxmlFiles = ['[content_types].xml', '_rels/.rels', 'word/', 'xl/', 'ppt/'];
      for (const f of ooxmlFiles) {
        if (filename.includes(f)) {
          score += 45;
          break;
        }
      }
    }

    return score > 0 ? score : 15;
  }

  validateAVI(buffer, offset) {
    if (offset + 16 > buffer.length) return 0;

    const riff = buffer.toString('ascii', offset, offset + 4);
    if (riff !== 'RIFF') return 0;

    const avi = buffer.toString('ascii', offset + 8, offset + 12);
    if (avi !== 'AVI ') return 0;

    return 60;
  }

  validateEBML(buffer, offset) {
    if (offset + 10 > buffer.length) return 0;
    let score = 35;

    const firstByte = buffer[offset];
    if ((firstByte & 0xF0) === 0x10) {
      const idLen = firstByte & 0x0F;
      if (idLen >= 1 && idLen <= 4) score += 15;
    }

    const version = buffer[offset + 4];
    if (version === 1) score += 10;

    return score;
  }

  validateMP3(buffer, offset) {
    if (offset + 4 > buffer.length) return 0;

    if (buffer[offset] === 0x49 && buffer[offset + 1] === 0x44 && buffer[offset + 2] === 0x33) {
      if (offset + 10 <= buffer.length) {
        const version = buffer[offset + 3];
        if (version === 3 || version === 4) return 50;
      }
      return 30;
    }

    if (buffer[offset] === 0xFF && (buffer[offset + 1] & 0xF0) === 0xF0) {
      let score = 30;
      const version = (buffer[offset + 1] >> 3) & 0x03;
      const layer = (buffer[offset + 1] >> 1) & 0x03;
      const bitRate = (buffer[offset + 2] >> 4) & 0x0F;

      if (version !== 1) score += 10;
      if (layer !== 0) score += 10;
      if (bitRate !== 0 && bitRate !== 15) score += 10;

      return score;
    }

    return 0;
  }

  validateWAV(buffer, offset) {
    if (offset + 16 > buffer.length) return 0;

    const riff = buffer.toString('ascii', offset, offset + 4);
    if (riff !== 'RIFF') return 0;

    const wave = buffer.toString('ascii', offset + 8, offset + 12);
    if (wave !== 'WAVE') return 0;

    const fmt = buffer.toString('ascii', offset + 12, offset + 16);
    if (fmt === 'fmt ') return 60;

    return 45;
  }

  validateFLAC(buffer, offset) {
    if (offset + 8 > buffer.length) return 0;

    if (offset + 18 <= buffer.length) {
      const blockType = buffer[offset + 4] & 0x7F;
      if (blockType === 0) {
        const minBlock = buffer.readUInt16BE(offset + 8);
        const maxBlock = buffer.readUInt16BE(offset + 10);
        if (minBlock > 0 && maxBlock >= minBlock) return 55;
      }
    }

    return 40;
  }

  validatePE(buffer, offset) {
    if (offset + 0x40 > buffer.length) return 15;

    let score = 20;

    const lastPage = buffer.readUInt16LE(offset + 2);
    const pages = buffer.readUInt16LE(offset + 4);
    const peOffset = buffer.readUInt32LE(offset + 0x3C);

    if (peOffset >= 0x40 && peOffset < 0x1000) score += 15;
    if (offset + peOffset + 4 < buffer.length) {
      const peSig = buffer.readUInt32LE(offset + peOffset);
      if (peSig === 0x00004550) score += 20;
    }
    if (pages > 0 && pages < 65535) score += 10;

    return score;
  }

  validateELF(buffer, offset) {
    if (offset + 20 > buffer.length) return 0;
    let score = 30;

    const eiClass = buffer[offset + 4];
    const eiData = buffer[offset + 5];
    const eiVersion = buffer[offset + 6];
    const eiOsabi = buffer[offset + 7];

    if (eiClass === 1 || eiClass === 2) score += 15;
    if (eiData === 1 || eiData === 2) score += 10;
    if (eiVersion === 1) score += 10;
    if (eiOsabi <= 0x12 || eiOsabi === 0x61 || eiOsabi === 0xFF) score += 5;

    return score;
  }

  validateXML(buffer, offset) {
    if (offset + 10 > buffer.length) return 0;
    let score = 30;

    const header = buffer.toString('utf8', offset, offset + 10);
    if (header.startsWith('<?xml')) score += 25;

    return score;
  }

  validateSQLite(buffer, offset) {
    if (offset + 100 > buffer.length) return 15;

    let score = 40;
    const pageSize = buffer.readUInt16BE(offset + 16);
    if (pageSize === 1 || pageSize === 0 || (pageSize >= 512 && pageSize <= 65536)) score += 15;

    const writeVersion = buffer[offset + 18];
    const readVersion = buffer[offset + 19];
    if ((writeVersion === 1 || writeVersion === 2) && (readVersion === 1 || readVersion === 2)) score += 10;

    return score;
  }

  validateTIFF(buffer, offset) {
    if (offset + 8 > buffer.length) return 0;
    let score = 35;

    const isLE = buffer[offset] === 0x49;
    const magicNum = isLE ? buffer.readUInt16LE(offset + 2) : buffer.readUInt16BE(offset + 2);

    if (magicNum === 42) score += 25;

    return score;
  }

  validateICO(buffer, offset) {
    if (offset + 6 > buffer.length) return 0;
    let score = 30;

    const type = buffer.readUInt16LE(offset + 2);
    const count = buffer.readUInt16LE(offset + 4);

    if (type === 1) score += 15;
    if (count > 0 && count < 256) score += 15;

    return score;
  }

  validatePSD(buffer, offset) {
    if (offset + 10 > buffer.length) return 0;

    if (offset + 30 > buffer.length) return 30;

    let score = 30;
    const version = buffer.readUInt16LE(offset + 4);
    if (version === 1) score += 20;

    const channels = buffer.readUInt16LE(offset + 12);
    if (channels > 0 && channels <= 56) score += 10;

    return score;
  }

  estimateFileSize(buffer, headerOffset, signature) {
    if (signature.name === 'JPEG') {
      let offset = headerOffset + 2;
      while (offset < buffer.length - 1) {
        if (buffer[offset] === 0xFF) {
          if (buffer[offset + 1] === 0xD9) {
            return offset + 2 - headerOffset;
          }
          if (buffer[offset + 1] !== 0x00 && buffer[offset + 1] !== 0xFF) {
            const segLen = buffer.readUInt16BE(offset + 2);
            offset += 2 + segLen;
          } else {
            offset++;
          }
        } else {
          offset++;
        }
      }
    }

    if (signature.name === 'PNG') {
      let offset = headerOffset + 8;
      while (offset + 11 < buffer.length) {
        const chunkLen = buffer.readUInt32BE(offset);
        const chunkType = buffer.toString('ascii', offset + 4, offset + 8);
        if (chunkType === 'IEND') {
          return offset + 12 - headerOffset;
        }
        offset += 12 + chunkLen;
      }
    }

    if (signature.name === 'PDF') {
      const footerPattern = Buffer.from('%%EOF');
      const idx = buffer.indexOf(footerPattern, headerOffset);
      if (idx !== -1) return idx + 5 - headerOffset;
    }

    if (signature.name === 'GIF87a' || signature.name === 'GIF89a') {
      let offset = headerOffset + 6;
      if (offset + 7 < buffer.length) {
        const logicalWidth = buffer.readUInt16LE(offset);
        const logicalHeight = buffer.readUInt16LE(offset + 2);
        if (logicalWidth > 0 && logicalHeight > 0 && logicalWidth < 65536 && logicalHeight < 65536) {
          for (let searchIdx = headerOffset + 10; searchIdx < buffer.length - 1; searchIdx++) {
            if (buffer[searchIdx] === 0x3B) {
              return searchIdx + 1 - headerOffset;
            }
          }
        }
      }
    }

    if (signature.name === 'ZIP' || signature.name === 'DOCX') {
      const footerPattern = Buffer.from([0x50, 0x4B, 0x05, 0x06]);
      const idx = buffer.indexOf(footerPattern, headerOffset);
      if (idx !== -1) {
        const commentLen = buffer.readUInt16LE(idx + 20);
        return idx + 22 + commentLen - headerOffset;
      }
    }

    return -1;
  }

  calculateConfidence(buffer, offset, signature) {
    let confidence = 0.8;

    if (signature.name === 'JPEG') {
      if (offset + 2 < buffer.length && buffer[offset + 2] === 0xE0) confidence = 0.95;
      else if (offset + 2 < buffer.length && buffer[offset + 2] === 0xE1) confidence = 0.95;
      else confidence = 0.75;
    }

    if (signature.name === 'PNG') confidence = 0.98;
    if (signature.name === 'PDF') confidence = 0.95;

    if (signature.footer) confidence += 0.1;

    const clusterOffset = offset % this.parser.clusterSize;
    if (clusterOffset === 0) confidence += 0.05;

    return Math.min(1.0, confidence);
  }

  deduplicateResults() {
    const seen = new Map();
    const deduped = [];

    for (const result of this.results) {
      const key = `${result.signatureName}_${result.clusterOffset}`;
      const existing = seen.get(key);
      if (!existing || result.confidence > existing.confidence) {
        seen.set(key, result);
      }
    }

    this.results = Array.from(seen.values());
    this.results.sort((a, b) => a.offset - b.offset);
  }
}

module.exports = { SignatureScanner, SIGNATURES };
