import Database from 'better-sqlite3'
import fs from 'fs'
import { getDbFilePath } from './fileService.js'

export interface ColumnInfo {
  name: string
  type: string
  notNull: boolean
  defaultValue: string | null
  pk: boolean
}

export interface TableInfo {
  name: string
  columns: ColumnInfo[]
  rowCount: number
}

export interface QueryResult {
  columns: string[]
  rows: any[][]
  affectedRows?: number
  error?: string
}

export interface ForeignKeyInfo {
  id: number
  seq: number
  table: string
  from: string
  to: string
  onUpdate: string
  onDelete: string
  match: string
}

export interface TableRelation {
  fromTable: string
  fromColumn: string
  toTable: string
  toColumn: string
}

export class SQLiteManager {
  private db: Database.Database | null = null
  private filePath: string

  constructor(sessionStorageId: string, dbId: string) {
    this.filePath = getDbFilePath(sessionStorageId, dbId)
  }

  open(): void {
    if (!this.db) {
      if (!fs.existsSync(this.filePath)) {
        throw new Error('Database file not found')
      }
      this.db = new Database(this.filePath, { readonly: false })
    }
  }

  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }

  getTables(): TableInfo[] {
    this.open()
    if (!this.db) return []

    const tables = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as { name: string }[]

    return tables.map((t) => {
      const columns = this.getTableColumns(t.name)
      const rowCount = this.getRowCount(t.name)
      return { name: t.name, columns, rowCount }
    })
  }

  getTableColumns(tableName: string): ColumnInfo[] {
    this.open()
    if (!this.db) return []

    const columns = this.db
      .prepare(`PRAGMA table_info("${tableName}")`)
      .all() as {
        name: string
        type: string
        notnull: number
        dflt_value: string | null
        pk: number
      }[]

    return columns.map((c) => ({
      name: c.name,
      type: c.type || 'ANY',
      notNull: c.notnull === 1,
      defaultValue: c.dflt_value,
      pk: c.pk === 1,
    }))
  }

  getRowCount(tableName: string): number {
    this.open()
    if (!this.db) return 0

    const result = this.db
      .prepare(`SELECT COUNT(*) as count FROM "${tableName}"`)
      .get() as { count: number }

    return result.count
  }

  getTableData(tableName: string, limit: number, offset: number): { columns: string[]; rows: any[][]; total: number } {
    this.open()
    if (!this.db) return { columns: [], rows: [], total: 0 }

    const columns = this.getTableColumns(tableName).map((c) => c.name)
    const total = this.getRowCount(tableName)
    const rows = this.db
      .prepare(`SELECT * FROM "${tableName}" LIMIT ? OFFSET ?`)
      .all(limit, offset) as Record<string, any>[]

    const rowArrays = rows.map((row) => columns.map((col) => row[col]))

    return { columns, rows: rowArrays, total }
  }

  executeQuery(sql: string): QueryResult {
    this.open()
    if (!this.db) return { columns: [], rows: [], error: 'Database not open' }

    const trimmedSql = sql.trim().toUpperCase()
    const isReadOnly =
      trimmedSql.startsWith('SELECT') ||
      trimmedSql.startsWith('WITH') ||
      trimmedSql.startsWith('PRAGMA') ||
      trimmedSql.startsWith('EXPLAIN')

    try {
      if (isReadOnly) {
        const stmt = this.db.prepare(sql)
        const rows = stmt.all() as Record<string, any>[]
        const columns = rows.length > 0 ? Object.keys(rows[0]) : []
        const rowArrays = rows.map((row) => columns.map((col) => row[col]))
        return { columns, rows: rowArrays }
      } else {
        const result = this.db.prepare(sql).run()
        return {
          columns: [],
          rows: [],
          affectedRows: result.changes,
        }
      }
    } catch (err) {
      return {
        columns: [],
        rows: [],
        error: err instanceof Error ? err.message : 'Unknown error',
      }
    }
  }

  exportQueryToCSV(sql: string): string {
    const result = this.executeQuery(sql)
    if (result.error) {
      throw new Error(result.error)
    }

    const lines: string[] = []

    if (result.columns.length > 0) {
      lines.push(result.columns.map((c) => `"${c}"`).join(','))
    }

    for (const row of result.rows) {
      const line = row
        .map((val) => {
          if (val === null || val === undefined) return ''
          const str = String(val)
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`
          }
          return str
        })
        .join(',')
      lines.push(line)
    }

    return lines.join('\n')
  }

  getForeignKeys(tableName: string): ForeignKeyInfo[] {
    this.open()
    if (!this.db) return []

    const fks = this.db
      .prepare(`PRAGMA foreign_key_list("${tableName}")`)
      .all() as {
      id: number
      seq: number
      table: string
      from: string
      to: string
      onupdate: string
      ondelete: string
      match: string
    }[]

    return fks.map((fk) => ({
      id: fk.id,
      seq: fk.seq,
      table: fk.table,
      from: fk.from,
      to: fk.to,
      onUpdate: fk.onupdate,
      onDelete: fk.ondelete,
      match: fk.match,
    }))
  }

  getAllRelations(): TableRelation[] {
    const tables = this.getTables()
    const relations: TableRelation[] = []

    for (const table of tables) {
      const fks = this.getForeignKeys(table.name)
      for (const fk of fks) {
        relations.push({
          fromTable: table.name,
          fromColumn: fk.from,
          toTable: fk.table,
          toColumn: fk.to,
        })
      }
    }

    return relations
  }
}
