import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, AlertCircle, Table, GitBranch } from 'lucide-react'
import Sidebar from '@/components/Sidebar'
import SchemaDiagram from '@/components/SchemaDiagram'
import { useDatabaseStore } from '@/store/useDatabaseStore'
import { getDatabases, getRelations } from '@/lib/api'
import type { TableInfo, TableRelation } from '@/types'

type ViewMode = 'table' | 'diagram'

export default function Browse() {
  const navigate = useNavigate()
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [schemaTables, setSchemaTables] = useState<TableInfo[]>([])
  const [schemaRelations, setSchemaRelations] = useState<TableRelation[]>([])
  const [loadingSchema, setLoadingSchema] = useState(false)
  const {
    databases,
    currentDatabaseId,
    currentDatabaseName,
    tables,
    selectedTable,
    tableData,
    error,
    setDatabases,
    setError,
  } = useDatabaseStore()

  useEffect(() => {
    if (databases.length === 0) {
      getDatabases()
        .then((data) => setDatabases(data.databases))
        .catch((err) => setError(err instanceof Error ? err.message : '加载失败'))
    }
  }, [databases.length, setDatabases, setError])

  useEffect(() => {
    if (viewMode === 'diagram' && currentDatabaseId) {
      setLoadingSchema(true)
      getRelations(currentDatabaseId)
        .then((data) => {
          setSchemaTables(data.tables)
          setSchemaRelations(data.relations)
        })
        .catch((err) => setError(err instanceof Error ? err.message : '加载关系图失败'))
        .finally(() => setLoadingSchema(false))
    }
  }, [viewMode, currentDatabaseId, setError])

  return (
    <div className="h-screen flex bg-[#0d1117] text-[#c9d1d9]">
      <Sidebar />

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-6 py-4 border-b border-[#30363d] bg-[#161b22]">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">浏览数据</h1>
            {currentDatabaseName && (
              <>
                <ChevronRight size={16} className="text-[#8b949e]" />
                <span className="text-[#8b949e]">{currentDatabaseName}</span>
              </>
            )}
            {selectedTable && viewMode === 'table' && (
              <>
                <ChevronRight size={16} className="text-[#8b949e]" />
                <span className="text-[#58a6ff]">{selectedTable}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {currentDatabaseId && (
              <div className="flex bg-[#21262d] rounded-md p-1 mr-2">
                <button
                  onClick={() => setViewMode('table')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
                    viewMode === 'table'
                      ? 'bg-[#30363d] text-[#c9d1d9]'
                      : 'text-[#8b949e] hover:text-[#c9d1d9]'
                  }`}
                >
                  <Table size={14} />
                  表数据
                </button>
                <button
                  onClick={() => setViewMode('diagram')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
                    viewMode === 'diagram'
                      ? 'bg-[#30363d] text-[#c9d1d9]'
                      : 'text-[#8b949e] hover:text-[#c9d1d9]'
                  }`}
                >
                  <GitBranch size={14} />
                  关系图
                </button>
              </div>
            )}
            <button
              onClick={() => navigate('/query')}
              disabled={!currentDatabaseId}
              className="px-4 py-2 text-sm font-medium bg-[#238636] hover:bg-[#2ea043] disabled:bg-[#21262d] disabled:text-[#484f58] disabled:cursor-not-allowed text-white rounded-md transition-colors"
            >
              SQL 查询
            </button>
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 text-sm font-medium bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] rounded-md transition-colors border border-[#30363d]"
            >
              上传新文件
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-hidden">
          {error && (
            <div className="flex items-center gap-2 p-4 bg-[#f8514920] border-b border-[#f8514940] text-[#f85149] text-sm">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {!currentDatabaseId ? (
            <div className="flex flex-col items-center justify-center h-full text-[#8b949e]">
              <p className="text-lg mb-2">请选择或上传一个数据库</p>
              <button
                onClick={() => navigate('/')}
                className="px-6 py-2 bg-[#21262d] hover:bg-[#30363d] rounded-md border border-[#30363d] transition-colors"
              >
                上传 SQLite 文件
              </button>
            </div>
          ) : viewMode === 'diagram' ? (
            <div className="h-full">
              {loadingSchema ? (
                <div className="flex items-center justify-center h-full text-[#8b949e]">
                  加载关系图中...
                </div>
              ) : (
                <SchemaDiagram tables={schemaTables} relations={schemaRelations} />
              )}
            </div>
          ) : !selectedTable ? (
            <div className="flex flex-col items-center justify-center h-full text-[#8b949e]">
              <p className="text-lg mb-2">请从左侧选择一个表</p>
              <p className="text-sm">数据库包含 {tables.length} 个表</p>
            </div>
          ) : tableData ? (
            <div className="h-full overflow-auto p-6">
              <div className="mb-4 flex items-center gap-4 text-sm text-[#8b949e]">
                <span>共 {tableData.total.toLocaleString()} 行</span>
                <span>显示前 {tableData.rows.length} 行</span>
              </div>
              <div className="overflow-auto rounded-lg border border-[#30363d]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-[#161b22]">
                    <tr>
                      {tableData.columns.map((col, i) => (
                        <th
                          key={i}
                          className="px-4 py-3 text-left font-medium text-[#58a6ff] border-b border-[#30363d] whitespace-nowrap"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tableData.rows.map((row, rowIndex) => (
                      <tr
                        key={rowIndex}
                        className={rowIndex % 2 === 0 ? 'bg-[#0d1117]' : 'bg-[#161b22]'}
                      >
                        {row.map((cell, colIndex) => (
                          <td
                            key={colIndex}
                            className="px-4 py-2 text-[#c9d1d9] border-b border-[#21262d] whitespace-nowrap font-mono text-xs"
                          >
                            {cell === null ? (
                              <span className="text-[#8b949e] italic">NULL</span>
                            ) : (
                              String(cell)
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  )
}
