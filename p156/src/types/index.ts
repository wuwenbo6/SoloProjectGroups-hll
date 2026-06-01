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

export interface DatabaseInfo {
  id: string
  name: string
  uploadedAt: string
  size: number
  tableCount: number
}

export interface TableData {
  columns: string[]
  rows: any[][]
  total: number
}

export interface QueryResult {
  columns: string[]
  rows: any[][]
  affectedRows?: number
  error?: string
}

export interface QueryHistoryItem {
  id: string
  sql: string
  executedAt: string
  success: boolean
  rowCount?: number
  error?: string
  databaseId: string
  databaseName: string
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
