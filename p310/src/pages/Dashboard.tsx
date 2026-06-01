import { useEffect } from 'react'
import { useXrStore } from '@/store'
import MetricCards from '@/components/MetricCards'
import TrendChart from '@/components/TrendChart'
import PacketUpload from '@/components/PacketUpload'
import HistoryTable from '@/components/HistoryTable'
import CallCompare from '@/components/CallCompare'
import { GitCompare, FileText } from 'lucide-react'

export default function Dashboard() {
  const {
    latest,
    trend,
    history,
    codecs,
    selectedCodec,
    showCompare,
    trendHours,
    historyPage,
    loading,
    error,
    loadLatest,
    loadTrend,
    loadHistory,
    loadCodecs,
    parseFile,
    parseHex,
    generateDemo,
    setTrendHours,
    setHistoryPage,
    setSelectedCodec,
    setShowCompare,
    downloadPdfReport,
    clearError,
  } = useXrStore()

  useEffect(() => {
    loadLatest()
    loadTrend()
    loadHistory()
    loadCodecs()
  }, [])

  return (
    <div className="min-h-screen bg-slate-900">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-lg shadow-brand-500/25">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 4L8 2L14 4L8 6L2 4Z" fill="white" fillOpacity="0.9"/>
                <path d="M2 4V10L8 12V6L2 4Z" fill="white" fillOpacity="0.7"/>
                <path d="M14 4V10L8 12V6L14 4Z" fill="white" fillOpacity="0.5"/>
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-100 tracking-tight">RTCP XR</h1>
              <p className="text-[10px] text-slate-500 -mt-0.5 tracking-widest uppercase">呼叫质量分析</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowCompare(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 rounded-lg text-sm transition-colors"
            >
              <GitCompare size={14} />
              对比分析
            </button>
            <button
              onClick={() => downloadPdfReport()}
              className="flex items-center gap-2 px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm transition-colors shadow-lg shadow-brand-500/25"
            >
              <FileText size={14} />
              导出 PDF
            </button>
            <div className="flex items-center gap-2 ml-2">
              <div className={`w-2 h-2 rounded-full ${latest ? 'bg-brand-400 animate-pulse-slow' : 'bg-slate-600'}`} />
              <span className="text-xs text-slate-500">{latest ? '已连接' : '无数据'}</span>
            </div>
          </div>
        </div>
      </header>

      {showCompare && <CallCompare />}

      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4">
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-center justify-between">
            <span className="text-sm text-red-400">{error}</span>
            <button onClick={clearError} className="text-red-400 hover:text-red-300 text-xs">✕</button>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <MetricCards latest={latest} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <TrendChart data={trend} hours={trendHours} onHoursChange={setTrendHours} />
          </div>
          <div>
            <PacketUpload
              onFileUpload={parseFile}
              onHexSubmit={parseHex}
              onDemoGenerate={generateDemo}
              loading={loading}
              codecs={codecs}
              selectedCodec={selectedCodec}
              onCodecChange={setSelectedCodec}
            />
          </div>
        </div>

        <HistoryTable
          data={history}
          page={historyPage}
          onPageChange={setHistoryPage}
        />
      </main>

      <footer className="border-t border-slate-800 mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-center text-xs text-slate-600">
            RTCP XR Call Quality Analyzer · RFC 3611 · ITU-T G.107 E-Model
          </p>
        </div>
      </footer>
    </div>
  )
}
