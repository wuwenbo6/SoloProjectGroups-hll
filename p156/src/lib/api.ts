import type { DatabaseInfo, TableInfo, TableData, QueryResult, TableRelation } from '@/types'

const API_BASE = '/api'

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    ...options,
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `Request failed: ${res.status}`)
  }

  return res.json() as Promise<T>
}

export async function uploadDatabase(file: File): Promise<{
  success: boolean
  databaseId: string
  fileName: string
  tableCount: number
  tables: TableInfo[]
}> {
  const formData = new FormData()
  formData.append('file', file)

  const res = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `Upload failed: ${res.status}`)
  }

  return res.json()
}

export async function getDatabases(): Promise<{ databases: DatabaseInfo[] }> {
  return request<{ databases: DatabaseInfo[] }>('/databases')
}

export async function getTables(dbId: string): Promise<{ tables: TableInfo[] }> {
  return request<{ tables: TableInfo[] }>(`/database/${dbId}/tables`)
}

export async function getTableData(
  dbId: string,
  tableName: string,
  limit = 100,
  offset = 0,
): Promise<TableData> {
  return request<TableData>(
    `/database/${dbId}/table/${encodeURIComponent(tableName)}?limit=${limit}&offset=${offset}`,
  )
}

export async function executeQuery(dbId: string, sql: string): Promise<QueryResult> {
  return request<QueryResult>(`/database/${dbId}/query`, {
    method: 'POST',
    body: JSON.stringify({ sql }),
  })
}

export function getExportUrl(dbId: string, sql: string): string {
  return `${API_BASE}/database/${dbId}/export?sql=${encodeURIComponent(sql)}`
}

export async function deleteDatabase(dbId: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/database/${dbId}`, {
    method: 'DELETE',
  })
}

export async function getRelations(dbId: string): Promise<{
  tables: TableInfo[]
  relations: TableRelation[]
}> {
  return request<{ tables: TableInfo[]; relations: TableRelation[] }>(
    `/database/${dbId}/relations`,
  )
}
