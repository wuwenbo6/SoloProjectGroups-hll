import { useState } from 'react'
import { ChevronDown, ChevronRight, Database, Table, Key, Hash, Trash2 } from 'lucide-react'
import type { TableInfo } from '@/types'
import { useDatabaseStore } from '@/store/useDatabaseStore'
import { deleteDatabase, getTableData, getTables } from '@/lib/api'

export default function Sidebar() {
  const {
    databases,
    currentDatabaseId,
    tables,
    selectedTable,
    setCurrentDatabase,
    setTables,
    setSelectedTable,
    setTableData,
    setError,
    removeDatabase,
  } = useDatabaseStore()

  const [expandedDbs, setExpandedDbs] = useState<Set<string>>(new Set())

  const toggleDb = (dbId: string) => {
    const newExpanded = new Set(expandedDbs)
    if (newExpanded.has(dbId)) {
      newExpanded.delete(dbId)
    } else {
      newExpanded.add(dbId)
    }
    setExpandedDbs(newExpanded)
  }

  const handleDatabaseClick = async (dbId: string, dbName: string) => {
    toggleDb(dbId)
    setCurrentDatabase(dbId, dbName)
    setSelectedTable(null)
    setTableData(null)

    try {
      const result = await getTables(dbId)
      setTables(result.tables)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tables')
    }
  }

  const handleTableClick = async (dbId: string, tableName: string) => {
    setSelectedTable(tableName)
    try {
      const data = await getTableData(dbId, tableName, 100, 0)
      setTableData(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load table data')
    }
  }

  const handleDeleteDatabase = async (dbId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await deleteDatabase(dbId)
      removeDatabase(dbId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete database')
    }
  }

  return (
    <aside className="w-72 bg-[#161b22] border-r border-[#30363d] flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-[#30363d]">
        <h2 className="text-sm font-semibold text-[#c9d1d9] flex items-center gap-2">
          <Database size={16} className="text-[#58a6ff]" />
          数据库列表
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        {databases.length === 0 ? (
          <div className="p-4 text-sm text-[#8b949e] text-center">
            暂无数据库，请上传 SQLite 文件
          </div>
        ) : (
          databases.map((db) => {
            const isExpanded = expandedDbs.has(db.id)
            const isActive = currentDatabaseId === db.id
            return (
              <div key={db.id} className="border-b border-[#21262d]">
                <div
                  className={`flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-[#21262d] transition-colors ${
                    isActive ? 'bg-[#1f6feb20]' : ''
                  }`}
                  onClick={() => handleDatabaseClick(db.id, db.name)}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {isExpanded ? (
                      <ChevronDown size={14} className="text-[#8b949e] flex-shrink-0" />
                    ) : (
                      <ChevronRight size={14} className="text-[#8b949e] flex-shrink-0" />
                    )}
                    <Database size={14} className="text-[#58a6ff] flex-shrink-0" />
                    <span className="text-sm text-[#c9d1d9] truncate" title={db.name}>
                      {db.name}
                    </span>
                  </div>
                  <button
                    className="p-1 text-[#8b949e] hover:text-[#f85149] hover:bg-[#f8514920] rounded transition-colors"
                    onClick={(e) => handleDeleteDatabase(db.id, e)}
                    title="删除数据库"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>

                {isExpanded && isActive && (
                  <div className="bg-[#0d1117]">
                    {tables.length === 0 ? (
                      <div className="px-8 py-2 text-xs text-[#8b949e]">
                        空数据库
                      </div>
                    ) : (
                      tables.map((table) => (
                        <div
                          key={table.name}
                          className={`flex items-center gap-2 px-8 py-1.5 cursor-pointer hover:bg-[#21262d] transition-colors ${
                            selectedTable === table.name
                              ? 'bg-[#1f6feb30] text-[#58a6ff]'
                              : 'text-[#c9d1d9]'
                          }`}
                          onClick={() => handleTableClick(db.id, table.name)}
                        >
                          <Table size={12} className="flex-shrink-0" />
                          <span className="text-xs truncate">{table.name}</span>
                          <span className="text-[10px] text-[#8b949e] ml-auto">
                            {table.rowCount.toLocaleString()} 行
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </aside>
  )
}
