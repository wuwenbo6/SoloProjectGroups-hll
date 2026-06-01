import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { useSimulatorStore } from '@/store'
import { RefreshCw, Download } from 'lucide-react'

const API_BASE = '/api'

export default function HistogramPanel() {
  const histogramData = useSimulatorStore((s) => s.histogramData)

  const chartData = useMemo(() => {
    if (!histogramData) return []
    return histogramData.buckets.map((count, i) => ({
      bucket: `${Math.round(histogramData.bucket_edges[i])}-${Math.round(histogramData.bucket_edges[i + 1])}`,
      range_start: histogramData.bucket_edges[i],
      range_end: histogramData.bucket_edges[i + 1],
      count,
    }))
  }, [histogramData])

  const handleReset = async () => {
    try {
      await fetch(`${API_BASE}/histogram/reset`, { method: 'POST' })
    } catch {}
  }

  const handleExport = async () => {
    try {
      const res = await fetch(`${API_BASE}/histogram`)
      const data = await res.json()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `latency-histogram-${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch {}
  }

  if (!histogramData || histogramData.total_samples === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-600">
        <div className="text-[10px] font-mono">暂无数据</div>
        <div className="text-[9px] font-mono mt-1">启动模拟后开始收集延迟数据</div>
      </div>
    )
  }

  const maxCount = Math.max(...histogramData.buckets, 1)

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-4">
          <StatCard label="总样本" value={histogramData.total_samples} />
          <StatCard label="最小 (ms)" value={histogramData.min_ms} />
          <StatCard label="平均 (ms)" value={histogramData.avg_ms} highlight />
          <StatCard label="最大 (ms)" value={histogramData.max_ms} />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono text-gray-400 hover:text-cyan-400 bg-[#1A1F2E] hover:bg-[#1A1F2E]/80 rounded-md transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            重置
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono text-gray-400 hover:text-cyan-400 bg-[#1A1F2E] hover:bg-[#1A1F2E]/80 rounded-md transition-colors"
          >
            <Download className="w-3 h-3" />
            导出
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-3">
        <PercentileCard label="P50 (ms)" value={histogramData.p50_ms} color="cyan" />
        <PercentileCard label="P95 (ms)" value={histogramData.p95_ms} color="amber" />
        <PercentileCard label="P99 (ms)" value={histogramData.p99_ms} color="rose" />
      </div>

      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1A1F2E" />
            <XAxis
              dataKey="bucket"
              tick={{ fill: '#4B5563', fontSize: 9, fontFamily: 'monospace' }}
              axisLine={{ stroke: '#1A1F2E' }}
              tickLine={{ stroke: '#1A1F2E' }}
            />
            <YAxis
              tick={{ fill: '#4B5563', fontSize: 9, fontFamily: 'monospace' }}
              axisLine={{ stroke: '#1A1F2E' }}
              tickLine={{ stroke: '#1A1F2E' }}
              width={30}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0D1117',
                border: '1px solid #1A1F2E',
                borderRadius: '6px',
                fontSize: '10px',
                fontFamily: 'monospace',
              }}
              labelStyle={{ color: '#9CA3AF', marginBottom: '4px' }}
              itemStyle={{ color: '#00F0FF' }}
              formatter={(value: number) => [`${value} 次`, '请求数']}
              labelFormatter={(label: string) => `延迟范围: ${label} ms`}
            />
            <Bar dataKey="count" radius={[2, 2, 0, 0]}>
              {chartData.map((entry, index) => {
                const ratio = entry.count / maxCount
                const opacity = 0.4 + ratio * 0.6
                return <Cell key={index} fill={`rgba(0, 240, 255, ${opacity})`} />
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="text-[9px] font-mono text-gray-600 text-center mt-2">
        延迟范围 (ms) · 同步延迟分布直方图
      </div>
    </div>
  )
}

function StatCard({ label, value, highlight = false }: { label: string; value: number | string; highlight?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] font-mono text-gray-600">{label}</span>
      <span className={`text-sm font-mono font-bold ${highlight ? 'text-cyan-400' : 'text-gray-400'}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </span>
    </div>
  )
}

function PercentileCard({ label, value, color }: { label: string; value: number; color: 'cyan' | 'amber' | 'rose' }) {
  const colorClasses = {
    cyan: 'text-cyan-400 border-cyan-400/20',
    amber: 'text-amber-400 border-amber-400/20',
    rose: 'text-rose-400 border-rose-400/20',
  }
  return (
    <div className={`px-3 py-1.5 rounded-md border ${colorClasses[color]}`}>
      <span className="text-[9px] font-mono text-gray-500 block">{label}</span>
      <span className={`text-base font-mono font-bold ${colorClasses[color].split(' ')[0]}`}>{value}</span>
    </div>
  )
}
