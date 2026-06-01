import { useState, useEffect, useMemo } from "react"
import { AlertTriangle, FileText, Wrench, Download, FileJson, FileSpreadsheet } from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts"
import { useAnalysisStore } from "@/store/useAnalysisStore"
import { formatHex, formatSize, formatNumber, formatTimestamp, cn } from "@/lib/utils"
import FileUpload from "@/components/FileUpload"
import FixPreview from "@/components/FixPreview"

const PIE_COLORS = ["#06B6D4", "#F59E0B", "#EF4444", "#22C55E", "#A78BFA", "#FB923C", "#38BDF8"]

export default function Leaks() {
  const { leaks, fetchLeaks, loading, taskId, exportReport, generateFix, currentFix, setCurrentFix } = useAnalysisStore()
  const [page, setPage] = useState(1)
  const [showFix, setShowFix] = useState(false)
  const perPage = 15

  useEffect(() => {
    if (taskId) fetchLeaks(page, perPage)
  }, [taskId, page, fetchLeaks])

  const handleFixClick = async () => {
    setCurrentFix(null)
    setShowFix(true)
    try {
      await generateFix("ceph")
    } catch (_) {
    }
  }

  const handleExportJson = () => {
    exportReport("json")
  }

  const handleExportCsv = () => {
    exportReport("csv")
  }

  const deviceData = useMemo(() => {
    if (!leaks?.summary?.by_device) return []
    return Object.entries(leaks.summary.by_device).map(([name, v]) => ({
      name,
      count: v.count,
      size: v.total_size,
    }))
  }, [leaks])

  const fileData = useMemo(() => {
    if (!leaks?.summary?.by_file) return []
    return Object.entries(leaks.summary.by_file).map(([name, v]) => ({
      name: name.split("/").pop() || name,
      value: v.total_size,
      count: v.count,
    }))
  }, [leaks])

  const topDevice = useMemo(() => {
    if (deviceData.length === 0) return "—"
    return deviceData.reduce((a, b) => (a.size > b.size ? a : b)).name
  }, [deviceData])

  const topFile = useMemo(() => {
    if (fileData.length === 0) return "—"
    return fileData.reduce((a, b) => (a.value > b.value ? a : b)).name
  }, [fileData])

  if (!taskId) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-400">
        <AlertTriangle className="w-12 h-12 opacity-30" />
        <p>No leak data available</p>
        <FileUpload onLoaded={() => setPage(1)} />
      </div>
    )
  }

  const totalPages = leaks ? Math.ceil(leaks.total / perPage) : 1

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-200">Leak Detection Results</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleFixClick}
            disabled={loading || !leaks || leaks.total === 0}
            className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber/10 text-amber text-sm font-medium hover:bg-amber/20 transition-colors border border-amber/30 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Wrench className="w-4 h-4" />
            Auto Fix
          </button>
          <div className="flex items-center border border-navy-light/60 rounded-md overflow-hidden">
            <button
              onClick={handleExportJson}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 text-xs text-slate-300 hover:bg-navy-light/30 transition-colors border-r border-navy-light/60 disabled:opacity-40"
            >
              <FileJson className="w-4 h-4" />
              JSON
            </button>
            <button
              onClick={handleExportCsv}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 text-xs text-slate-300 hover:bg-navy-light/30 transition-colors disabled:opacity-40"
            >
              <FileSpreadsheet className="w-4 h-4" />
              CSV
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-navy-dark border border-navy-light/60 rounded-lg p-4">
          <p className="text-xs text-slate-400 uppercase">Total Leaks</p>
          <p className="text-xl font-bold font-mono text-red-400">
            {leaks ? formatNumber(leaks.total) : "—"}
          </p>
        </div>
        <div className="bg-navy-dark border border-navy-light/60 rounded-lg p-4">
          <p className="text-xs text-slate-400 uppercase">Leaked Size</p>
          <p className="text-xl font-bold font-mono text-red-400">
            {leaks?.summary ? formatSize(
              Object.values(leaks.summary.by_device).reduce((s, v) => s + v.total_size, 0)
            ) : "—"}
          </p>
        </div>
        <div className="bg-navy-dark border border-navy-light/60 rounded-lg p-4">
          <p className="text-xs text-slate-400 uppercase">Most Leaked Device</p>
          <p className="text-sm font-mono text-cyan truncate">{topDevice}</p>
        </div>
        <div className="bg-navy-dark border border-navy-light/60 rounded-lg p-4">
          <p className="text-xs text-slate-400 uppercase">Most Leaked File</p>
          <p className="text-sm font-mono text-amber truncate">{topFile}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-navy-dark border border-navy-light/60 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-navy-light/60">
            <h3 className="text-sm font-medium text-slate-300">Leak Entries</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-navy-light/60">
                  <th className="text-left px-4 py-2.5 text-slate-400 font-medium">ID</th>
                  <th className="text-left px-4 py-2.5 text-slate-400 font-medium">Offset</th>
                  <th className="text-left px-4 py-2.5 text-slate-400 font-medium">Length</th>
                  <th className="text-left px-4 py-2.5 text-slate-400 font-medium">Refs</th>
                  <th className="text-left px-4 py-2.5 text-slate-400 font-medium">Device</th>
                  <th className="text-left px-4 py-2.5 text-slate-400 font-medium">File Path</th>
                  <th className="text-left px-4 py-2.5 text-slate-400 font-medium">Seq</th>
                  <th className="text-left px-4 py-2.5 text-slate-400 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="text-center py-8 text-slate-500">Loading...</td></tr>
                ) : leaks && leaks.leaks.length > 0 ? (
                  leaks.leaks.map((l) => (
                    <tr key={l.id} className="border-b border-navy-light/30 hover:bg-navy-light/30 transition-colors">
                      <td className="px-4 py-2 font-mono text-slate-300">{l.id}</td>
                      <td className="px-4 py-2 font-mono text-red-400">{formatHex(l.offset)}</td>
                      <td className="px-4 py-2 font-mono text-slate-300">{formatSize(l.length)}</td>
                      <td className="px-4 py-2">
                        <span className={cn(
                          "inline-block px-2 py-0.5 rounded text-xs font-medium font-mono",
                          l.ref_count > 1 ? "bg-amber/15 text-amber" : "bg-slate-700/50 text-slate-400"
                        )}>
                          {l.ref_count}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-slate-400">{l.device}</td>
                      <td className="px-4 py-2 text-slate-400 font-mono text-xs max-w-32 truncate">{l.file_path}</td>
                      <td className="px-4 py-2 font-mono text-slate-400">{l.allocated_at_seq}</td>
                      <td className="px-4 py-2 text-xs text-slate-500">{formatTimestamp(l.allocated_at_timestamp)}</td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={8} className="text-center py-8 text-slate-500">No leaks detected</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {leaks && leaks.total > perPage && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-navy-light/60">
              <span className="text-xs text-slate-500">Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1 rounded text-xs bg-navy-light/50 text-slate-300 disabled:opacity-30 hover:bg-navy-light transition-colors"
                >Prev</button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1 rounded text-xs bg-navy-light/50 text-slate-300 disabled:opacity-30 hover:bg-navy-light transition-colors"
                >Next</button>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="bg-navy-dark border border-navy-light/60 rounded-lg p-4">
            <h3 className="text-sm font-medium text-slate-300 mb-4">Leaks by Device</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={deviceData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                  <XAxis dataKey="name" tick={{ fill: "#94A3B8", fontSize: 10 }} stroke="#1E293B" />
                  <YAxis tick={{ fill: "#94A3B8", fontSize: 10 }} stroke="#1E293B" />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0B1120", border: "1px solid #1E293B", borderRadius: 8, color: "#E2E8F0", fontSize: 12 }}
                  />
                  <Bar dataKey="size" fill="#06B6D4" radius={[4, 4, 0, 0]} name="Size" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-navy-dark border border-navy-light/60 rounded-lg p-4">
            <h3 className="text-sm font-medium text-slate-300 mb-4">Leaks by File</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={fileData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={70}
                    stroke="#0F172A"
                    strokeWidth={2}
                  >
                    {fileData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0B1120", border: "1px solid #1E293B", borderRadius: 8, color: "#E2E8F0", fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {fileData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="text-xs text-slate-400 truncate max-w-24">{d.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showFix && (
        <FixPreview onClose={() => setShowFix(false)} />
      )}
    </div>
  )
}
