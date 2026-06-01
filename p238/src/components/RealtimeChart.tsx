import { useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { useSensorStore } from '@/store/sensorStore'
import { Pause, Play, Download } from 'lucide-react'

const COLORS = {
  '/sensors/temperature': {
    stroke: '#f97316',
    fill: '#f97316',
  },
  '/sensors/humidity': {
    stroke: '#0ea5e9',
    fill: '#0ea5e9',
  },
}

const LABELS: Record<string, string> = {
  '/sensors/temperature': 'Temperature (°C)',
  '/sensors/humidity': 'Humidity (%)',
}

interface ChartDataPoint {
  time: string
  timestamp: number
  temperature?: number
  humidity?: number
}

export default function RealtimeChart() {
  const resources = useSensorStore((s) => s.resources)
  const paused = useSensorStore((s) => s.paused)
  const togglePause = useSensorStore((s) => s.togglePause)
  const exportAllCsv = useSensorStore((s) => s.exportAllCsv)

  const chartData = useMemo(() => {
    const tempHistory = resources['/sensors/temperature']?.history ?? []
    const humHistory = resources['/sensors/humidity']?.history ?? []

    const timeMap = new Map<number, ChartDataPoint>()

    for (const r of tempHistory) {
      const key = Math.floor(r.timestamp / 1000)
      if (!timeMap.has(key)) {
        timeMap.set(key, {
          time: new Date(r.timestamp).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
          timestamp: r.timestamp,
        })
      }
      timeMap.get(key)!.temperature = r.value
    }

    for (const r of humHistory) {
      const key = Math.floor(r.timestamp / 1000)
      if (!timeMap.has(key)) {
        timeMap.set(key, {
          time: new Date(r.timestamp).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
          timestamp: r.timestamp,
        })
      }
      timeMap.get(key)!.humidity = r.value
    }

    return Array.from(timeMap.values())
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-60)
  }, [resources])

  const allTempValues = chartData.map((d) => d.temperature).filter((v): v is number => v !== undefined)
  const allHumValues = chartData.map((d) => d.humidity).filter((v): v is number => v !== undefined)

  const yDomain = useMemo(() => {
    const allValues = [...allTempValues, ...allHumValues]
    if (allValues.length === 0) return [0, 100]
    const min = Math.min(...allValues)
    const max = Math.max(...allValues)
    const padding = (max - min) * 0.15 || 5
    return [Math.floor(min - padding), Math.ceil(max + padding)]
  }, [allTempValues, allHumValues])

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 shadow-lg">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-zinc-200">Real-time Monitor</h2>
          <p className="text-[11px] text-zinc-500">Sensor data via CoAP Observe</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={togglePause}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ring-1 transition-all ${
              paused
                ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20 hover:bg-emerald-500/20'
                : 'bg-zinc-800 text-zinc-400 ring-zinc-700 hover:bg-zinc-700'
            }`}
          >
            {paused ? (
              <>
                <Play className="h-3.5 w-3.5" />
                Resume
              </>
            ) : (
              <>
                <Pause className="h-3.5 w-3.5" />
                Pause
              </>
            )}
          </button>
          <button
            onClick={exportAllCsv}
            className="flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-400 ring-1 ring-zinc-700 transition-all hover:bg-zinc-700 hover:text-zinc-300"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="h-[340px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis
              dataKey="time"
              tick={{ fill: '#71717a', fontSize: 10 }}
              tickLine={{ stroke: '#3f3f46' }}
              axisLine={{ stroke: '#3f3f46' }}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={yDomain}
              tick={{ fill: '#71717a', fontSize: 10 }}
              tickLine={{ stroke: '#3f3f46' }}
              axisLine={{ stroke: '#3f3f46' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#18181b',
                border: '1px solid #3f3f46',
                borderRadius: '8px',
                fontSize: '12px',
                color: '#e4e4e7',
              }}
              labelStyle={{ color: '#a1a1aa' }}
            />
            <Legend
              wrapperStyle={{ fontSize: '12px' }}
              formatter={(value: string) => (
                <span style={{ color: '#a1a1aa' }}>{value}</span>
              )}
            />
            <Line
              type="monotone"
              dataKey="temperature"
              name={LABELS['/sensors/temperature']}
              stroke={COLORS['/sensors/temperature'].stroke}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
              animationDuration={300}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="humidity"
              name={LABELS['/sensors/humidity']}
              stroke={COLORS['/sensors/humidity'].stroke}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
              animationDuration={300}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
