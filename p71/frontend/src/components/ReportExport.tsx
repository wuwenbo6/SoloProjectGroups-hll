import React, { useState } from 'react'

interface ReportExportProps {
  className?: string
}

export const ReportExport: React.FC<ReportExportProps> = ({ className = '' }) => {
  const [exporting, setExporting] = useState(false)
  const [days, setDays] = useState(30)
  const [showMenu, setShowMenu] = useState(false)

  const handleExport = async (format: 'json' | 'csv' | 'text') => {
    setExporting(true)
    try {
      const response = await fetch(
        `/api/advanced/report/progress/export?days=${days}&format=${format}`
      )
      
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `training_report_${days}days.${format}`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        window.URL.revokeObjectURL(url)
      }
    } catch (error) {
      console.error('Export failed:', error)
    } finally {
      setExporting(false)
      setShowMenu(false)
    }
  }

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="flex items-center gap-2 px-4 py-2 bg-slate-700/50 hover:bg-slate-600/50 text-white rounded-lg transition-all"
      >
        <span>📥</span>
        <span>导出报告</span>
      </button>

      {showMenu && (
        <div className="absolute right-0 mt-2 w-64 glass rounded-xl p-4 shadow-xl z-50">
          <h4 className="text-white font-semibold mb-3">导出训练报告</h4>
          
          <div className="mb-4">
            <label className="text-gray-400 text-sm block mb-2">统计周期</label>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="w-full bg-slate-800 text-white rounded-lg px-3 py-2 border border-slate-600 focus:border-neon-cyan focus:outline-none"
            >
              <option value={7}>最近 7 天</option>
              <option value={14}>最近 14 天</option>
              <option value={30}>最近 30 天</option>
              <option value={90}>最近 90 天</option>
            </select>
          </div>

          <div className="space-y-2">
            <button
              onClick={() => handleExport('json')}
              disabled={exporting}
              className="w-full flex items-center gap-3 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-all disabled:opacity-50"
            >
              <span className="text-lg">📄</span>
              <div className="text-left">
                <p className="font-medium">JSON 格式</p>
                <p className="text-xs text-gray-400">适合数据分析</p>
              </div>
            </button>
            
            <button
              onClick={() => handleExport('csv')}
              disabled={exporting}
              className="w-full flex items-center gap-3 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-all disabled:opacity-50"
            >
              <span className="text-lg">📊</span>
              <div className="text-left">
                <p className="font-medium">CSV 格式</p>
                <p className="text-xs text-gray-400">Excel 兼容</p>
              </div>
            </button>
            
            <button
              onClick={() => handleExport('text')}
              disabled={exporting}
              className="w-full flex items-center gap-3 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-all disabled:opacity-50"
            >
              <span className="text-lg">📝</span>
              <div className="text-left">
                <p className="font-medium">文本报告</p>
                <p className="text-xs text-gray-400">易读格式</p>
              </div>
            </button>
          </div>

          {exporting && (
            <div className="flex items-center justify-center py-3">
              <div className="animate-spin w-5 h-5 border-2 border-neon-cyan border-t-transparent rounded-full mr-2" />
              <span className="text-gray-400 text-sm">导出中...</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
