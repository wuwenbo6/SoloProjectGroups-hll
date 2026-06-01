import { useState, useEffect } from "react"
import { FileText, Upload } from "lucide-react"
import { useAnalysisStore } from "@/store/useAnalysisStore"
import { formatHex, formatSize, formatTimestamp, cn } from "@/lib/utils"
import FileUpload from "@/components/FileUpload"

const filters = [
  { key: "all", label: "All" },
  { key: "2", label: "Alloc" },
  { key: "3", label: "Dealloc" },
]

export default function Logs() {
  const { logs, fetchLogs, loading, taskId } = useAnalysisStore()
  const [filter, setFilter] = useState("all")
  const [page, setPage] = useState(1)
  const perPage = 20

  useEffect(() => {
    if (taskId) fetchLogs(page, perPage, filter)
  }, [taskId, page, filter, fetchLogs])

  if (!taskId) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-400">
        <FileText className="w-12 h-12 opacity-30" />
        <p>No log data available</p>
        <FileUpload onLoaded={() => setPage(1)} />
      </div>
    )
  }

  const totalPages = logs ? Math.ceil(logs.total / perPage) : 1

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => { setFilter(f.key); setPage(1) }}
            className={cn(
              "px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
              filter === f.key
                ? "bg-cyan/15 text-cyan border border-cyan/30"
                : "bg-navy-light/50 text-slate-400 border border-transparent hover:text-slate-200"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="bg-navy-dark border border-navy-light/60 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-light/60">
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Seq</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Op Type</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Offset</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Length</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Device</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">File Path</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-slate-500">Loading...</td>
                </tr>
              ) : logs && logs.logs.length > 0 ? (
                logs.logs.map((entry) => (
                  <tr
                    key={entry.seq}
                    className="border-b border-navy-light/30 hover:bg-navy-light/30 transition-colors"
                  >
                    <td className="px-4 py-2.5 font-mono text-slate-300">{entry.seq}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={cn(
                          "inline-block px-2 py-0.5 rounded text-xs font-medium",
                          entry.op_name === "ALLOC"
                            ? "bg-cyan/15 text-cyan"
                            : entry.op_name === "DEALLOC"
                            ? "bg-amber/15 text-amber"
                            : "bg-slate-700/50 text-slate-400"
                        )}
                      >
                        {entry.op_name}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-slate-300">{formatHex(entry.offset)}</td>
                    <td className="px-4 py-2.5 font-mono text-slate-300">{formatSize(entry.length)}</td>
                    <td className="px-4 py-2.5 text-slate-400">{entry.device}</td>
                    <td className="px-4 py-2.5 text-slate-400 font-mono text-xs max-w-48 truncate">{entry.file_path}</td>
                    <td className="px-4 py-2.5 text-slate-400 text-xs">{formatTimestamp(entry.timestamp)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-slate-500">No log entries found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {logs && logs.total > perPage && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-navy-light/60">
            <span className="text-xs text-slate-500">
              Page {page} of {totalPages} ({logs.total} total)
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1 rounded text-xs bg-navy-light/50 text-slate-300 disabled:opacity-30 hover:bg-navy-light transition-colors"
              >
                Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1 rounded text-xs bg-navy-light/50 text-slate-300 disabled:opacity-30 hover:bg-navy-light transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
