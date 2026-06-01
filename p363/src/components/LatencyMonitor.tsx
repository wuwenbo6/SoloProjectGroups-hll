import { useSimulatorStore } from '@/store'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts'
import { Wifi } from 'lucide-react'

function LatencyGauge({ value, label, unit, color }: { value: number; label: string; unit: string; color: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] text-gray-500 font-mono">{label}</span>
      <span className="text-lg font-mono font-bold" style={{ color }}>
        {value.toFixed(1)}
      </span>
      <span className="text-[9px] text-gray-600 font-mono">{unit}</span>
    </div>
  )
}

export default function LatencyMonitor() {
  const latencyHistory = useSimulatorStore((s) => s.latencyHistory)
  const config = useSimulatorStore((s) => s.config)

  if (latencyHistory.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-gray-600 text-sm">
        <Wifi className="w-4 h-4 mr-2" />
        等待延迟数据
      </div>
    )
  }

  const latest = latencyHistory[latencyHistory.length - 1]
  const chartData = latencyHistory.map((d, i) => ({
    idx: i,
    rtt: d.base_ms + d.jitter_ms,
    jitter: Math.abs(d.jitter_ms),
  }))

  const rttColor = latest ? (latest.base_ms + latest.jitter_ms > 70 ? '#FF4D4D' : latest.base_ms + latest.jitter_ms > 50 ? '#FFB800' : '#00FF88') : '#00FF88'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-around px-4">
        <LatencyGauge value={latest.base_ms + latest.jitter_ms} label="RTT" unit="ms" color={rttColor} />
        <LatencyGauge value={Math.abs(latest.jitter_ms)} label="抖动" unit="ms" color="#FFB800" />
        <LatencyGauge value={latest.packet_loss_rate * 100} label="丢包率" unit="%" color="#FF4D4D" />
        <LatencyGauge value={latest.bandwidth_mbs} label="带宽" unit="MB/s" color="#00F0FF" />
      </div>
      <div className="h-32">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
            <defs>
              <linearGradient id="rttGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00F0FF" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#00F0FF" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="idx" hide />
            <YAxis domain={[0, 120]} hide />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1A1F2E',
                border: '1px solid #2A2F3E',
                borderRadius: '6px',
                fontSize: '10px',
                fontFamily: 'monospace',
              }}
              labelStyle={{ color: '#666' }}
              itemStyle={{ color: '#00F0FF' }}
            />
            <Area
              type="monotone"
              dataKey="rtt"
              stroke="#00F0FF"
              strokeWidth={1.5}
              fill="url(#rttGrad)"
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center justify-between px-2 text-[9px] font-mono text-gray-600">
        <span>延迟区间:</span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-emerald-400 inline-block" /> &lt;50ms</span>
          <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-amber-400 inline-block" /> 50-70ms</span>
          <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-red-400 inline-block" /> &gt;70ms</span>
        </div>
      </div>
    </div>
  )
}
