import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts'
import { useDpdkStore, type HistogramBucket } from '../store/dpdkStore'

function formatNs(value: number): string {
  if (value < 1000) return `${value.toFixed(0)}ns`
  if (value < 1000000) return `${(value / 1000).toFixed(2)}μs`
  return `${(value / 1000000).toFixed(2)}ms`
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs font-mono border"
      style={{
        background: 'var(--bg-card)',
        borderColor: 'var(--border)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
      }}
    >
      <div style={{ color: 'var(--text-secondary)' }}>
        延迟范围: {formatNs(d.start)} - {formatNs(d.end)}
      </div>
      <div style={{ color: 'var(--accent-cyan)' }}>
        报文数: {d.count}
      </div>
    </div>
  )
}

export default function LatencyHistogram() {
  const { result, status } = useDpdkStore()

  if (status === 'running') {
    return (
      <div
        className="rounded-xl border flex items-center justify-center"
        style={{
          background: 'var(--bg-card)',
          borderColor: 'var(--border)',
          height: 420,
        }}
      >
        <div className="text-center space-y-3">
          <div className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin mx-auto" style={{ borderColor: 'var(--accent-cyan)', borderTopColor: 'transparent' }} />
          <p className="text-sm font-mono" style={{ color: 'var(--text-secondary)' }}>模拟运行中...</p>
        </div>
      </div>
    )
  }

  if (!result) {
    return (
      <div
        className="rounded-xl border flex items-center justify-center"
        style={{
          background: 'var(--bg-card)',
          borderColor: 'var(--border)',
          height: 420,
        }}
      >
        <div className="text-center space-y-2">
          <div className="text-4xl opacity-20">📊</div>
          <p className="text-sm" style={{ color: 'var(--text-dim)' }}>配置参数后启动测试以查看延迟分布</p>
        </div>
      </div>
    )
  }

  const { buckets } = result.histogram
  const { stats } = result
  const maxCount = Math.max(...buckets.map((b: HistogramBucket) => b.count))

  const chartData = buckets.map((b: HistogramBucket) => ({
    ...b,
    label: formatNs((b.start + b.end) / 2),
    mid: (b.start + b.end) / 2,
  }))

  const percentileLines = [
    { value: stats.p50, label: 'P50', color: '#22c55e' },
    { value: stats.p90, label: 'P90', color: '#eab308' },
    { value: stats.p99, label: 'P99', color: '#f97316' },
    { value: stats.p999, label: 'P99.9', color: '#ef4444' },
  ]

  return (
    <div
      className="rounded-xl border p-5 space-y-4"
      style={{
        background: 'var(--bg-card)',
        borderColor: 'var(--border)',
      }}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wider uppercase" style={{ color: 'var(--accent-cyan)' }}>
          延迟分布直方图
        </h2>
        <div className="flex items-center gap-3 text-[10px] font-mono">
          {percentileLines.map((p) => (
            <span key={p.label} className="flex items-center gap-1">
              <span className="w-2 h-0.5 inline-block" style={{ background: p.color }} />
              <span style={{ color: p.color }}>{p.label}: {formatNs(p.value)}</span>
            </span>
          ))}
        </div>
      </div>

      <div style={{ height: 340 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2d3d" />
            <XAxis
              dataKey="label"
              tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'JetBrains Mono' }}
              interval={Math.floor(chartData.length / 8)}
              axisLine={{ stroke: '#1e2d3d' }}
              tickLine={{ stroke: '#1e2d3d' }}
            />
            <YAxis
              tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'JetBrains Mono' }}
              axisLine={{ stroke: '#1e2d3d' }}
              tickLine={{ stroke: '#1e2d3d' }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="count" radius={[2, 2, 0, 0]} maxBarSize={28}>
              {chartData.map((entry: any, idx: number) => {
                const intensity = maxCount > 0 ? entry.count / maxCount : 0
                const r = Math.round(34 + intensity * 0)
                const g = Math.round(50 + intensity * 161)
                const b = Math.round(70 + intensity * 168)
                return <Cell key={idx} fill={`rgb(${r},${g},${b})`} />
              })}
            </Bar>
            {percentileLines.map((p) => (
              <ReferenceLine
                key={p.label}
                x={formatNs(p.value)}
                stroke={p.color}
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{
                  value: p.label,
                  position: 'top',
                  fill: p.color,
                  fontSize: 10,
                  fontFamily: 'JetBrains Mono',
                }}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
