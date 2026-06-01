import { useState } from 'react'
import { useDDSStore } from '@/store/ddsStore'
import { Download, FileJson, FileSpreadsheet, CheckCircle } from 'lucide-react'

export default function ExportPanel() {
  const { exportStatsJSON, exportStatsCSV } = useDDSStore()
  const [copied, setCopied] = useState<string | null>(null)

  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleExportJSON = () => {
    const content = exportStatsJSON()
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    downloadFile(content, `dds-stats-${timestamp}.json`, 'application/json')
    showToast('json')
  }

  const handleExportCSV = () => {
    const content = exportStatsCSV()
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    downloadFile(content, `dds-stats-${timestamp}.csv`, 'text/csv')
    showToast('csv')
  }

  const showToast = (type: string) => {
    setCopied(type)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="bg-[#111827] border border-[#1E293B] rounded-2xl p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Download className="w-5 h-5 text-cyan-400" />
        <h2 className="text-lg font-semibold text-white tracking-wide">导出统计数据</h2>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={handleExportJSON}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-[#0F172A] hover:bg-[#152136] border border-[#1E293B] hover:border-cyan-500/50 rounded-xl text-slate-300 hover:text-cyan-400 transition-all duration-200 group"
        >
          {copied === 'json' ? (
            <CheckCircle className="w-4 h-4 text-emerald-400" />
          ) : (
            <FileJson className="w-4 h-4 group-hover:text-cyan-400 transition-colors" />
          )}
          <span className="text-sm font-medium">{copied === 'json' ? '已导出' : '导出 JSON'}</span>
        </button>

        <button
          onClick={handleExportCSV}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-[#0F172A] hover:bg-[#152136] border border-[#1E293B] hover:border-emerald-500/50 rounded-xl text-slate-300 hover:text-emerald-400 transition-all duration-200 group"
        >
          {copied === 'csv' ? (
            <CheckCircle className="w-4 h-4 text-emerald-400" />
          ) : (
            <FileSpreadsheet className="w-4 h-4 group-hover:text-emerald-400 transition-colors" />
          )}
          <span className="text-sm font-medium">{copied === 'csv' ? '已导出' : '导出 CSV'}</span>
        </button>
      </div>

      <p className="text-xs text-slate-500 text-center">
        包含最近 100 条消息明细 + 完整统计摘要
      </p>
    </div>
  )
}
