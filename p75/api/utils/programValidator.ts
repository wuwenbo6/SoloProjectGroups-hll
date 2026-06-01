import fs from 'fs';
import crypto from 'crypto';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  checks: {
    fileExists: boolean;
    fileSize: boolean;
    fileFormat: boolean;
    checksum: string | null;
    magicNumber: boolean;
  };
}

const ALLOWED_EXTENSIONS = ['.bin', '.hex', '.out', '.elf', '.axf'];
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MIN_FILE_SIZE = 10;

const BIN_MAGIC_NUMBERS = [
  Buffer.from([0x7F, 0x45, 0x4C, 0x46]),
  Buffer.from([0xE9, 0xFD, 0xFF, 0xFF]),
];

function checkMagicNumber(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  
  const header = buffer.subarray(0, 4);
  
  for (const magic of BIN_MAGIC_NUMBERS) {
    if (header.equals(magic)) {
      return true;
    }
  }
  
  const firstByte = header[0];
  if (firstByte === 0x00 || firstByte === 0xE3 || firstByte === 0xEA) {
    return true;
  }
  
  return true;
}

function calculateChecksum(buffer: Buffer): string {
  const hash = crypto.createHash('sha256');
  hash.update(buffer);
  return hash.digest('hex');
}

function calculateCRC16(buffer: Buffer): number {
  let crc = 0xFFFF;
  const polynomial = 0x8005;
  
  for (let i = 0; i < buffer.length; i++) {
    crc ^= (buffer[i] << 8);
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ polynomial;
      } else {
        crc = crc << 1;
      }
    }
    crc = crc & 0xFFFF;
  }
  
  return crc;
}

export function validateProgramFile(filePath: string): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    checks: {
      fileExists: false,
      fileSize: false,
      fileFormat: false,
      checksum: null,
      magicNumber: false,
    },
  };

  if (!fs.existsSync(filePath)) {
    result.errors.push('文件不存在');
    result.valid = false;
    return result;
  }
  result.checks.fileExists = true;

  const stats = fs.statSync(filePath);
  const fileSize = stats.size;
  
  if (fileSize < MIN_FILE_SIZE) {
    result.errors.push(`文件过小: ${fileSize} bytes (最小: ${MIN_FILE_SIZE} bytes)`);
    result.valid = false;
  } else if (fileSize > MAX_FILE_SIZE) {
    result.errors.push(`文件过大: ${(fileSize / 1024 / 1024).toFixed(2)} MB (最大: ${MAX_FILE_SIZE / 1024 / 1024} MB)`);
    result.valid = false;
  } else {
    result.checks.fileSize = true;
  }

  const path = require('path');
  const ext = path.extname(filePath).toLowerCase();
  
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    result.errors.push(`不支持的文件格式: ${ext} (支持: ${ALLOWED_EXTENSIONS.join(', ')})`);
    result.valid = false;
  } else {
    result.checks.fileFormat = true;
  }

  let fileBuffer: Buffer;
  try {
    fileBuffer = fs.readFileSync(filePath);
  } catch (error) {
    result.errors.push('无法读取文件内容');
    result.valid = false;
    return result;
  }

  result.checks.checksum = calculateChecksum(fileBuffer);
  result.checks.magicNumber = checkMagicNumber(fileBuffer);

  if (ext === '.bin') {
    const crc = calculateCRC16(fileBuffer);
    result.warnings.push(`文件 CRC16 校验码: 0x${crc.toString(16).toUpperCase().padStart(4, '0')}`);
  }

  if (ext === '.hex') {
    const content = fileBuffer.toString('utf-8');
    if (!content.startsWith(':')) {
      result.errors.push('HEX 文件格式无效');
      result.valid = false;
    } else {
      result.warnings.push('HEX 文件格式验证通过');
    }
  }

  return result;
}

export interface PlcState {
  isRunning: boolean;
  hasError: boolean;
  errorMessage?: string;
}

export function validatePlcState(plcData: {
  temperature: number;
  pressure: number;
  status: boolean;
  alarm: boolean;
}): { safe: boolean; errors: string[] } {
  const errors: string[] = [];

  if (plcData.alarm) {
    errors.push('PLC 当前处于告警状态，禁止下载');
  }

  if (!plcData.status) {
    errors.push('PLC 未处于运行状态');
  }

  if (plcData.temperature > 70) {
    errors.push(`PLC 温度过高: ${plcData.temperature.toFixed(1)}°C`);
  }

  if (plcData.pressure > 2.0) {
    errors.push(`PLC 压力过高: ${plcData.pressure.toFixed(2)} MPa`);
  }

  return {
    safe: errors.length === 0,
    errors,
  };
}

export function validateDownloadConditions(
  fileValidation: ValidationResult,
  plcState: { safe: boolean; errors: string[] }
): { allowed: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (!fileValidation.valid) {
    reasons.push(...fileValidation.errors);
  }

  if (!plcState.safe) {
    reasons.push(...plcState.errors);
  }

  return {
    allowed: reasons.length === 0,
    reasons,
  };
}
