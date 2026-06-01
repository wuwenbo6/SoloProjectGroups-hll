import { useEffect, useState } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { X, BarChart3, GitCompare, FileText } from 'lucide-react'
import { useXrStore } from '@/store'
import type { CallInfo } from '@/types'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

const COLORS = [
  '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16',
]

function formatTimestamp(ts: string): string {
  const d = new Date(ts + 'Z')
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function mosLevel(mos: number): string {
  if (mos >= 4.0) return 'text-brand-400'
  if (mos >= 3.2) return 'text-amber-400'
  return 'text-red-400'
}

function CallItem({ call, selected, onToggle }: {
  call: CallInfo
  selected: boolean
  onToggle: () => void
}) {
  return (
    <label className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${
      selected ? 'bg-brand-500/20 border border-brand-500/50' : 'bg-slate-800/30 border border-slate-700/50 hover:bg-slate-700/30'
    }`}>
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        className="accent-brand-500 w-4 h-4"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono font-semibold text-slate-200">{call.ssrc_hex}</span>
          <span className="text-xs text-slate-500">{call.record_count} 条记录</span>
        </div>
        <div className="text-xs text-slate-500 truncate">
          {call.first_seen.slice(0, 16)} ~ {call.last_seen.slice(0, 16)}
        </div>
      </div>
    </label>
  )
}

export default function CallCompare() {
  const {
    calls,
    selectedCalls,
    callComparisons,
    callTrends,
    trendHours,
    loadCalls,
    loadCallComparisons,
    loadCallTrends,
    toggleCallSelection,
    setShowCompare,
    downloadPdfReport,
  } = useXrStore()

  const [activeTab, setActiveTab] = useState<'select' | 'chart' | 'compare'>('select')

  useEffect(() => {
    loadCalls()
  }, [])

  useEffect(() => {
    if (selectedCalls.length > 0) {
      loadCallComparisons()
      loadCallTrends()
    }
  }, [selectedCalls, trendHours])

  const chartData = {
    labels: callTrends[0]?.timestamps.map(formatTimestamp) || [],
    datasets: callTrends.map((trend, i) => ({
      label: `${trend.ssrc_hex} (MOS)`,
      data: trend.mos_scores,
      borderColor: COLORS[i % COLORS.length],
      backgroundColor: COLORS[i % COLORS.length] + '15',
      fill: false,
      tension: 0.4,
      pointRadius: 3,
      pointHoverRadius: 6,
      yAxisID: 'y',
      borderWidth: 2,
    })),
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          color: '#94a3b8',
          font: { family: '"Source Sans 3"', size: 11 },
          usePointStyle: true,
          pointStyle: 'circle' as const,
          padding: 15,
        },
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        titleColor: '#e2e8f0',
        bodyColor: '#cbd5e1',
        borderColor: '#334155',
        borderWidth: 1,
        cornerRadius: 8,
        padding: 12,
      },
    },
    scales: {
      x: {
        ticks: {
          color: '#64748b',
          font: { family: '"JetBrains Mono"', size: 10 },
          maxRotation: 45,
        },
        grid: { color: 'rgba(51, 65, 85, 0.3)' },
      },
      y: {
        type: 'linear' as const,
        min: 1,
        max: 4.5,
        title: {
          display: true,
          text: 'MOS 分',
          color: '#94a3b8',
          font: { family: '"Source Sans 3"', size: 12 },
        },
        ticks: {
          color: '#64748b',
          font: { family: '"JetBrains Mono"', size: 10 },
        },
        grid: { color: 'rgba(51, 65, 85, 0.3)' },
      },
    },
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/50 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center">
              <GitCompare size={16} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-100">多呼叫对比分析</h2>
              <p className="text-xs text-slate-500">
                选择多个呼叫进行质量对比，已选择 {selectedCalls.length} 个
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => downloadPdfReport()}
              className="flex items-center gap-2 px-3 py-2 bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 rounded-lg text-sm transition-colors"
            >
              <FileText size={14} />
              导出报告
            </button>
            <button
              onClick={() => setShowCompare(false)}
              className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-600/50 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex gap-1 px-6 py-3 border-b border-slate-700/30">
          {[
            { id: 'select', label: '选择呼叫', icon: BarChart3 },
            { id: 'chart', label: '趋势对比', icon: BarChart3 },
            { id: 'compare', label: '指标对比', icon: BarChart3 },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/25'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/30'
              }`}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto p-6">
          {activeTab === 'select' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {calls.slice(0, 12).map((call) => (
                <CallItem
                  key={call.ssrc}
                  call={call}
                  selected={selectedCalls.includes(call.ssrc)}
                  onToggle={() => toggleCallSelection(call.ssrc)}
                />
              ))}
            </div>
          )}

          {activeTab === 'chart' && (
            <div>
              {callTrends.length > 0 ? (
                <div className="h-80">
                  <Line data={chartData} options={chartOptions as any} />
                </div>
              ) : (
                <div className="h-80 flex items-center justify-center text-slate-500">
                  请先在"选择呼叫"标签中选择要对比的呼叫
                </div>
              )}
            </div>
          )}

          {activeTab === 'compare' && (
            <div>
              {callComparisons.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700/50">
                        <th className="text-left py-3 px-3 text-slate-400 font-medium">SSRC</th>
                        <th className="text-right py-3 px-3 text-slate-400 font-medium">平均丢包率</th>
                        <th className="text-right py-3 px-3 text-slate-400 font-medium">平均抖动</th>
                        <th className="text-right py-3 px-3 text-slate-400 font-medium">平均 MOS</th>
                        <th className="text-right py-3 px-3 text-slate-400 font-medium">最低 MOS</th>
                        <th className="text-right py-3 px-3 text-slate-400 font-medium">平均 R因子</th>
                        <th className="text-right py-3 px-3 text-slate-400 font-medium">记录数</th>
                      </tr>
                    </thead>
                    <tbody>
                      {callComparisons.map((comp, i) => (
                        <tr key={comp.ssrc} className="border-b border-slate-700/30 hover:bg-slate-800/30">
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                              <span className="font-mono text-slate-200">{comp.ssrc_hex}</span>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-amber-400">
                            {comp.avg_loss_rate.toFixed(2)}%
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-slate-300">
                            {comp.avg_jitter.toFixed(1)}ms
                          </td>
                          <td className={`py-3 px-3 text-right font-mono font-semibold ${mosLevel(comp.avg_mos_cq)}`}>
                            {comp.avg_mos_cq.toFixed(2)}
                          </td>
                          <td className={`py-3 px-3 text-right font-mono ${mosLevel(comp.min_mos_cq)}`}>
                            {comp.min_mos_cq.toFixed(2)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-slate-300">
                            {comp.avg_r_factor.toFixed(1)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-slate-400">
                            {comp.record_count}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="h-80 flex items-center justify-center text-slate-500">
                  请先在"选择呼叫"标签中选择要对比的呼叫
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
