import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'
import type { Patient, Order, Observation, MessageRecord } from '../shared/types.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const dbPath = path.join(__dirname, '../../data/hl7.db')

let db: Database.Database

function initDatabase() {
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rawMessage TEXT NOT NULL,
      messageType TEXT,
      sendingApp TEXT,
      sendingFacility TEXT,
      parseStatus TEXT NOT NULL DEFAULT 'success',
      parseError TEXT,
      receivedVia TEXT NOT NULL DEFAULT 'tcp',
      receivedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patientId TEXT NOT NULL UNIQUE,
      lastName TEXT,
      firstName TEXT,
      birthDate TEXT,
      sex TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patientId INTEGER NOT NULL,
      messageId INTEGER NOT NULL,
      orderNumber TEXT,
      procedureCode TEXT,
      procedureName TEXT,
      orderingProvider TEXT,
      observationDateTime TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (patientId) REFERENCES patients(id),
      FOREIGN KEY (messageId) REFERENCES messages(id)
    );

    CREATE TABLE IF NOT EXISTS observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      orderId INTEGER NOT NULL,
      setValueType TEXT,
      observationIdentifier TEXT,
      observationName TEXT,
      observationValue TEXT,
      units TEXT,
      referenceRange TEXT,
      abnormalFlag TEXT,
      resultStatus TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (orderId) REFERENCES orders(id)
    );

    CREATE INDEX IF NOT EXISTS idx_patients_patientId ON patients(patientId);
    CREATE INDEX IF NOT EXISTS idx_orders_patientId ON orders(patientId);
    CREATE INDEX IF NOT EXISTS idx_observations_orderId ON observations(orderId);
    CREATE INDEX IF NOT EXISTS idx_messages_receivedAt ON messages(receivedAt);
    CREATE INDEX IF NOT EXISTS idx_messages_parseStatus ON messages(parseStatus);
  `)

  return db
}

export function getDb() {
  if (!db) {
    initDatabase()
  }
  return db
}

export function insertMessage(msg: MessageRecord): number {
  const db = getDb()
  const stmt = db.prepare(`
    INSERT INTO messages (rawMessage, messageType, sendingApp, sendingFacility, parseStatus, parseError, receivedVia)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  const result = stmt.run(msg.rawMessage, msg.messageType || null, msg.sendingApp || null, msg.sendingFacility || null, msg.parseStatus, msg.parseError || null, msg.receivedVia)
  return Number(result.lastInsertRowid)
}

export function insertPatient(patient: Patient): number {
  const db = getDb()
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO patients (patientId, lastName, firstName, birthDate, sex)
    VALUES (?, ?, ?, ?, ?)
  `)
  stmt.run(patient.patientId, patient.lastName || null, patient.firstName || null, patient.birthDate || null, patient.sex || null)

  const selectStmt = db.prepare('SELECT id FROM patients WHERE patientId = ?')
  const row = selectStmt.get(patient.patientId) as { id: number }
  return row.id
}

export function insertOrder(order: Order): number {
  const db = getDb()
  const stmt = db.prepare(`
    INSERT INTO orders (patientId, messageId, orderNumber, procedureCode, procedureName, orderingProvider, observationDateTime)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  const result = stmt.run(order.patientId, order.messageId, order.orderNumber || null, order.procedureCode || null, order.procedureName || null, order.orderingProvider || null, order.observationDateTime || null)
  return Number(result.lastInsertRowid)
}

export function insertObservation(obs: Observation): number {
  const db = getDb()
  const stmt = db.prepare(`
    INSERT INTO observations (orderId, setValueType, observationIdentifier, observationName, observationValue, units, referenceRange, abnormalFlag, resultStatus)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const result = stmt.run(obs.orderId, obs.setValueType || null, obs.observationIdentifier || null, obs.observationName || null, obs.observationValue || null, obs.units || null, obs.referenceRange || null, obs.abnormalFlag || null, obs.resultStatus || null)
  return Number(result.lastInsertRowid)
}

export function getPatients(search?: string, limit = 100, offset = 0) {
  const db = getDb()
  let query = `
    SELECT p.*,
      (SELECT COUNT(*) FROM orders o WHERE o.patientId = p.id) as orderCount,
      (SELECT MAX(o.observationDateTime) FROM orders o WHERE o.patientId = p.id) as lastTestDate
    FROM patients p
  `
  const params: (string | number)[] = []

  if (search) {
    query += ` WHERE p.patientId LIKE ? OR p.lastName LIKE ? OR p.firstName LIKE ?`
    const searchTerm = `%${search}%`
    params.push(searchTerm, searchTerm, searchTerm)
  }

  query += ` ORDER BY p.createdAt DESC LIMIT ? OFFSET ?`
  params.push(limit, offset)

  const stmt = db.prepare(query)
  return stmt.all(...params)
}

export function getPatientById(id: number) {
  const db = getDb()
  const stmt = db.prepare('SELECT * FROM patients WHERE id = ?')
  return stmt.get(id)
}

export function getOrdersByPatientId(patientId: number) {
  const db = getDb()
  const stmt = db.prepare(`
    SELECT o.*, m.receivedAt as messageReceivedAt
    FROM orders o
    JOIN messages m ON o.messageId = m.id
    WHERE o.patientId = ?
    ORDER BY o.observationDateTime DESC, o.createdAt DESC
  `)
  return stmt.all(patientId)
}

export function getObservationsByOrderId(orderId: number) {
  const db = getDb()
  const stmt = db.prepare(`
    SELECT * FROM observations
    WHERE orderId = ?
    ORDER BY id ASC
  `)
  return stmt.all(orderId)
}

export function getMessages(page = 1, limit = 20) {
  const db = getDb()
  const offset = (page - 1) * limit
  const stmt = db.prepare(`
    SELECT id, messageType, sendingApp, sendingFacility, parseStatus, parseError, receivedAt, receivedVia
    FROM messages
    ORDER BY receivedAt DESC
    LIMIT ? OFFSET ?
  `)
  const countStmt = db.prepare('SELECT COUNT(*) as total FROM messages')
  return {
    data: stmt.all(limit, offset),
    total: (countStmt.get() as { total: number }).total,
    page,
    limit
  }
}

export function getMessageById(id: number) {
  const db = getDb()
  const stmt = db.prepare('SELECT * FROM messages WHERE id = ?')
  return stmt.get(id)
}

export function getStats() {
  const db = getDb()

  const todayMessagesStmt = db.prepare("SELECT COUNT(*) as count FROM messages WHERE date(receivedAt) = date('now')")
  const patientCountStmt = db.prepare('SELECT COUNT(*) as count FROM patients')
  const abnormalStmt = db.prepare("SELECT COUNT(*) as count FROM observations o WHERE o.abnormalFlag IS NOT NULL AND o.abnormalFlag != '' AND o.abnormalFlag != 'N'")
  const pendingStmt = db.prepare("SELECT COUNT(*) as count FROM observations o WHERE o.resultStatus = 'P' OR o.resultStatus IS NULL")

  return {
    todayMessageCount: (todayMessagesStmt.get() as { count: number }).count,
    patientCount: (patientCountStmt.get() as { count: number }).count,
    abnormalResultCount: (abnormalStmt.get() as { count: number }).count,
    pendingReviewCount: (pendingStmt.get() as { count: number }).count
  }
}

export function getDbStats() {
  const db = getDb()

  const messageCountStmt = db.prepare('SELECT COUNT(*) as count FROM messages')
  const patientCountStmt = db.prepare('SELECT COUNT(*) as count FROM patients')
  const orderCountStmt = db.prepare('SELECT COUNT(*) as count FROM orders')
  const obsCountStmt = db.prepare('SELECT COUNT(*) as count FROM observations')

  return {
    messageCount: (messageCountStmt.get() as { count: number }).count,
    patientCount: (patientCountStmt.get() as { count: number }).count,
    orderCount: (orderCountStmt.get() as { count: number }).count,
    observationCount: (obsCountStmt.get() as { count: number }).count
  }
}

export default {
  getDb,
  insertMessage,
  insertPatient,
  insertOrder,
  insertObservation,
  getPatients,
  getPatientById,
  getOrdersByPatientId,
  getObservationsByOrderId,
  getMessages,
  getMessageById,
  getStats,
  getDbStats
}
