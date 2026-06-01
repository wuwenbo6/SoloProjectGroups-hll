import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

interface FileEntry {
  id: string;
  buffer: Buffer;
  timestamp: number;
  fileName: string;
}

const cache = new Map<string, FileEntry>();
const TTL_MS = 30 * 60 * 1000;

function generateId(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function storeFile(buffer: Buffer, fileName: string): string {
  cleanup();
  const id = generateId();
  cache.set(id, {
    id,
    buffer,
    timestamp: Date.now(),
    fileName,
  });
  return id;
}

export function getFile(id: string): Buffer | null {
  cleanup();
  const entry = cache.get(id);
  return entry ? entry.buffer : null;
}

export function cleanup(): void {
  const now = Date.now();
  for (const [id, entry] of cache) {
    if (now - entry.timestamp > TTL_MS) {
      cache.delete(id);
    }
  }
}

export function getFileName(id: string): string | null {
  const entry = cache.get(id);
  return entry ? entry.fileName : null;
}

export default {
  storeFile,
  getFile,
  cleanup,
  getFileName,
};
