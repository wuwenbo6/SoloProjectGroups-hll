import { Router, type Request, type Response } from 'express'
import multer from 'multer'
import path from 'path'
import { randomUUID } from 'crypto'
import {
  createSessionStorageId,
  ensureSessionDir,
  getFileSize,
  deleteDatabaseFile,
  getDbFilePath,
} from '../services/fileService.js'
import { SQLiteManager } from '../services/sqliteService.js'
import { touchSession } from '../services/sessionCleanup.js'

const router = Router()

const MAX_FILE_SIZE = 50 * 1024 * 1024

function getSessionStorageId(req: Request): string {
  if (!req.session.storageId) {
    req.session.storageId = createSessionStorageId()
  }
  touchSession(req.session.storageId)
  return req.session.storageId
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const storageId = getSessionStorageId(req)
    const dir = ensureSessionDir(storageId)
    cb(null, dir)
  },
  filename: (_req, file, cb) => {
    const dbId = randomUUID()
    const ext = path.extname(file.originalname)
    cb(null, `${dbId}.db`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    if (ext === '.db' || ext === '.sqlite' || ext === '.sqlite3') {
      cb(null, true)
    } else {
      cb(new Error('Only .db, .sqlite, .sqlite3 files are allowed'))
    }
  },
})

interface DatabaseEntry {
  id: string
  fileName: string
  uploadedAt: string
  size: number
}

declare module 'express-session' {
  interface SessionData {
    storageId?: string
    databases?: Record<string, DatabaseEntry>
  }
}

function getSessionDatabases(req: Request): Record<string, DatabaseEntry> {
  if (!req.session.databases) {
    req.session.databases = {}
  }
  return req.session.databases
}

router.post('/upload', upload.single('file'), (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No file uploaded' })
      return
    }

    const storageId = getSessionStorageId(req)
    const dbId = path.basename(req.file.filename, path.extname(req.file.filename))
    const originalName = req.file.originalname
    const size = req.file.size

    const databases = getSessionDatabases(req)
    databases[dbId] = {
      id: dbId,
      fileName: originalName,
      uploadedAt: new Date().toISOString(),
      size,
    }

    const manager = new SQLiteManager(storageId, dbId)
    const tables = manager.getTables()
    manager.close()

    touchSession(storageId)

    res.json({
      success: true,
      databaseId: dbId,
      fileName: originalName,
      tableCount: tables.length,
      tables,
    })
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Upload failed',
    })
  }
})

router.get('/databases', (req: Request, res: Response) => {
  const databases = getSessionDatabases(req)
  const dbList = Object.values(databases).map((db) => ({
    id: db.id,
    name: db.fileName,
    uploadedAt: db.uploadedAt,
    size: db.size,
    tableCount: 0,
  }))
  res.json({ databases: dbList })
})

router.get('/database/:dbId/tables', (req: Request, res: Response) => {
  try {
    const { dbId } = req.params
    const storageId = getSessionStorageId(req)
    const databases = getSessionDatabases(req)

    if (!databases[dbId]) {
      res.status(404).json({ success: false, error: 'Database not found' })
      return
    }

    const manager = new SQLiteManager(storageId, dbId)
    const tables = manager.getTables()
    manager.close()

    touchSession(storageId)

    res.json({ tables })
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to get tables',
    })
  }
})

router.get('/database/:dbId/table/:tableName', (req: Request, res: Response) => {
  try {
    const { dbId, tableName } = req.params
    const limit = parseInt(req.query.limit as string) || 100
    const offset = parseInt(req.query.offset as string) || 0
    const storageId = getSessionStorageId(req)
    const databases = getSessionDatabases(req)

    if (!databases[dbId]) {
      res.status(404).json({ success: false, error: 'Database not found' })
      return
    }

    const manager = new SQLiteManager(storageId, dbId)
    const data = manager.getTableData(tableName, limit, offset)
    manager.close()

    touchSession(storageId)

    res.json(data)
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to get table data',
    })
  }
})

router.post('/database/:dbId/query', (req: Request, res: Response) => {
  try {
    const { dbId } = req.params
    const { sql } = req.body as { sql: string }
    const storageId = getSessionStorageId(req)
    const databases = getSessionDatabases(req)

    if (!databases[dbId]) {
      res.status(404).json({ success: false, error: 'Database not found' })
      return
    }

    if (!sql || !sql.trim()) {
      res.status(400).json({ success: false, error: 'SQL query is required' })
      return
    }

    const manager = new SQLiteManager(storageId, dbId)
    const result = manager.executeQuery(sql)
    manager.close()

    touchSession(storageId)

    res.json(result)
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Query failed',
    })
  }
})

router.get('/database/:dbId/export', (req: Request, res: Response) => {
  try {
    const { dbId } = req.params
    const { sql } = req.query as { sql: string }
    const storageId = getSessionStorageId(req)
    const databases = getSessionDatabases(req)

    if (!databases[dbId]) {
      res.status(404).json({ success: false, error: 'Database not found' })
      return
    }

    if (!sql || !sql.trim()) {
      res.status(400).json({ success: false, error: 'SQL query is required' })
      return
    }

    const manager = new SQLiteManager(storageId, dbId)
    const csvContent = manager.exportQueryToCSV(sql)
    manager.close()

    touchSession(storageId)

    const fileName = `${databases[dbId].fileName.replace(/\.(db|sqlite|sqlite3)$/i, '')}_export.csv`

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
    res.send('\ufeff' + csvContent)
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Export failed',
    })
  }
})

router.get('/database/:dbId/relations', (req: Request, res: Response) => {
  try {
    const { dbId } = req.params
    const storageId = getSessionStorageId(req)
    const databases = getSessionDatabases(req)

    if (!databases[dbId]) {
      res.status(404).json({ success: false, error: 'Database not found' })
      return
    }

    const manager = new SQLiteManager(storageId, dbId)
    const tables = manager.getTables()
    const relations = manager.getAllRelations()
    manager.close()

    touchSession(storageId)

    res.json({ tables, relations })
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to get relations',
    })
  }
})

router.delete('/database/:dbId', (req: Request, res: Response) => {
  try {
    const { dbId } = req.params
    const storageId = getSessionStorageId(req)
    const databases = getSessionDatabases(req)

    if (!databases[dbId]) {
      res.status(404).json({ success: false, error: 'Database not found' })
      return
    }

    deleteDatabaseFile(storageId, dbId)
    delete databases[dbId]

    touchSession(storageId)

    res.json({ success: true })
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Delete failed',
    })
  }
})

export default router
