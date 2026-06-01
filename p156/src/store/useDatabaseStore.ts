import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { DatabaseInfo, TableInfo, TableData, QueryResult, QueryHistoryItem } from '@/types'

interface DatabaseState {
  databases: DatabaseInfo[]
  currentDatabaseId: string | null
  currentDatabaseName: string
  tables: TableInfo[]
  selectedTable: string | null
  tableData: TableData | null
  queryResult: QueryResult | null
  querySql: string
  isLoading: boolean
  error: string | null
  queryHistory: QueryHistoryItem[]
  showHistory: boolean

  setDatabases: (dbs: DatabaseInfo[]) => void
  setCurrentDatabase: (id: string, name: string) => void
  setTables: (tables: TableInfo[]) => void
  setSelectedTable: (table: string | null) => void
  setTableData: (data: TableData | null) => void
  setQueryResult: (result: QueryResult | null) => void
  setQuerySql: (sql: string) => void
  setIsLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  removeDatabase: (id: string) => void
  addQueryHistory: (item: Omit<QueryHistoryItem, 'id' | 'executedAt'>) => void
  clearQueryHistory: () => void
  removeHistoryItem: (id: string) => void
  setShowHistory: (show: boolean) => void
}

export const useDatabaseStore = create<DatabaseState>()(
  persist(
    (set) => ({
      databases: [],
      currentDatabaseId: null,
      currentDatabaseName: '',
      tables: [],
      selectedTable: null,
      tableData: null,
      queryResult: null,
      querySql: 'SELECT * FROM table_name LIMIT 100;',
      isLoading: false,
      error: null,
      queryHistory: [],
      showHistory: false,

      setDatabases: (dbs) => set({ databases: dbs }),
      setCurrentDatabase: (id, name) => set({ currentDatabaseId: id, currentDatabaseName: name }),
      setTables: (tables) => set({ tables }),
      setSelectedTable: (table) => set({ selectedTable: table }),
      setTableData: (data) => set({ tableData: data }),
      setQueryResult: (result) => set({ queryResult: result }),
      setQuerySql: (sql) => set({ querySql: sql }),
      setIsLoading: (loading) => set({ isLoading: loading }),
      setError: (error) => set({ error }),
      removeDatabase: (id) =>
        set((state) => ({
          databases: state.databases.filter((d) => d.id !== id),
          currentDatabaseId: state.currentDatabaseId === id ? null : state.currentDatabaseId,
        })),
      addQueryHistory: (item) =>
        set((state) => ({
          queryHistory: [
            {
              ...item,
              id: crypto.randomUUID(),
              executedAt: new Date().toISOString(),
            },
            ...state.queryHistory.slice(0, 99),
          ],
        })),
      clearQueryHistory: () => set({ queryHistory: [] }),
      removeHistoryItem: (id) =>
        set((state) => ({
          queryHistory: state.queryHistory.filter((h) => h.id !== id),
        })),
      setShowHistory: (show) => set({ showHistory: show }),
    }),
    {
      name: 'sqlite-browser-storage',
      partialize: (state) => ({
        queryHistory: state.queryHistory,
      }),
    },
  ),
)
