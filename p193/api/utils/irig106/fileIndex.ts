import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { FileIndex, PacketIndexEntry, FileHeader, PacketType } from '../../../shared/types';
import { FILE_HEADER_SIZE, parseFileHeader } from './fileHeader';
import { PACKET_HEADER_SIZE, PACKET_SYNC, parsePacketHeader } from './packetHeader';

const INDEX_CACHE_DIR = process.env.INDEX_CACHE_DIR || '/tmp/irig106-index-cache';

function ensureCacheDir(): void {
  if (!fs.existsSync(INDEX_CACHE_DIR)) {
    fs.mkdirSync(INDEX_CACHE_DIR, { recursive: true });
  }
}

export function computeFileHash(buffer: Buffer): string {
  const hash = crypto.createHash('sha256');
  const sampleSize = Math.min(buffer.length, 1024 * 1024);
  hash.update(buffer.slice(0, sampleSize));
  hash.update(buffer.length.toString());
  if (buffer.length > sampleSize) {
    hash.update(buffer.slice(buffer.length - 1024));
  }
  return hash.digest('hex');
}

function getIndexPath(fileHash: string): string {
  return path.join(INDEX_CACHE_DIR, `${fileHash}.json`);
}

function serializeBigInt(obj: unknown): unknown {
  if (typeof obj === 'bigint') {
    return obj.toString();
  }
  if (Array.isArray(obj)) {
    return obj.map(item => serializeBigInt(item));
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = serializeBigInt(value);
    }
    return result;
  }
  return obj;
}

function deserializeBigInt(obj: unknown): unknown {
  const BIGINT_FIELDS = new Set(['timestampNs', 'fileSize', 'timestamp']);
  
  function deserializeValue(key: string, value: unknown): unknown {
    if (typeof value === 'string' && BIGINT_FIELDS.has(key) && /^-?\d+$/.test(value)) {
      return BigInt(value);
    }
    if (Array.isArray(value)) {
      return value.map((item, index) => deserializeValue(String(index), item));
    }
    if (value !== null && typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        result[k] = deserializeValue(k, v);
      }
      return result;
    }
    return value;
  }
  
  return deserializeValue('', obj);
}

export function saveFileIndex(index: FileIndex): void {
  ensureCacheDir();
  const indexPath = getIndexPath(index.fileHash);
  const serialized = serializeBigInt(index);
  fs.writeFileSync(indexPath, JSON.stringify(serialized), 'utf8');
}

export function loadFileIndex(fileHash: string): FileIndex | null {
  const indexPath = getIndexPath(fileHash);
  if (!fs.existsSync(indexPath)) {
    return null;
  }
  
  try {
    const data = fs.readFileSync(indexPath, 'utf8');
    const parsed = JSON.parse(data);
    return deserializeBigInt(parsed) as FileIndex;
  } catch (e) {
    console.warn('Failed to load index file:', e);
    return null;
  }
}

export function hasFileIndex(fileHash: string): boolean {
  return fs.existsSync(getIndexPath(fileHash));
}

export function buildFileIndex(
  buffer: Buffer,
  fileName: string,
  maxPackets: number = 10000
): FileIndex {
  const fileHash = computeFileHash(buffer);
  const fileHeader = parseFileHeader(buffer);
  
  const packets: PacketIndexEntry[] = [];
  let offset = FILE_HEADER_SIZE;
  let packetIndex = 0;
  const parseLimit = buffer.length;

  while (offset < parseLimit - PACKET_HEADER_SIZE && packetIndex < maxPackets) {
    try {
      const sync = buffer.readUInt16LE(offset);
      if (sync !== PACKET_SYNC) {
        offset += 2;
        continue;
      }

      const header = parsePacketHeader(buffer, offset);
      if (header.packetLength === 0) {
        offset += 2;
        continue;
      }

      packets.push({
        index: packetIndex,
        type: header.packetType as PacketType,
        offset,
        packetLength: header.packetLength,
        timestampNs: header.timestamp
      });

      offset += header.packetLength;
      packetIndex++;
    } catch (e) {
      offset += 2;
    }
  }

  return {
    version: 1,
    fileName,
    fileSize: buffer.length,
    fileHash,
    createdAt: new Date(),
    totalPackets: packetIndex,
    packets,
    fileHeader
  };
}

export function getPacketData(
  buffer: Buffer,
  indexEntry: PacketIndexEntry
): Buffer | null {
  const dataOffset = PACKET_HEADER_SIZE;
  const start = indexEntry.offset + dataOffset;
  const end = indexEntry.offset + indexEntry.packetLength;
  
  if (start >= buffer.length || end > buffer.length) {
    return null;
  }
  
  return buffer.slice(start, end);
}

export function clearIndexCache(): void {
  if (fs.existsSync(INDEX_CACHE_DIR)) {
    const files = fs.readdirSync(INDEX_CACHE_DIR);
    for (const file of files) {
      if (file.endsWith('.json')) {
        fs.unlinkSync(path.join(INDEX_CACHE_DIR, file));
      }
    }
  }
}

export function getIndexCacheStats(): { count: number; totalSize: number } {
  if (!fs.existsSync(INDEX_CACHE_DIR)) {
    return { count: 0, totalSize: 0 };
  }
  
  const files = fs.readdirSync(INDEX_CACHE_DIR);
  let totalSize = 0;
  let count = 0;
  
  for (const file of files) {
    if (file.endsWith('.json')) {
      const stats = fs.statSync(path.join(INDEX_CACHE_DIR, file));
      totalSize += stats.size;
      count++;
    }
  }
  
  return { count, totalSize };
}
