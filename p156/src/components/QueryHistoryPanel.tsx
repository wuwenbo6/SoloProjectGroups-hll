import { X, Clock, CheckCircle, AlertCircle, Trash2, Play } from 'lucide-react'
import { useDatabaseStore } from '@/store/useDatabaseStore'

export default function QueryHistoryPanel() {
  const {
    queryHistory,
    showHistory,
    setShowHistory,
    setQuerySql,
    removeHistoryItem,
    clearQueryHistory,
  } = useDatabaseStore()

  if (!showHistory) return null

  const handleUseQuery = (sql: string) => {
    setQuerySql(sql)
    setShowHistory(false)
  }

  const formatTime = (iso: string) => {
    const date = new Date(iso)
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="w-80 bg-[#161b22] border-l border-[#30363d] flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#30363d]">
        <h3 className="text-sm font-semibold text-[#c9d1d9] flex items-center gap-2">
          <Clock size={14} className="text-[#58a6ff]" />
          查询历史
        </h3>
        <div className="flex items-center gap-1">
          {queryHistory.length > 0 && (
            <button
              onClick={clearQueryHistory}
              className="p-1.5 text-[#8b949e] hover:text-[#f85149] hover:bg-[#f8514920] rounded text-xs"
              title="清空历史"
            >
              <Trash2 size={14} />
            </button>
          )}
          <button
            onClick={() => setShowHistory(false)}
            className="p-1.5 text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#30363d] rounded"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {queryHistory.length === 0 ? (
          <div className="p-4 text-center text-sm text-[#8b949e]">暂无查询历史</div>
        ) : (
          queryHistory.map((item) => (
            <div
              key={item.id}
              className="px-3 py-2 border-b border-[#21262d] hover:bg-[#21262d] group cursor-pointer"
              onClick={() => handleUseQuery(item.sql)}
            >
              <div className="flex items-start justify-between gap-2">
                <pre className="text-xs text-[#c9d1d9] font-mono whitespace-pre-wrap break-all line-clamp-2 flex-1">
                  {item.sql}
                </pre>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    removeHistoryItem(item.id)
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-[#8b949e] hover:text-[#f85149] hover:bg-[#f8514920] rounded transition-opacity"
                  title="删除"
                >
                  <X size={12} />
                </button>
              </div>
              <div className="flex items-center justify-between mt-2 text-[10px] text-[#8b949e]">
                <span>{formatTime(item.executedAt)}</span>
                <div className="flex items-center gap-2">
                  {item.success ? (
                    <span className="flex items-center gap-1 text-[#3fb950]">
                      <CheckCircle size={10} />
                      {item.rowCount !== undefined ? `${item.rowCount} 行` : '成功'}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[#f85149]">
                      <AlertCircle size={10} />
                      失败
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 mt-1">
                <Play size={10} className="text-[#8b949e]" />
                <span className="text-[10px] text-[#8b949e]">{item.databaseName}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
