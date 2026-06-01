import fs from 'fs'
import path from 'path'
import os from 'os'
import { randomUUID } from 'crypto'

const TEMP_DIR = fs.realpathSync(os.tmpdir())
const UPLOADS_DIR = path.join(TEMP_DIR, 'sqlite-browser-uploads')

export function ensureUploadsDir(): string {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true })
  }
  return UPLOADS_DIR
}

export function getSessionDir(sessionStorageId: string): string {
  return path.join(UPLOADS_DIR, sessionStorageId)
}

export function getDbFilePath(sessionStorageId: string, dbId: string): string {
  return path.join(getSessionDir(sessionStorageId), `${dbId}.db`)
}

export function createSessionStorageId(): string {
  return randomUUID()
}

export function ensureSessionDir(sessionStorageId: string): string {
  const dir = getSessionDir(sessionStorageId)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

export function deleteSessionDir(sessionStorageId: string): void {
  const dir = getSessionDir(sessionStorageId)
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

export function deleteDatabaseFile(sessionStorageId: string, dbId: string): void {
  const filePath = getDbFilePath(sessionStorageId, dbId)
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
  }
}

export function getFileSize(filePath: string): number {
  try {
    return fs.statSync(filePath).size
  } catch {
    return 0
  }
}

export function getAllSessionDirs(): string[] {
  ensureUploadsDir()
  return fs
    .readdirSync(UPLOADS_DIR)
    .map((name) => path.join(UPLOADS_DIR, name))
    .filter((p) => fs.statSync(p).isDirectory())
}

export function getDirModifiedTime(dirPath: string): number {
  try {
    return fs.statSync(dirPath).mtimeMs
  } catch {
    return 0
  }
}
