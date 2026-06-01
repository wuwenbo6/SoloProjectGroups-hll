import { useRef } from 'react'
import { Download, AlertCircle, CheckCircle2 } from 'lucide-react'
import type { QueryResult } from '@/types'
import { useDatabaseStore } from '@/store/useDatabaseStore'
import { getExportUrl } from '@/lib/api'

interface Props {
  result: QueryResult
}

export default function QueryResult({ result }: Props) {
  const { currentDatabaseId, querySql } = useDatabaseStore()
  const containerRef = useRef<HTMLDivElement>(null)

  if (result.error) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-2 text-[#f85149] mb-2">
          <AlertCircle size={16} />
          <span className="font-medium">执行错误</span>
        </div>
        <pre className="text-sm text-[#f85149] bg-[#161b22] p-3 rounded border border-[#f8514940] font-mono whitespace-pre-wrap">
          {result.error}
        </pre>
      </div>
    )
  }

  if (result.affectedRows !== undefined && result.columns.length === 0) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-2 text-[#3fb950]">
          <CheckCircle2 size={16} />
          <span>查询执行成功，影响 {result.affectedRows} 行</span>
        </div>
      </div>
    )
  }

  if (result.columns.length === 0) {
    return (
      <div className="p-4 text-[#8b949e] text-sm">
        查询成功，无返回结果
      </div>
    )
  }

  const handleExport = () => {
    if (currentDatabaseId && querySql) {
      const url = getExportUrl(currentDatabaseId, querySql)
      const a = document.createElement('a')
      a.href = url
      a.download = 'query_result.csv'
      a.click()
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#30363d] bg-[#161b22]">
        <div className="text-sm text-[#8b949e]">
          共 {result.rows.length.toLocaleString()} 行，{result.columns.length} 列
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-[#c9d1d9] bg-[#21262d] hover:bg-[#30363d] rounded border border-[#30363d] transition-colors"
        >
          <Download size={14} />
          导出 CSV
        </button>
      </div>
      <div ref={containerRef} className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[#161b22]">
            <tr>
              {result.columns.map((col, i) => (
                <th
                  key={i}
                  className="px-3 py-2 text-left font-medium text-[#58a6ff] border-b border-[#30363d] whitespace-nowrap"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className={rowIndex % 2 === 0 ? 'bg-[#0d1117]' : 'bg-[#161b22]'}
              >
                {row.map((cell, colIndex) => (
                  <td
                    key={colIndex}
                    className="px-3 py-1.5 text-[#c9d1d9] border-b border-[#21262d] whitespace-nowrap font-mono text-xs"
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
  )
}
