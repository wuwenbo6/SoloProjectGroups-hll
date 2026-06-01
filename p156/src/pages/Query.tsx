import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Editor from '@monaco-editor/react'
import { Play, ChevronRight, AlertCircle, Loader2, Clock } from 'lucide-react'
import Sidebar from '@/components/Sidebar'
import QueryResult from '@/components/QueryResult'
import QueryHistoryPanel from '@/components/QueryHistoryPanel'
import { useDatabaseStore } from '@/store/useDatabaseStore'
import { executeQuery, getDatabases } from '@/lib/api'

export default function Query() {
  const navigate = useNavigate()
  const [executing, setExecuting] = useState(false)
  const {
    databases,
    currentDatabaseId,
    currentDatabaseName,
    querySql,
    queryResult,
    error,
    showHistory,
    setDatabases,
    setQuerySql,
    setQueryResult,
    setError,
    setShowHistory,
    addQueryHistory,
  } = useDatabaseStore()

  useEffect(() => {
    if (databases.length === 0) {
      getDatabases()
        .then((data) => setDatabases(data.databases))
        .catch((err) => setError(err instanceof Error ? err.message : '加载失败'))
    }
  }, [databases.length, setDatabases, setError])

  const handleExecute = useCallback(async () => {
    if (!currentDatabaseId || !querySql.trim()) return

    setExecuting(true)
    setError(null)
    try {
      const result = await executeQuery(currentDatabaseId, querySql)
      setQueryResult(result)

      addQueryHistory({
        sql: querySql,
        success: !result.error,
        rowCount: result.rows.length,
        error: result.error,
        databaseId: currentDatabaseId,
        databaseName: currentDatabaseName,
      })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '执行失败'
      setError(errorMsg)

      addQueryHistory({
        sql: querySql,
        success: false,
        error: errorMsg,
        databaseId: currentDatabaseId,
        databaseName: currentDatabaseName,
      })
    } finally {
      setExecuting(false)
    }
  }, [currentDatabaseId, currentDatabaseName, querySql, setQueryResult, setError, addQueryHistory])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        handleExecute()
      }
    },
    [handleExecute],
  )

  return (
    <div className="h-screen flex bg-[#0d1117] text-[#c9d1d9]" onKeyDown={handleKeyDown}>
      <Sidebar />

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-6 py-4 border-b border-[#30363d] bg-[#161b22]">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">SQL 查询</h1>
            {currentDatabaseName && (
              <>
                <ChevronRight size={16} className="text-[#8b949e]" />
                <span className="text-[#8b949e]">{currentDatabaseName}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md transition-colors border ${
                showHistory
                  ? 'bg-[#1f6feb20] text-[#58a6ff] border-[#1f6feb]'
                  : 'bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] border-[#30363d]'
              }`}
            >
              <Clock size={14} />
              历史
            </button>
            <button
              onClick={handleExecute}
              disabled={!currentDatabaseId || executing || !querySql.trim()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-[#238636] hover:bg-[#2ea043] disabled:bg-[#21262d] disabled:text-[#484f58] disabled:cursor-not-allowed text-white rounded-md transition-colors"
            >
              {executing ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Play size={14} />
              )}
              执行 (Ctrl+Enter)
            </button>
            <button
              onClick={() => navigate('/browse')}
              className="px-4 py-2 text-sm font-medium bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] rounded-md transition-colors border border-[#30363d]"
            >
              浏览数据
            </button>
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 text-sm font-medium bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] rounded-md transition-colors border border-[#30363d]"
            >
              上传新文件
            </button>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden">
          {!currentDatabaseId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-[#8b949e]">
              <p className="text-lg mb-2">请先上传或选择一个数据库</p>
              <button
                onClick={() => navigate('/')}
                className="px-6 py-2 bg-[#21262d] hover:bg-[#30363d] rounded-md border border-[#30363d] transition-colors"
              >
                上传 SQLite 文件
              </button>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="h-2/5 flex flex-col border-b border-[#30363d]">
                <div className="px-4 py-2 border-b border-[#30363d] bg-[#161b22] flex items-center justify-between">
                  <span className="text-sm text-[#8b949e]">SQL 编辑器</span>
                  <span className="text-xs text-[#8b949e]">提示: 按 Ctrl+Enter 执行查询</span>
                </div>
                <div className="flex-1 min-h-0">
                  <Editor
                    height="100%"
                    defaultLanguage="sql"
                    value={querySql}
                    onChange={(value) => setQuerySql(value || '')}
                    theme="vs-dark"
                    options={{
                      minimap: { enabled: false },
                      fontSize: 14,
                      fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
                      lineNumbers: 'on',
                      scrollBeyondLastLine: false,
                      automaticLayout: true,
                      tabSize: 2,
                      wordWrap: 'on',
                      padding: { top: 12 },
                    }}
                  />
                </div>
              </div>

              <div className="flex-1 overflow-hidden flex flex-col">
                {error && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-[#f8514920] border-b border-[#f8514940] text-[#f85149] text-sm">
                    <AlertCircle size={14} />
                    {error}
                  </div>
                )}
                {queryResult ? (
                  <QueryResult result={queryResult} />
                ) : (
                  <div className="flex-1 flex items-center justify-center text-[#8b949e] text-sm">
                    执行 SQL 查询后，结果将显示在此处
                  </div>
                )}
              </div>
            </div>
          )}

          <QueryHistoryPanel />
        </div>
      </main>
    </div>
  )
}
