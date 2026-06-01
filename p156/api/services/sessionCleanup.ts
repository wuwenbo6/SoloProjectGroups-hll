import fs from 'fs'
import { getAllSessionDirs, getDirModifiedTime, deleteSessionDir, ensureUploadsDir, getSessionDir } from './fileService.js'

const SESSION_TTL = 1000 * 60 * 60 * 24
const CLEANUP_INTERVAL = 1000 * 60 * 30

let cleanupInterval: NodeJS.Timeout | null = null

function cleanExpiredSessions(): void {
  try {
    const now = Date.now()
    const sessionDirs = getAllSessionDirs()
    let deletedCount = 0

    for (const dirPath of sessionDirs) {
      const modifiedTime = getDirModifiedTime(dirPath)
      const age = now - modifiedTime

      if (age > SESSION_TTL) {
        try {
          deleteSessionDir(dirPath.split('/').pop() || '')
          deletedCount++
        } catch (err) {
          console.error(`Failed to delete session dir ${dirPath}:`, err)
        }
      }
    }

    if (deletedCount > 0) {
      console.log(`[SessionCleanup] Deleted ${deletedCount} expired session directories`)
    }
  } catch (err) {
    console.error('[SessionCleanup] Error during cleanup:', err)
  }
}

export function startSessionCleanup(): void {
  ensureUploadsDir()

  cleanExpiredSessions()

  cleanupInterval = setInterval(() => {
    cleanExpiredSessions()
  }, CLEANUP_INTERVAL)

  console.log(`[SessionCleanup] Started. TTL: ${SESSION_TTL / 1000 / 60}min, Interval: ${CLEANUP_INTERVAL / 1000 / 60}min`)
}

export function stopSessionCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval)
    cleanupInterval = null
    console.log('[SessionCleanup] Stopped')
  }
}

export function touchSession(sessionStorageId: string): void {
  try {
    const dirPath = getSessionDir(sessionStorageId)
    if (fs.existsSync(dirPath)) {
      const now = new Date()
      fs.utimesSync(dirPath, now, now)
    }
  } catch (err) {
  }
}
