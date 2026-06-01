const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.tif', '.ico', '.svg']);
const TEXT_EXTENSIONS = new Set([
  '.txt', '.log', '.md', '.json', '.xml', '.html', '.htm', '.css', '.js',
  '.py', '.java', '.c', '.cpp', '.h', '.cs', '.php', '.rb', '.go', '.rs',
  '.sh', '.bat', '.ps1', '.yml', '.yaml', '.toml', '.ini', '.cfg', '.conf',
  '.csv', '.tsv', '.sql', '.gitignore', '.env', 'readme', 'license'
]);
const MAX_PREVIEW_SIZE = 1024 * 1024;
const MAX_TEXT_PREVIEW = 100 * 1024;

class FilePreview {
  static getPreviewType(fileName) {
    if (!fileName) return 'unknown';
    const name = fileName.toLowerCase();
    const ext = name.includes('.') ? name.substring(name.lastIndexOf('.')) : name;
    if (IMAGE_EXTENSIONS.has(ext)) return 'image';
    if (TEXT_EXTENSIONS.has(ext)) return 'text';
    if (TEXT_EXTENSIONS.has(ext.replace('.', ''))) return 'text';
    return 'unknown';
  }

  static generatePreview(data, fileName) {
    if (!data || data.length === 0) {
      return { type: 'empty', content: null };
    }

    const previewType = this.getPreviewType(fileName);

    if (previewType === 'image') {
      return this.generateImagePreview(data, fileName);
    }

    if (previewType === 'text') {
      return this.generateTextPreview(data);
    }

    const detectedType = this.detectTypeByContent(data);
    if (detectedType === 'image') {
      return this.generateImagePreview(data, fileName);
    }
    if (detectedType === 'text') {
      return this.generateTextPreview(data);
    }

    return this.generateHexPreview(data);
  }

  static detectTypeByContent(data) {
    if (data.length < 4) return 'unknown';

    const header = [data[0], data[1], data[2], data[3]];

    if (header[0] === 0xFF && header[1] === 0xD8 && header[2] === 0xFF) return 'image';
    if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47) return 'image';
    if (header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x38) return 'image';
    if (header[0] === 0x42 && header[1] === 0x4D) return 'image';
    if (header[0] === 0x49 && header[1] === 0x49 && header[2] === 0x2A) return 'image';
    if (header[0] === 0x4D && header[1] === 0x4D) return 'image';

    let printable = 0;
    let nullBytes = 0;
    const checkLen = Math.min(data.length, 1024);
    for (let i = 0; i < checkLen; i++) {
      const b = data[i];
      if (b === 0) nullBytes++;
      if ((b >= 0x20 && b <= 0x7E) || b === 0x0A || b === 0x0D || b === 0x09 || b === 0x00) {
        printable++;
      }
    }

    const printableRatio = printable / checkLen;
    const nullRatio = nullBytes / checkLen;

    if (printableRatio > 0.9 && nullRatio < 0.1) {
      return 'text';
    }

    return 'binary';
  }

  static generateImagePreview(data, fileName) {
    try {
      if (data.length > MAX_PREVIEW_SIZE) {
        return {
          type: 'image',
          subType: 'too_large',
          content: null,
          size: data.length,
          message: `Image too large for preview (${this.formatSize(data.length)})`,
        };
      }

      const ext = fileName.toLowerCase().substring(fileName.lastIndexOf('.') + 1);
      let mime = 'image/' + ext;
      if (ext === 'jpg' || ext === 'jpeg') mime = 'image/jpeg';
      else if (ext === 'svg') mime = 'image/svg+xml';
      else if (ext === 'tif' || ext === 'tiff') mime = 'image/tiff';
      else if (ext === 'webp') mime = 'image/webp';

      const base64 = data.toString('base64');

      return {
        type: 'image',
        subType: 'available',
        content: `data:${mime};base64,${base64}`,
        size: data.length,
      };
    } catch (err) {
      return {
        type: 'image',
        subType: 'error',
        content: null,
        message: err.message,
      };
    }
  }

  static generateTextPreview(data) {
    try {
      const previewData = data.length > MAX_TEXT_PREVIEW ? data.subarray(0, MAX_TEXT_PREVIEW) : data;
      const encoding = this.detectEncoding(previewData);
      const text = previewData.toString(encoding);
      const sanitized = this.sanitizeText(text);

      return {
        type: 'text',
        subType: 'available',
        content: sanitized,
        size: data.length,
        previewSize: previewData.length,
        encoding,
        truncated: data.length > MAX_TEXT_PREVIEW,
      };
    } catch (err) {
      return {
        type: 'text',
        subType: 'error',
        content: null,
        message: err.message,
      };
    }
  }

  static generateHexPreview(data) {
    const hexSize = Math.min(data.length, 4096);
    const hexData = data.subarray(0, hexSize);

    const lines = [];
    for (let i = 0; i < hexData.length; i += 16) {
      const offset = i.toString(16).padStart(8, '0');
      const bytes = [];
      const ascii = [];

      for (let j = 0; j < 16; j++) {
        if (i + j < hexData.length) {
          const b = hexData[i + j];
          bytes.push(b.toString(16).padStart(2, '0'));
          ascii.push(b >= 0x20 && b < 0x7F ? String.fromCharCode(b) : '.');
        } else {
          bytes.push('  ');
          ascii.push(' ');
        }
      }

      lines.push(`${offset}  ${bytes.slice(0, 8).join(' ')}  ${bytes.slice(8).join(' ')}  |${ascii.join('')}|`);
    }

    return {
      type: 'hex',
      subType: 'available',
      content: lines.join('\n'),
      size: data.length,
      previewSize: hexSize,
      truncated: data.length > hexSize,
    };
  }

  static detectEncoding(data) {
    if (data.length >= 2) {
      if (data[0] === 0xFF && data[1] === 0xFE) return 'utf16le';
      if (data[0] === 0xFE && data[1] === 0xFF) return 'utf16le';
    }
    if (data.length >= 3) {
      if (data[0] === 0xEF && data[1] === 0xBB && data[2] === 0xBF) return 'utf8';
    }

    let hasHighBytes = false;
    for (let i = 0; i < Math.min(data.length, 1024); i++) {
      if (data[i] > 0x7F) {
        hasHighBytes = true;
        break;
      }
    }

    return hasHighBytes ? 'utf8' : 'ascii';
  }

  static sanitizeText(text) {
    return text
      .replace(/\x00/g, '\u2400')
      .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, (c) => {
        const code = c.charCodeAt(0);
        return String.fromCharCode(0x2400 + code);
      });
  }

  static formatSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + units[i];
  }
}

module.exports = { FilePreview };
