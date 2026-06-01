import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { useDpdkStore, type SimResult } from '../store/dpdkStore'

function formatNs(value: number): string {
  if (value < 1000) return `${value.toFixed(0)}ns`
  if (value < 1000000) return `${(value / 1000).toFixed(2)}μs`
  return `${(value / 1000000).toFixed(2)}ms`
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  return (
    <div
      className='rounded-lg px-3 py-2 text-xs font-mono border'
      style={{
        background: 'var(--bg-card)',
        borderColor: 'var(--border)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
      }}
    >
      <div style={{ color: 'var(--text-secondary)' }}>
        报文大小: {payload[0]?.payload?.size} bytes
      </div>
      {payload.map((entry: any, idx: number) => (
        <div key={idx} style={{ color: entry.color }}>
          {entry.name}: {formatNs(entry.value)}
        </div>
      ))}
    </div>
  )
}

export default function MultiSizeChart() {
  const { multiSizeResults, selectedPacketSize, setSelectedPacketSize, setResult } = useDpdkStore()

  if (multiSizeResults.length === 0) return null

  const chartData = multiSizeResults.map((r: SimResult) => ({
    size: r.config.packetSize,
    Mean: r.stats.mean,
    P50: r.stats.p50,
    P99: r.stats.p99,
  }))

  const handleSizeClick = (size: number) => {
    setSelectedPacketSize(size)
    const result = multiSizeResults.find((r) => r.config.packetSize === size)
    if (result) {
      setResult(result)
    }
  }

  return (
    <div
      className='rounded-xl border p-5 space-y-4'
      style={{
        background: 'var(--bg-card)',
        borderColor: 'var(--border)',
      }}
    >
      <div className='flex items-center justify-between'>
        <h2 className='text-sm font-semibold tracking-wider uppercase' style={{ color: 'var(--accent-cyan)' }}>
          多尺寸延迟对比
        </h2>
      </div>

      <div style={{ height: 300 }}>
        <ResponsiveContainer width='100%' height='100%'>
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray='3 3' stroke='#1e2d3d' />
            <XAxis
              dataKey='size'
              tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'JetBrains Mono' }}
              axisLine={{ stroke: '#1e2d3d' }}
              tickLine={{ stroke: '#1e2d3d' }}
              label={{ value: 'Packet Size (bytes)', position: 'insideBottom', offset: -5, fill: '#94a3b8', fontSize: 10 }}
            />
            <YAxis
              tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'JetBrains Mono' }}
              axisLine={{ stroke: '#1e2d3d' }}
              tickLine={{ stroke: '#1e2d3d' }}
              tickFormatter={(value) => formatNs(value)}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 10, fontFamily: 'JetBrains Mono' }}
              formatter={(value) => <span style={{ color: '#94a3b8' }}>{value}</span>}
            />
            <Line
              type='monotone'
              dataKey='Mean'
              stroke='#22d3ee'
              strokeWidth={2}
              dot={{ fill: '#22d3ee', strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6, fill: '#22d3ee' }}
            />
            <Line
              type='monotone'
              dataKey='P50'
              stroke='#22c55e'
              strokeWidth={2}
              dot={{ fill: '#22c55e', strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6, fill: '#22c55e' }}
            />
            <Line
              type='monotone'
              dataKey='P99'
              stroke='#f97316'
              strokeWidth={2}
              dot={{ fill: '#f97316', strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6, fill: '#f97316' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className='flex flex-wrap gap-2 justify-center pt-2'>
        {multiSizeResults.map((r: SimResult) => {
          const size = r.config.packetSize
          const isSelected = selectedPacketSize === size
          return (
            <button
              key={size}
              onClick={() => handleSizeClick(size)}
              className='px-3 py-1.5 rounded-lg text-xs font-mono transition-all hover:scale-[1.05]'
              style={{
                background: isSelected ? 'var(--accent-cyan)' : 'var(--bg-deep)',
                color: isSelected ? '#000' : 'var(--text-secondary)',
                border: '1px solid',
                borderColor: isSelected ? 'var(--accent-cyan)' : 'var(--border)',
              }}
            >
              {size} bytes
            </button>
          )
        })}
      </div>
    </div>
  )
}
